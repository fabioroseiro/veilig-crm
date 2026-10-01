"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { withTenant, schema, db } from "@/db";
import { getSessionContext } from "@/lib/session";
import { estornarCobrancaAsaas, meioPermiteEstorno } from "@/lib/asaas";
import { cancelarAssinatura } from "@/lib/cancelamento";

export type EstornoInfo = {
  pode: boolean;
  motivo: string | null;
  prazoAte: string | null;
  valor: number | null;
  meioPermite: boolean;
  meio: string | null;
};

/**
 * A assinatura pode ser estornada?
 *
 * As regras (primeira parcela, 7 dias, sem utilização) ficam no BANCO — o botão
 * escondido não impediria um POST montado à mão, e aqui isso é dinheiro.
 */
export async function verificarEstorno(subscriptionId: string): Promise<EstornoInfo> {
  const ctx = await getSessionContext();

  return withTenant(ctx, async (tx) => {
    const r = await tx.execute(sql`SELECT * FROM pode_estornar(${subscriptionId}::uuid)`);
    const l = (Array.isArray(r) ? r : (r as any).rows)[0] as any;

    // Meio de pagamento: cartão e Pix devolvem direto para a origem. Boleto
    // depende de o cliente preencher dados bancários num link e pode nunca se
    // completar — nesse caso o sistema acharia que devolveu sem ter devolvido.
    const rc = await tx.execute(
      sql`SELECT meio_pagamento FROM cobranca
          WHERE subscription_id = ${subscriptionId}::uuid AND paga_em IS NOT NULL
          ORDER BY paga_em LIMIT 1`
    );
    const meio = ((Array.isArray(rc) ? rc : (rc as any).rows)[0]?.meio_pagamento ?? null) as
      | string
      | null;

    return {
      pode: l?.pode === true,
      motivo: l?.motivo ?? null,
      prazoAte: l?.prazo_ate ? String(l.prazo_ate).slice(0, 10) : null,
      valor: l?.valor != null ? Number(l.valor) : null,
      meioPermite: meioPermiteEstorno(meio),
      meio,
    };
  });
}

/**
 * Estorna de verdade: executa na Asaas e registra.
 *
 * ORDEM: Asaas primeiro. Se ela recusar, nada é gravado — o oposto deixaria o
 * sistema dizendo que devolveu um dinheiro que não voltou.
 *
 * O split é revertido automaticamente pela Asaas no estorno TOTAL: as contas
 * que receberam têm a transferência estornada, sem chamada extra.
 */
export async function estornarAssinatura(
  subscriptionId: string,
  motivo: string
): Promise<{ ok: boolean; message: string }> {
  const ctx = await getSessionContext();
  if (!ctx.userId) return { ok: false, message: "Sessão expirada." };
  if (motivo.trim().length < 10) {
    return { ok: false, message: "Explique o motivo em pelo menos 10 caracteres." };
  }

  const info = await verificarEstorno(subscriptionId);
  if (!info.pode) {
    return { ok: false, message: info.motivo ?? "Estorno não permitido." };
  }
  if (!info.meioPermite) {
    return {
      ok: false,
      message:
        "Pagamentos por boleto precisam ser estornados no painel da Asaas: o " +
        "cliente informa os dados bancários num link. Depois disso, o sistema " +
        "registra sozinho.",
    };
  }

  // Qual cobrança estornar.
  let paymentId: string | null = null;
  try {
    const r = await withTenant(ctx, async (tx) =>
      tx.execute(
        sql`SELECT asaas_payment_id FROM cobranca
            WHERE subscription_id = ${subscriptionId}::uuid AND paga_em IS NOT NULL
            ORDER BY paga_em LIMIT 1`
      )
    );
    paymentId = ((Array.isArray(r) ? r : (r as any).rows)[0]?.asaas_payment_id ?? null) as
      | string
      | null;
  } catch (e: any) {
    console.error("[ESTORNO] falha ao localizar a cobrança:", e?.message);
  }

  if (!paymentId) {
    return { ok: false, message: "Não foi possível localizar o pagamento na Asaas." };
  }

  try {
    await estornarCobrancaAsaas(paymentId);
  } catch (e: any) {
    console.error("[ESTORNO] Asaas recusou:", e?.message);
    return {
      ok: false,
      message: `A Asaas recusou o estorno: ${e?.message ?? "erro desconhecido"}. Nada foi alterado.`,
    };
  }

  // Registra e cancela. O estorno sem cancelamento deixaria o cliente pagando
  // um plano que ele desistiu.
  try {
    await db.execute(
      sql`SELECT registrar_estorno(
            ${subscriptionId}::uuid, ${info.valor}, ${motivo.trim()}, ${ctx.userId}::uuid
          )`
    );
  } catch (e: any) {
    // O dinheiro JÁ voltou. Não dá para desfazer — registra o problema e segue.
    console.error("[ESTORNO] estorno feito na Asaas mas não registrado:", e?.message);
  }

  const c = await cancelarAssinatura(ctx, subscriptionId);

  revalidatePath(`/clientes`);
  return {
    ok: true,
    message: c.ok
      ? "Estorno realizado e assinatura cancelada."
      : "Estorno realizado. O cancelamento da assinatura falhou — cancele manualmente.",
  };
}
