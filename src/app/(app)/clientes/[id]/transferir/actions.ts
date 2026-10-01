"use server";

import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withTenant, schema, db } from "@/db";
import { getSessionContext } from "@/lib/session";
import { upsertCustomerAsaas, createSubscriptionAsaas, cancelarAssinaturaAsaas } from "@/lib/asaas";
import { gerarSenhaProvisoria } from "@/lib/senha";
import { enviarBoasVindas } from "@/lib/boas-vindas";
import { soDigitos } from "@/lib/loja-validation";

export type TransferirState = {
  ok: boolean;
  message?: string;
  values?: Record<string, string>;
  senhaCliente?: string;
  nomeCliente?: string;
};

/**
 * Transfere o plano para o novo proprietário do veículo.
 *
 * ── O que se preserva, e por quê ────────────────────────────────────────
 *
 * CARÊNCIA já cumprida: ela foi paga pelo antigo dono e pertence ao veículo.
 * Recomeçar faria o comprador pagar meses sem poder usar — e a transferência
 * deixaria de acontecer.
 *
 * PREÇO contratado: o valor segue o mesmo, sem recalcular pela idade atual do
 * veículo.
 *
 * ANIVERSÁRIO DE REAJUSTE: a nova assinatura herda a data-base do ciclo. Sem
 * isso, cada transferência daria 12 meses de carona sem reajuste.
 *
 * VENCIMENTO: nasce na data em que venceria para o antigo dono, para o ciclo
 * financeiro não quebrar.
 *
 * VEÍCULO: o mesmo registro, então o histórico de revisões segue a moto — é o
 * que dá valor ao plano na revenda.
 *
 * ── O que NÃO se preserva ───────────────────────────────────────────────
 *
 * O contrato e o aceite. São da pessoa: o novo titular assina o seu, e o
 * aceite se formaliza no primeiro pagamento dele, como em qualquer venda.
 */
