import { db } from "@/db";
import { sql } from "drizzle-orm";
import { cobrancasEmAbertoAsaas, excluirCobrancaAsaas, cancelarAssinaturaAsaas } from "@/lib/asaas";
import { decidir } from "@/lib/regua-inadimplencia";
import { processarEmLotes } from "@/lib/lotes";

/**
 * Executa a régua de inadimplência (Cláusulas 9.1 e 9.3).
 *
 * Roda no cron diário, junto com o ressync. Para cada assinatura vigente,
 * consulta o saldo real na Asaas e aplica a decisão.
 *
 * ── Por que em lotes, com orçamento de tempo ─────────────────────────────
 *
 * Mesma razão do ressync: a ~120 assinaturas, o processamento serial era morto
 * por tempo EM SILÊNCIO — nada quebrava, a régua simplesmente parava de rodar.
 * Com orçamento, o que sobra é reportado e entra na execução do dia seguinte.
 *
 * ── Em caso de dúvida, não age ───────────────────────────────────────────
 *
 * Se a consulta à Asaas falhar, a assinatura é PULADA. Suspender por falha de
 * rede seria cortar o serviço de quem está em dia — e o cliente descobriria no
 * balcão.
 */
export async function executarRegua(): Promise<{
  verificadas: number;
  canceladas: number;
  falhas: number;
  cobrancasExcluidas: number;
  cobrancasPendentes: number;
  restantes: number;
  mensagem: string;
  diagResiduais?: string[];
}> {
  const r = await db.execute(sql`SELECT * FROM assinaturas_para_regua()`);
  const linhas = (Array.isArray(r) ? r : (r as any).rows) as any[];

  let verificadas = 0, canceladas = 0;
  let falhas = 0, cobrancasExcluidas = 0, cobrancasPendentes = 0;
  const hoje = new Date();

  const { restantes } = await processarEmLotes(
    linhas,
    async (s: any) => {
      verificadas++;

      const aberto = await cobrancasEmAbertoAsaas(s.asaas_subscription_id);
      if (aberto === null) {
        falhas++;
        return; // dúvida: não age
      }

      const acao = decidir(
        {
          status: s.status,
          vencidoDesde: aberto.maisAntigo ? new Date(aberto.maisAntigo + "T00:00:00") : null,
          // VENCIDAS, não todas: uma cobrança futura não é dívida, e usá-la
          // aqui cancelaria contrato de quem está em dia.
          temSaldoDevedor: aberto.vencidas.length > 0,
          canceladaPorInadimplencia: false,
          diasCancelamento: Number(s.dias_cancelamento) || 60,
        },
        hoje
      );

      try {
        if (acao === "cancelar") {
          // ORDEM IMPORTA: avisa a Asaas primeiro para parar de gerar novas
          // mensalidades. Se falhar aqui, não cancelamos no banco — o mesmo
          // padrão do cancelamento voluntário.
          await cancelarAssinaturaAsaas(s.asaas_subscription_id);

          // 9.3 — apaga TODAS as cobranças em aberto, vencidas e futuras.
          //
          // Cancelar a assinatura só impede novas: as já geradas continuam, e o
          // cliente receberia boleto de um plano que não existe mais.
          //
          // Cada falha vira pendência com nova tentativa; NÃO impede o
          // cancelamento, porque o contrato diz que o plano está cancelado.
          for (const p of aberto.pagamentos) {
            try {
              await excluirCobrancaAsaas(p.id);
              await db.execute(sql`SELECT marcar_exclusao_resolvida(${p.id})`);
              cobrancasExcluidas++;
            } catch (e: any) {
              await db.execute(
                sql`SELECT registrar_falha_exclusao(
                      ${s.id}::uuid, ${p.id}, ${p.valor}, ${p.vencimento}::date,
                      ${String(e?.message ?? "erro desconhecido")}
                    )`
              );
              cobrancasPendentes++;
            }
          }

          await db.execute(
            sql`SELECT cancelar_por_inadimplencia(${s.id}::uuid, ${aberto.maisAntigo}::date)`
          );
          canceladas++;
        }
      } catch (e: any) {
        console.error("[REGUA] falha ao aplicar", acao, "em", s.id, ":", e?.message);
        falhas++;
      }
    },
    { tamanhoLote: 8, orcamentoMs: 240_000 }
  );

  const partes = [`${verificadas} verificada(s)`];
  if (canceladas) partes.push(`${canceladas} cancelada(s) por inadimplência`);
  if (cobrancasExcluidas) partes.push(`${cobrancasExcluidas} cobrança(s) excluída(s)`);
  if (cobrancasPendentes) partes.push(`${cobrancasPendentes} exclusão(ões) pendente(s)`);
  if (falhas) partes.push(`${falhas} falha(s)`);
  if (restantes) partes.push(`${restantes} ficaram para amanhã`);

  // Varre as já canceladas atrás de cobrança que sobrou — inclusive as que
  // nunca chegaram a ser tentadas, e que por isso não viraram pendência.
  const residuais = await limparCobrancasResiduais();
  if (residuais.apagadas > 0) {
    cobrancasExcluidas += residuais.apagadas;
    partes.push(`${residuais.apagadas} residual(is) apagada(s)`);
  }
  if (residuais.pendentes > 0) {
    cobrancasPendentes += residuais.pendentes;
    partes.push(`${residuais.pendentes} residual(is) com falha`);
  }

  return {
    verificadas, canceladas, falhas,
    cobrancasExcluidas, cobrancasPendentes, restantes,
    mensagem: partes.join(" · "),
    diagResiduais: residuais.diag,
  };
}

