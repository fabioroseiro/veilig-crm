"use server";

import { eq } from "drizzle-orm";
import { withTenant, schema, type TenantContext } from "@/db";
import { apagarCobrancasDaAssinatura } from "@/lib/apagar-cobrancas";
import { cancelarAssinaturaAsaas } from "@/lib/asaas";

export type ResultadoCancelamento = {
  ok: boolean;
  message: string;
};

// Cancela uma assinatura de forma segura:
// 1) avisa a Asaas (INACTIVE) — se falhar, NÃO mexe no nosso status (senão a
//    cobrança continuaria lá e o nosso banco diria 'cancelada', desalinhado);
// 2) só depois marca 'cancelada' no nosso banco.
// Usada tanto pela loja quanto pelo portal do cliente.
export async function cancelarAssinatura(
  ctx: TenantContext,
  subscriptionId: string
): Promise<ResultadoCancelamento> {
  // carrega a assinatura (dentro do tenant)
  const sub = await withTenant(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: schema.subscriptions.id,
        status: schema.subscriptions.status,
        asaasSubscriptionId: schema.subscriptions.asaasSubscriptionId,
      })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, subscriptionId))
      .limit(1);
    return rows[0] ?? null;
  });

  if (!sub) return { ok: false, message: "Assinatura não encontrada." };
  if (sub.status === "cancelada") {
    return { ok: true, message: "Esta assinatura já estava cancelada." };
  }

  // Quem está cancelando: Veilig ou a própria loja. O portal registra
  // 'cliente' pelo seu próprio caminho.
  const origem = ctx.role === "veilig_admin" ? "veilig" : "loja";

  // 1) avisa a Asaas primeiro (fonte da verdade da cobrança)
  if (sub.asaasSubscriptionId) {
    try {
      await cancelarAssinaturaAsaas(sub.asaasSubscriptionId);

      // Cancelar a assinatura só impede NOVAS cobranças. As já geradas
      // continuam, e o cliente receberia boleto de um plano encerrado — a
      // régua apagaria isso aos 60 dias de qualquer forma.
      //
      // Depois do cancelamento confirmado: se a Asaas recusar o cancelamento,
      // nada foi alterado e não há o que apagar.
      await apagarCobrancasDaAssinatura(sub.id, sub.asaasSubscriptionId);
    } catch (e: any) {
      console.error("[CANCELAMENTO] Asaas recusou:", e?.message);
      return {
        ok: false,
        message:
          "Não foi possível cancelar a cobrança na Asaas. Nada foi alterado — tente novamente em instantes.",
      };
    }
  }
  // se não há id da Asaas (venda antiga/sem sync), seguimos e só marcamos local.

  // 2) só agora marca 'cancelada' no nosso banco
  try {
    await withTenant(ctx, async (tx) => {
      await tx
        .update(schema.subscriptions)
        .set({
          status: "cancelada",
          // Na mesma gravação do status: se ficasse numa chamada separada,
          // uma falha deixaria o cancelamento sem origem e o indicador
          // mentiria por omissão.
          cancelamentoOrigem: origem,
          cancelamentoPor: ctx.userId ?? null,
        })
        .where(eq(schema.subscriptions.id, subscriptionId));
    });
  } catch (e: any) {
    // ESTADO INCONSISTENTE: a Asaas já parou de cobrar, mas o nosso banco
    // ainda diz que a assinatura está ativa. Sem o id no log é impossível
    // descobrir qual precisa de conserto manual.
    console.error(
      `[CANCELAMENTO] INCONSISTENTE — Asaas cancelou mas o banco não atualizou. subscription=${subscriptionId}:`,
      e?.message
    );
    return {
      ok: false,
      message:
        "A cobrança foi interrompida na Asaas, mas houve um erro ao atualizar aqui. Avise o suporte.",
    };
  }

  return {
    ok: true,
    message:
      "Assinatura cancelada. Não haverá renovação; o período já pago é preservado.",
  };
}