export async function transferirPlano(
  _prev: TransferirState,
  formData: FormData
): Promise<TransferirState> {
  const ctx = await getSessionContext();
  if (ctx.somenteLeitura) return { ok: false, message: "Modo somente leitura." };

  const customerId = String(formData.get("customerId") || "");
  const raw = {
    nome: String(formData.get("nome") || "").trim(),
    cpf: String(formData.get("cpf") || ""),
    email: String(formData.get("email") || "").trim(),
    telefone: String(formData.get("telefone") || ""),
    cep: String(formData.get("cep") || ""),
    logradouro: String(formData.get("logradouro") || "").trim(),
    numero: String(formData.get("numero") || "").trim(),
    complemento: String(formData.get("complemento") || "").trim(),
    bairro: String(formData.get("bairro") || "").trim(),
    cidade: String(formData.get("cidade") || "").trim(),
    uf: String(formData.get("uf") || "").trim().toUpperCase(),
  };

  const cpf = soDigitos(raw.cpf);
  if (raw.nome.length < 3) return { ok: false, values: raw, message: "Informe o nome do novo proprietário." };
  if (cpf.length !== 11) return { ok: false, values: raw, message: "Informe um CPF válido." };
  if (!raw.email.includes("@")) return { ok: false, values: raw, message: "Informe um e-mail válido." };
  // Obrigatório no cadastro: a loja precisa conseguir falar com o cliente.
  if (soDigitos(raw.telefone).length < 10) {
    return { ok: false, values: raw, message: "Informe um telefone com DDD." };
  }

  // ── A assinatura pode ser transferida? Quem decide é o BANCO ───────────
  const origem = await withTenant(ctx, async (tx) => {
    const r = await tx.execute(sql`SELECT * FROM assinatura_para_transferir(${customerId}::uuid)`);
    return (Array.isArray(r) ? r : (r as any).rows)[0] as any;
  });

  if (!origem?.pode) {
    return { ok: false, values: raw, message: origem?.motivo ?? "Não foi possível transferir." };
  }

  // O mesmo CPF não pode assumir o próprio plano.
  const mesmoDono = await withTenant(ctx, async (tx) => {
    const r = await tx.execute(sql`
      SELECT p.cpf FROM customer c JOIN person p ON p.id = c.person_id
      WHERE c.id = ${customerId}::uuid
    `);
    return (Array.isArray(r) ? r : (r as any).rows)[0]?.cpf === cpf;
  });
  if (mesmoDono) {
    return { ok: false, values: raw, message: "O CPF informado é o do titular atual." };
  }

  let novoCustomerId: string | null = null;
  let novaSubId: string | null = null;
  let novoPersonId: string | null = null;
  let senhaDoCliente: string | null = null;

  try {
    // 1) Pessoa e cliente do novo titular, na mesma loja do contrato original.
    const criado = await withTenant(ctx, async (tx) => {
      const rp = await tx.execute(sql`SELECT upsert_person(${cpf}, ${raw.nome}) AS id`);
      const personId = ((Array.isArray(rp) ? rp : (rp as any).rows)[0] as any)?.id as string;
      if (!personId) throw new Error("person-falhou");

      const existente = await tx
        .select({ id: schema.customers.id })
        .from(schema.customers)
        .where(
          sql`${schema.customers.personId} = ${personId}::uuid AND ${schema.customers.storeId} = ${origem.store_id}::uuid`
        )
        .limit(1);

      let cid = existente[0]?.id ?? null;
      if (cid) {
        await tx
          .update(schema.customers)
          .set({ email: raw.email, telefone: soDigitos(raw.telefone), status: "ativo" })
          .where(eq(schema.customers.id, cid));
      } else {
        const ins = await tx
          .insert(schema.customers)
          .values({
            personId,
            groupId: origem.group_id,
            storeId: origem.store_id,
            email: raw.email,
            telefone: soDigitos(raw.telefone),
            cep: soDigitos(raw.cep) || null,
            logradouro: raw.logradouro || null,
            numero: raw.numero || null,
            complemento: raw.complemento || null,
            bairro: raw.bairro || null,
            cidade: raw.cidade || null,
            uf: raw.uf || null,
          })
          .returning({ id: schema.customers.id });
        cid = ins[0]?.id ?? null;
      }
      if (!cid) throw new Error("customer-falhou");

      // 2) A nova assinatura, herdando o que pertence ao veículo.
      const insSub = await tx
        .insert(schema.subscriptions)
        .values({
          customerId: cid,
          vehicleId: origem.vehicle_id,
          planId: origem.plan_id,
          storeId: origem.store_id,
          groupId: origem.group_id,
          precoContratado: String(origem.preco),
          status: "ativa",
          // Carência herdada: foi cumprida pelo antigo dono e é do veículo.
          carenciaMeses: origem.carencia_meses ?? 0,
          carenciaAte: origem.carencia_ate ?? null,
          // Aniversário de reajuste herdado: sem isto, cada transferência
          // daria 12 meses sem reajuste.
          ultimoReajusteEm: origem.base_ciclo ?? null,
          transferidaDe: origem.subscription_id,
          transferidaEm: new Date(),
          transferidaPor: ctx.userId ?? null,
          // A comissão fica com quem fez a transferência — e só vendedor
          // recebe, como em qualquer venda.
          vendedorId: ctx.role === "store_admin" ? ctx.userId ?? null : null,
        })
        .returning({ id: schema.subscriptions.id });

      return { personId, customerId: cid, subId: insSub[0]?.id ?? null };
    });

    novoPersonId = criado.personId;
    novoCustomerId = criado.customerId;
    novaSubId = criado.subId;
    if (!novaSubId) throw new Error("subscription-falhou");

    // 3) Acesso ao portal para o novo titular.
    const senha = gerarSenhaProvisoria();
    await db.execute(
      sql`SELECT upsert_customer_auth(${novoPersonId}::uuid, ${cpf}, ${bcrypt.hashSync(senha, 10)})`
    );
    senhaDoCliente = senha;
  } catch (e: any) {
    console.error("[TRANSFERENCIA] falha ao criar o novo titular:", e?.message);
    return {
      ok: false,
      values: raw,
      message: `Não foi possível preparar a transferência. Detalhe: ${e?.message ?? "erro desconhecido"}`,
    };
  }

  // ── 4) Asaas ───────────────────────────────────────────────────────────
  //
  // ORDEM: cria a nova ANTES de encerrar a antiga. Se a criação falhar, o
  // cliente continua pagando normalmente pela antiga — nada se perde. O
  // inverso deixaria o veículo sem cobrança nenhuma.
  try {
    const asaasCustomerId = await upsertCustomerAsaas({
      nome: raw.nome,
      cpf,
      email: raw.email,
      telefone: raw.telefone,
      cep: raw.cep,
      logradouro: raw.logradouro,
      numero: raw.numero,
      complemento: raw.complemento,
      bairro: raw.bairro,
    });

    const dados = await withTenant(ctx, async (tx) => {
      const loja = await tx
        .select({
          walletId: schema.stores.walletId,
          feeOverride: schema.stores.feePercentOverride,
          groupId: schema.stores.groupId,
          nome: schema.stores.nomeFantasia,
        })
        .from(schema.stores)
        .where(eq(schema.stores.id, origem.store_id))
        .limit(1);
      const grupo = await tx
        .select({ feePadrao: schema.groups.feePercentPadrao })
        .from(schema.groups)
        .where(eq(schema.groups.id, origem.group_id))
        .limit(1);
      return {
        walletId: loja[0]?.walletId ?? null,
        nomeLoja: loja[0]?.nome ?? null,
        fee: Number(loja[0]?.feeOverride ?? grupo[0]?.feePadrao ?? 10),
      };
    });

    if (!dados.walletId) throw new Error("A loja não tem carteira configurada na Asaas.");

    // Vencimento na data que seria do antigo dono: o ciclo não quebra.
    const hoje = new Date().toISOString().slice(0, 10);
    const prox = origem.proximo_vencimento ? String(origem.proximo_vencimento).slice(0, 10) : null;
    const primeiroVencimento = prox && prox >= hoje ? prox : hoje;

    const sub = await createSubscriptionAsaas({
      asaasCustomerId,
      valor: Number(origem.preco).toFixed(2),
      descricao: `${origem.plano_nome ?? "Plano"} — ${origem.veiculo ?? ""}`,
      lojaWalletId: dados.walletId,
      feePercent: dados.fee,
      primeiroVencimento,
    });

    await withTenant(ctx, async (tx) => {
      await tx
        .update(schema.customers)
        .set({ asaasCustomerId })
        .where(eq(schema.customers.id, novoCustomerId!));
      await tx
        .update(schema.subscriptions)
        .set({
          asaasSubscriptionId: sub.subscriptionId,
          asaasLinkPagamento: sub.linkPagamento,
          asaasSyncStatus: "ok",
        })
        .where(eq(schema.subscriptions.id, novaSubId!));
    });

    // 5) Só agora encerra a antiga — na Asaas e aqui.
    if (origem.asaas_sub_id) {
      try {
        await cancelarAssinaturaAsaas(origem.asaas_sub_id);
      } catch (e: any) {
        // A nova já está de pé. Deixar as duas cobrando seria pior que avisar.
        console.error("[TRANSFERENCIA] a antiga não foi cancelada na Asaas:", e?.message);
        await db.execute(
          sql`SELECT encerrar_por_transferencia(${origem.subscription_id}::uuid, ${ctx.userId}::uuid)`
        );
        return {
          ok: true,
          senhaCliente: senhaDoCliente ?? undefined,
          nomeCliente: raw.nome,
          message:
            "Transferência concluída, mas a assinatura antiga não foi cancelada na Asaas. " +
            "Cancele à mão para o antigo proprietário não continuar sendo cobrado.",
        };
      }
    }

    await db.execute(
      sql`SELECT encerrar_por_transferencia(${origem.subscription_id}::uuid, ${ctx.userId}::uuid)`
    );
  } catch (e: any) {
    console.error("[TRANSFERENCIA] falha na Asaas:", e?.message);
    // Desfaz a assinatura nova: sem cobrança ela não serve, e deixá-la viva
    // faria o veículo aparecer com dois planos.
    try {
      await withTenant(ctx, async (tx) => {
        await tx.delete(schema.subscriptions).where(eq(schema.subscriptions.id, novaSubId!));
      });
    } catch {}
    return {
      ok: false,
      values: raw,
      message:
        `Não foi possível criar a cobrança do novo titular: ${e?.message ?? "erro"}. ` +
        "Nada foi alterado — o plano continua com o titular atual.",
    };
  }

  // Boas-vindas ao novo titular. Fora de qualquer try da transferência.
  if (novoPersonId) {
    await enviarBoasVindas({
      personId: novoPersonId,
      loja: null,
      plano: origem.plano_nome ?? null,
      veiculo: origem.veiculo ?? null,
      carenciaAte: origem.carencia_ate ? String(origem.carencia_ate) : null,
    });
  }

  revalidatePath("/clientes");
  return {
    ok: true,
    senhaCliente: senhaDoCliente ?? undefined,
    nomeCliente: raw.nome,
    message: "Plano transferido com sucesso.",
  };
}
