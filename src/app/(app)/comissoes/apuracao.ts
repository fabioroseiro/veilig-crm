import { sql } from "drizzle-orm";

/**
 * Apuração de comissão por vendedor, num período.
 *
 * Lê do ESPELHO de cobranças, não da Asaas: é o que permite competência,
 * caixa e histórico sem depender de rede.
 *
 * ── Os dois regimes ──────────────────────────────────────────────────────
 *
 * COMPETÊNCIA (`paga_em`): quando o cliente pagou. É a base da comissão — o
 * vendedor fez por merecer no dia em que o dinheiro saiu do cliente.
 *
 * CAIXA (`compensada_em`): quando o dinheiro fica disponível na conta. Cartão
 * demora; boleto e Pix, não. Serve para o cliente saber o que já entrou.
 *
 * A diferença entre os dois é o que está "a receber".
 */
export type LinhaApuracao = {
  vendedorId: string;
  vendedor: string;
  loja: string | null;
  /** Mensalidades pagas no período (competência). */
  qtdPagas: number;
  valorCompetencia: number;
  valorLiquidoCompetencia: number;
  /** Do que foi pago, quanto já caiu na conta. */
  qtdCompensadas: number;
  valorCaixa: number;
};

/**
 * PRIMEIRA = só a mensalidade que formou o contrato. O vendedor ganha uma vez
 * pela venda.
 *
 * RECORRENTE = todas as mensalidades pagas no período, incluindo as de
 * contratos antigos. O vendedor ganha enquanto o cliente pagar.
 *
 * A distinção é a primeira cobrança da assinatura, identificada pelo menor
 * vencimento — não pela data de pagamento, que pode estar fora de ordem se o
 * cliente atrasou uma e pagou a seguinte antes.
 */
export type ModeloComissao = "recorrente" | "primeira";

export async function apurarComissoes(
  tx: any,
  inicio: string,
  fim: string,
  modelo: ModeloComissao = "recorrente",
  /** Null = todos (só acontece se não houver grupo cadastrado). */
  grupoId: string | null = null
): Promise<{ linhas: LinhaApuracao[]; foraDaApuracao: { qtd: number; valor: number } }> {
  const soPrimeira = modelo === "primeira";
  // Uma consulta só, agrupada no banco. Trazer as cobranças e somar em
  // JavaScript funcionaria hoje, com 30 linhas, e não com 30 mil.
  const r = await tx.execute(sql`
    SELECT
      c.vendedor_id,
      u.nome  AS vendedor,
      st.nome_fantasia AS loja,
      count(*) FILTER (WHERE c.paga_em::date BETWEEN ${inicio}::date AND ${fim}::date)  AS qtd_pagas,
      coalesce(sum(c.valor)         FILTER (WHERE c.paga_em::date BETWEEN ${inicio}::date AND ${fim}::date), 0) AS valor_competencia,
      coalesce(sum(c.valor_liquido) FILTER (WHERE c.paga_em::date BETWEEN ${inicio}::date AND ${fim}::date), 0) AS liquido_competencia,
      count(*) FILTER (WHERE c.compensada_em::date BETWEEN ${inicio}::date AND ${fim}::date) AS qtd_compensadas,
      coalesce(sum(c.valor)         FILTER (WHERE c.compensada_em::date BETWEEN ${inicio}::date AND ${fim}::date), 0) AS valor_caixa
    FROM cobranca c
    JOIN app_user u ON u.id = c.vendedor_id
    LEFT JOIN store st ON st.id = c.store_id
    -- Assinatura estornada sai da apuração: o dinheiro voltou ao cliente, e
    -- comissionar sobre venda desfeita é pagar a mais. A coluna cancelada_em
    -- da cobrança não cobre isso: ela foi paga de verdade, e só depois
    -- devolvida.
    LEFT JOIN subscription s ON s.id = c.subscription_id
    WHERE c.vendedor_id IS NOT NULL
      AND c.cancelada_em IS NULL
      AND s.estornada_em IS NULL
      -- Um grupo por vez: misturar grupos daria um total que não corresponde
      -- ao que nenhum cliente vê.
      AND (${grupoId}::uuid IS NULL OR c.group_id = ${grupoId}::uuid)
      AND (
        c.paga_em::date BETWEEN ${inicio}::date AND ${fim}::date
        OR c.compensada_em::date BETWEEN ${inicio}::date AND ${fim}::date
      )
      AND (
        ${!soPrimeira}
        OR c.vencimento = (
          SELECT min(c2.vencimento) FROM cobranca c2
          WHERE c2.subscription_id = c.subscription_id
        )
      )
    GROUP BY c.vendedor_id, u.nome, st.nome_fantasia
    ORDER BY valor_competencia DESC
  `);

  const linhas = ((Array.isArray(r) ? r : (r as any).rows) as any[]).map((l) => ({
    vendedorId: l.vendedor_id,
    vendedor: l.vendedor,
    loja: l.loja,
    qtdPagas: Number(l.qtd_pagas) || 0,
    valorCompetencia: Number(l.valor_competencia) || 0,
    valorLiquidoCompetencia: Number(l.liquido_competencia) || 0,
    qtdCompensadas: Number(l.qtd_compensadas) || 0,
    valorCaixa: Number(l.valor_caixa) || 0,
  }));

  // O que ficou de FORA: pagamentos do período sem vendedor comissionável —
  // vendas de gestores e da administração. Sem mostrar isso, o grupo compara
  // com o faturamento e acha que falta dinheiro.
  const rf = await tx.execute(sql`
    SELECT count(*) AS qtd, coalesce(sum(valor), 0) AS valor
    FROM cobranca
    WHERE vendedor_id IS NULL
      AND cancelada_em IS NULL
      AND (${grupoId}::uuid IS NULL OR group_id = ${grupoId}::uuid)
      AND paga_em::date BETWEEN ${inicio}::date AND ${fim}::date
  `);
  const lf = (Array.isArray(rf) ? rf : (rf as any).rows)[0] as any;

  return {
    linhas,
    foraDaApuracao: { qtd: Number(lf?.qtd) || 0, valor: Number(lf?.valor) || 0 },
  };
}
