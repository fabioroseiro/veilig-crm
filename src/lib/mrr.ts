import { sql } from "drizzle-orm";

/**
 * RECEITA RECORRENTE (MRR) — a base ativa, não as vendas do mês.
 *
 * O painel mostrava "fee das vendas do mês" e "fee acumulado", que são coisas
 * diferentes: a primeira ignora quem já era cliente, a segunda soma dinheiro
 * de meses que já passaram. Nenhuma das duas responde "quanto entra por mês
 * hoje" nem "está crescendo?".
 *
 * A reconstrução histórica é EXATA, não estimativa: `preco_contratado` é
 * congelado na venda e nunca muda, então a receita de qualquer mês passado é a
 * soma das assinaturas que já existiam naquele mês e ainda não tinham sido
 * canceladas.
 *
 * (Quando o reajuste anual existir, o preço deixará de ser imutável e esta
 * conta vai precisar de uma tabela de histórico de preço.)
 */

export type PontoMRR = {
  mes: string;        // "2026-08"
  rotulo: string;     // "ago/26"
  mrr: number;        // receita recorrente da base ativa no fim do mês
  receitaVeilig: number; // parcela da Veilig (fee) sobre esse MRR
  ativas: number;     // assinaturas vigentes no fim do mês
  novas: number;      // entraram no mês
  canceladas: number; // saíram no mês
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function rotuloDoMes(iso: string): string {
  const [ano, mes] = iso.split("-");
  return `${MESES[Number(mes) - 1]}/${ano.slice(2)}`;
}

/**
 * Série dos últimos N meses.
 *
 * Roda dentro de withTenant(), então o RLS já limita ao tenant de quem está
 * olhando — o mesmo código serve Veilig, grupo e loja sem filtro extra.
 *
 * `filtroLoja` existe para o painel do gestor, que precisa recortar uma loja
 * específica dentro do que o RLS já permite.
 */
export async function serieMRR(
  tx: any,
  opcoes: { meses?: number; storeId?: string } = {}
): Promise<PontoMRR[]> {
  const n = opcoes.meses ?? 12;
  const filtroLoja = opcoes.storeId
    ? sql`AND s.store_id = ${opcoes.storeId}::uuid`
    : sql``;

  // Uma consulta só, com a régua de meses gerada no banco. Fazer isto em
  // JavaScript exigiria carregar todas as assinaturas na memória — o mesmo
  // erro que as listas cometiam antes da paginação.
  const r = await tx.execute(sql`
    WITH meses AS (
      SELECT generate_series(
        date_trunc('month', now()) - (${n - 1} || ' months')::interval,
        date_trunc('month', now()),
        interval '1 month'
      ) AS inicio
    ),
    base AS (
      SELECT
        s.preco_contratado::numeric AS preco,
        s.created_at,
        s.cancelada_em,
        COALESCE(st.fee_percent_override, g.fee_percent_padrao, 8)::numeric AS fee
      FROM subscription s
      LEFT JOIN store st ON st.id = s.store_id
      LEFT JOIN "group" g ON g.id = s.group_id
      WHERE 1 = 1 ${filtroLoja}
    )
    SELECT
      to_char(m.inicio, 'YYYY-MM') AS mes,
      COALESCE(SUM(b.preco) FILTER (
        WHERE b.created_at < m.inicio + interval '1 month'
          AND (b.cancelada_em IS NULL OR b.cancelada_em >= m.inicio + interval '1 month')
      ), 0)::float8 AS mrr,
      COALESCE(SUM(b.preco * b.fee / 100) FILTER (
        WHERE b.created_at < m.inicio + interval '1 month'
          AND (b.cancelada_em IS NULL OR b.cancelada_em >= m.inicio + interval '1 month')
      ), 0)::float8 AS receita_veilig,
      COUNT(b.preco) FILTER (
        WHERE b.created_at < m.inicio + interval '1 month'
          AND (b.cancelada_em IS NULL OR b.cancelada_em >= m.inicio + interval '1 month')
      )::int AS ativas,
      COUNT(b.preco) FILTER (
        WHERE b.created_at >= m.inicio
          AND b.created_at < m.inicio + interval '1 month'
      )::int AS novas,
      COUNT(b.preco) FILTER (
        WHERE b.cancelada_em >= m.inicio
          AND b.cancelada_em < m.inicio + interval '1 month'
      )::int AS canceladas
    FROM meses m
    LEFT JOIN base b ON true
    GROUP BY m.inicio
    ORDER BY m.inicio
  `);

  const linhas = (Array.isArray(r) ? r : (r as any).rows) as any[];
  return linhas.map((l) => ({
    mes: l.mes,
    rotulo: rotuloDoMes(l.mes),
    mrr: Number(l.mrr) || 0,
    receitaVeilig: Number(l.receita_veilig) || 0,
    ativas: Number(l.ativas) || 0,
    novas: Number(l.novas) || 0,
    canceladas: Number(l.canceladas) || 0,
  }));
}

export type ResumoMRR = {
  atual: PontoMRR | null;
  anterior: PontoMRR | null;
  /** variação % do MRR contra o mês anterior; null quando não há base */
  crescimentoPct: number | null;
  /** variação em reais */
  crescimentoValor: number;
  /** % da base que cancelou no mês; null quando não havia base */
  churnPct: number | null;
  serie: PontoMRR[];
};

export function resumirMRR(serie: PontoMRR[]): ResumoMRR {
  const atual = serie[serie.length - 1] ?? null;
  const anterior = serie[serie.length - 2] ?? null;

  // Sem mês anterior, ou com base zerada, "crescimento" não significa nada.
  // Mostrar 0% ou 100% nesse caso seria inventar informação — devolvemos null
  // e a tela diz que ainda não há histórico.
  const crescimentoPct =
    anterior && anterior.mrr > 0 && atual
      ? ((atual.mrr - anterior.mrr) / anterior.mrr) * 100
      : null;

  const crescimentoValor = atual && anterior ? atual.mrr - anterior.mrr : 0;

  const churnPct =
    anterior && anterior.ativas > 0 && atual
      ? (atual.canceladas / anterior.ativas) * 100
      : null;

  return { atual, anterior, crescimentoPct, crescimentoValor, churnPct, serie };
}

/**
 * Passagens na loja no mês corrente, e média por assinatura vigente.
 *
 * É o começo da prova da tese: o plano existe para trazer o cliente de volta,
 * e hoje as lojas perdem 40-50% deles na segunda revisão.
 *
 * Limite honesto: isto mede quem TEM plano. Comparar com quem não tem exigiria
 * que a concessionária alimentasse as visitas dos dois grupos, o que é outro
 * escopo. O que dá para afirmar aqui é a frequência da base com plano.
 */
export async function passagensDoMes(
  tx: any,
  opcoes: { storeId?: string } = {}
): Promise<{ mes: number; total: number; mediaPorAssinatura: number }> {
  const filtroLoja = opcoes.storeId ? sql`AND p.store_id = ${opcoes.storeId}::uuid` : sql``;
  const filtroSub = opcoes.storeId ? sql`AND s.store_id = ${opcoes.storeId}::uuid` : sql``;

  const r = await tx.execute(sql`
    SELECT
      (SELECT count(*)::int FROM passagem_loja p
        WHERE p.created_at >= date_trunc('month', now()) ${filtroLoja}) AS mes,
      (SELECT count(*)::int FROM passagem_loja p WHERE 1=1 ${filtroLoja}) AS total,
      (SELECT count(*)::int FROM subscription s
        WHERE s.status <> 'cancelada' ${filtroSub}) AS vigentes
  `);
  const l = (Array.isArray(r) ? r : (r as any).rows)[0] ?? {};
  const vigentes = Number(l.vigentes ?? 0);
  const total = Number(l.total ?? 0);
  return {
    mes: Number(l.mes ?? 0),
    total,
    mediaPorAssinatura: vigentes > 0 ? total / vigentes : 0,
  };
}

export function brl(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function pct(n: number): string {
  const sinal = n > 0 ? "+" : "";
  return `${sinal}${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
