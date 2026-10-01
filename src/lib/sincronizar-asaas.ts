import { eq } from "drizzle-orm";
import { withTenant, schema } from "@/db";
import {
  asaasConfigurada,
  upsertCustomerAsaas,
  createSubscriptionAsaas,
} from "@/lib/asaas";
import { logDev } from "@/lib/log";

/**
 * Sincroniza UMA assinatura com a Asaas: garante o customer e cria a assinatura
 * recorrente com split.
 *
 * Vive aqui, e não dentro da action de venda, porque duas telas precisam disso:
 * a venda (primeira tentativa) e o botão "tentar cobrança de novo" (depois que
 * o vendedor corrigiu, por exemplo, um CPF inválido). Duplicar essa lógica em
 * dois lugares seria pedir para elas divergirem.
 *
 * Nunca lança: devolve { ok, erro } e grava o motivo em asaas_sync_erro, para
 * a venda nunca ser perdida por um problema de integração.
 */
export async function sincronizarAssinaturaAsaas(
  ctx: any,
  subId: string
): Promise<{ ok: boolean; erro?: string }> {
  const marcarErro = async (msg: string) => {
    await withTenant(ctx, async (tx) => {
      await tx
        .update(schema.subscriptions)
        .set({ asaasSyncStatus: "erro", asaasSyncErro: msg.slice(0, 300) })
        .where(eq(schema.subscriptions.id, subId));
    });
    return { ok: false, erro: msg };
  };

  if (!asaasConfigurada()) {
    return marcarErro("ASAAS_API_KEY não configurada neste ambiente.");
  }

  // Junta tudo que a Asaas precisa saber, numa consulta só.
  const dados = await withTenant(ctx, async (tx) => {
    const rows = await tx
      .select({
        subId: schema.subscriptions.id,
        subStatus: schema.subscriptions.status,
        asaasSubscriptionId: schema.subscriptions.asaasSubscriptionId,
        preco: schema.subscriptions.precoContratado,
        customerId: schema.customers.id,
        asaasCustomerId: schema.customers.asaasCustomerId,
        nome: schema.persons.nomeCompleto,
        cpf: schema.persons.cpf,
        email: schema.customers.email,
        telefone: schema.customers.telefone,
        placa: schema.vehicles.placa,
        planoNome: schema.plans.nome,
        walletId: schema.stores.walletId,
        feeOverride: schema.stores.feePercentOverride,
        feePadrao: schema.groups.feePercentPadrao,
      })
      .from(schema.subscriptions)
      .innerJoin(schema.customers, eq(schema.customers.id, schema.subscriptions.customerId))
      .innerJoin(schema.persons, eq(schema.persons.id, schema.customers.personId))
      .innerJoin(schema.vehicles, eq(schema.vehicles.id, schema.subscriptions.vehicleId))
      .innerJoin(schema.plans, eq(schema.plans.id, schema.subscriptions.planId))
      .innerJoin(schema.stores, eq(schema.stores.id, schema.subscriptions.storeId))
      .innerJoin(schema.groups, eq(schema.groups.id, schema.subscriptions.groupId))
      .where(eq(schema.subscriptions.id, subId))
      .limit(1);
    return rows[0] ?? null;
  });

  if (!dados) return { ok: false, erro: "Assinatura não encontrada." };
  if (dados.subStatus === "cancelada") {
    return { ok: false, erro: "Assinatura cancelada — não é reprocessada." };
  }
  if (dados.asaasSubscriptionId) {
    // já existe na Asaas; reprocessar criaria uma segunda cobrança recorrente
    return { ok: false, erro: "Esta assinatura já existe na Asaas." };
  }
  if (!dados.walletId) {
    return marcarErro("Loja sem walletId configurado (necessário para o split).");
  }

  // 1) customer na Asaas (cria ou reusa)
  let asaasCustomerId: string;
  try {
    asaasCustomerId = await upsertCustomerAsaas({
      nome: dados.nome,
      cpf: dados.cpf,
      email: dados.email ?? "",
      telefone: dados.telefone ?? "",
    });
    await withTenant(ctx, async (tx) => {
      await tx
        .update(schema.customers)
        .set({ asaasCustomerId })
        .where(eq(schema.customers.id, dados.customerId));
    });
    logDev("[ASAAS] customer criado/reusado:", asaasCustomerId);
  } catch (e: any) {
    return marcarErro("[cliente] " + String(e?.message || "erro ao criar cliente na Asaas"));
  }

  // 2) assinatura recorrente com split
  try {
    const fee = Number(dados.feeOverride ?? dados.feePadrao ?? "8.00");
    const hoje = new Date().toISOString().slice(0, 10);
    const sub = await createSubscriptionAsaas({
      asaasCustomerId,
      valor: Number(dados.preco).toFixed(2),
      descricao: `${dados.planoNome} — ${String(dados.placa).toUpperCase()}`,
      lojaWalletId: dados.walletId,
      feePercent: fee,
      primeiroVencimento: hoje,
    });
    await withTenant(ctx, async (tx) => {
      await tx
        .update(schema.subscriptions)
        .set({
          asaasSubscriptionId: sub.subscriptionId,
          asaasLinkPagamento: sub.linkPagamento,
          asaasSyncStatus: "sincronizada",
          asaasSyncErro: null,
        })
        .where(eq(schema.subscriptions.id, subId));
    });
    logDev("[ASAAS] assinatura criada:", sub.subscriptionId, "link:", sub.linkPagamento);
    return { ok: true };
  } catch (e: any) {
    return marcarErro("[assinatura] " + String(e?.message || "erro ao criar assinatura"));
  }
}