/**
 * Cobranças que sobraram em assinaturas JÁ canceladas por inadimplência.
 *
 * A régua ignora quem já está cancelada — e está certa, senão reprocessaria
 * tudo todo dia. Mas isso cria um ponto cego: uma cobrança que nunca chegou a
 * ser tentada não vira pendência, e ninguém volta nela.
 *
 * Foi exatamente o que aconteceu quando a versão anterior só listava as
 * vencidas: as futuras ficaram na Asaas, sem registro, e o cliente receberia
 * boleto de um plano cancelado.
 *
 * Esta varredura fecha isso: confere as canceladas por inadimplência dos
 * últimos 90 dias e apaga o que sobrou. Custa uma consulta por assinatura, mas
 * roda uma vez ao dia e sobre um conjunto pequeno.
 */
async function limparCobrancasResiduais(): Promise<{
  apagadas: number;
  pendentes: number;
  /** Diagnóstico: sai na resposta do cron, para não depender do log. */
  diag: string[];
}> {
  let apagadas = 0;
  let pendentes = 0;
  const diag: string[] = [];

  try {
    // Função SECURITY DEFINER, não consulta direta.
    //
    // O cron roda SEM contexto de tenant. Lendo `subscription` direto, o RLS
    // bloqueia e a consulta volta vazia — a varredura não fazia nada, sem erro
    // e sem mensagem. Mesma armadilha do portal, do contrato e da checagem de
    // isenção.
    const r = await db.execute(sql`SELECT * FROM canceladas_com_possivel_residuo()`);
    const linhas = (Array.isArray(r) ? r : (r as any).rows) as any[];
    diag.push(`${linhas.length} cancelada(s) a varrer`);

    for (const s of linhas) {
      const aberto = await cobrancasEmAbertoAsaas(s.asaas_subscription_id);
      if (!aberto) {
        diag.push(`${s.asaas_subscription_id}: consulta à Asaas falhou`);
        continue;
      }
      if (aberto.pagamentos.length === 0) {
        diag.push(`${s.asaas_subscription_id}: nenhuma cobrança em aberto`);
        continue;
      }
      diag.push(`${s.asaas_subscription_id}: ${aberto.pagamentos.length} em aberto`);

      for (const p of aberto.pagamentos) {
        try {
          await excluirCobrancaAsaas(p.id);
          await db.execute(sql`SELECT marcar_exclusao_resolvida(${p.id})`);
          apagadas++;
        } catch (e: any) {
          diag.push(`erro ao apagar ${p.id}: ${String(e?.message ?? "?")}`);
          await db.execute(
            sql`SELECT registrar_falha_exclusao(
                  ${s.id}::uuid, ${p.id}, ${p.valor}, ${p.vencimento}::date,
                  ${String(e?.message ?? "erro desconhecido")}
                )`
          );
          pendentes++;
        }
      }
    }
  } catch (e: any) {
    diag.push(`varredura estourou: ${String(e?.message ?? "?")}`);
    console.error("[REGUA] falha na varredura residual:", e?.message);
  }

  return { apagadas, pendentes, diag };
}

/**
 * Nova tentativa de excluir cobranças que falharam.
 *
 * Para em 3 tentativas: se falhou três vezes, não vai resolver sozinho, e
 * insistir para sempre esconderia o problema. A partir daí, alerta na tela.
 */
export async function retentarExclusoes(): Promise<{ resolvidas: number; falhas: number }> {
  const r = await db.execute(
    sql`SELECT id, asaas_payment_id, tentativas
        FROM cobranca_pendente_exclusao
        WHERE resolvida_em IS NULL AND tentativas < 3
        ORDER BY ultima_tentativa
        LIMIT 50`
  );
  const linhas = (Array.isArray(r) ? r : (r as any).rows) as any[];

  let resolvidas = 0, falhas = 0;
  for (const l of linhas) {
    try {
      await excluirCobrancaAsaas(l.asaas_payment_id);
      await db.execute(sql`SELECT marcar_exclusao_resolvida(${l.asaas_payment_id})`);
      resolvidas++;
    } catch (e: any) {
      await db.execute(
        sql`UPDATE cobranca_pendente_exclusao
            SET tentativas = tentativas + 1,
                ultimo_erro = ${String(e?.message ?? "")},
                ultima_tentativa = now()
            WHERE id = ${l.id}::uuid`
      );
      falhas++;
    }
  }
  return { resolvidas, falhas };
}
