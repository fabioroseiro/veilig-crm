import { db } from "@/db";
import { sql } from "drizzle-orm";
import { cobrancasEmAbertoAsaas, excluirCobrancaAsaas } from "@/lib/asaas";

/**
 * Apaga as cobranças em aberto de uma assinatura cancelada.
 *
 * Cancelar a assinatura na Asaas só impede NOVAS cobranças. As já geradas
 * continuam lá — e o cliente recebe boleto de um plano que não existe mais.
 *
 * Vale para o cancelamento voluntário tanto quanto para o por inadimplência:
 * a régua apagaria essas mesmas cobranças aos 60 dias, então deixá-las vivas
 * só posterga o problema e deixa o cliente com um boleto no caminho.
 *
 * NÃO derruba o cancelamento se falhar. O contrato já está encerrado; o que
 * sobra vira pendência com nova tentativa, e alerta na tela depois de 3.
 */
export async function apagarCobrancasDaAssinatura(
  subscriptionId: string,
  asaasSubscriptionId: string | null
): Promise<{ apagadas: number; pendentes: number }> {
  if (!asaasSubscriptionId) return { apagadas: 0, pendentes: 0 };

  let apagadas = 0;
  let pendentes = 0;

  try {
    const aberto = await cobrancasEmAbertoAsaas(asaasSubscriptionId);
    if (!aberto) return { apagadas: 0, pendentes: 0 };

    for (const p of aberto.pagamentos) {
      try {
        await excluirCobrancaAsaas(p.id);
        await db.execute(sql`SELECT marcar_exclusao_resolvida(${p.id})`);
        await db.execute(sql`SELECT marcar_cobranca_cancelada(${p.id})`);
        apagadas++;
      } catch (e: any) {
        await db.execute(
          sql`SELECT registrar_falha_exclusao(
                ${subscriptionId}::uuid, ${p.id}, ${p.valor}, ${p.vencimento}::date,
                ${String(e?.message ?? "erro desconhecido")}
              )`
        );
        pendentes++;
      }
    }
  } catch (e: any) {
    console.error("[CANCELAMENTO] falha ao apagar cobranças:", e?.message);
  }

  return { apagadas, pendentes };
}
