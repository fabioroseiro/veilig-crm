"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { withTenant, schema, db } from "@/db";
import { getSessionContext } from "@/lib/session";
import { gerarSenhaProvisoria } from "@/lib/senha";
import bcrypt from "bcryptjs";
import { soDigitos } from "@/lib/loja-validation";
import { cancelarAssinatura } from "@/lib/cancelamento";
import { normalizaPlaca } from "@/lib/cliente-validation";
import { enviarBoasVindas } from "@/lib/boas-vindas";

export type EditState = {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
};

export async function editarCliente(
  customerId: string,
  personId: string,
  vehicleId: string | null,
  _prev: EditState,
  formData: FormData
): Promise<EditState> {
  const ctx = await getSessionContext();
  if (!["veilig_admin", "group_admin", "store_manager", "store_admin"].includes(ctx.role)) {
    return { ok: false, message: "Sem permissão." };
  }

  const nome = String(formData.get("nome") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const telefone = String(formData.get("telefone") || "").trim();
  const placaBruta = String(formData.get("placa") || "").trim();

  const errors: Record<string, string> = {};
  if (nome.length < 3) errors.nome = "Informe o nome completo.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = "E-mail inválido.";
  const telN = soDigitos(telefone).length;
  if (telN !== 10 && telN !== 11) errors.telefone = "Telefone inválido.";
  // placa só é validada se o campo veio (há veículo) e foi preenchido
  const placa = placaBruta ? normalizaPlaca(placaBruta) : "";
  const placaOk = /^[A-Z]{3}[0-9]{4}$/.test(placa) || /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(placa);
  if (vehicleId && placaBruta && !placaOk) errors.placa = "Placa inválida (use ABC1D23 ou ABC1234).";
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, values: { nome, email, telefone, placa: placaBruta }, message: "Verifique os campos." };
  }

  try {
    // nome está na person (global) — atualiza via função SECURITY DEFINER
    await withTenant(ctx, async (tx) => {
      await tx.execute(sql`SELECT atualizar_nome_pessoa(${personId}::uuid, ${nome})`);
      await tx
        .update(schema.customers)
        .set({ email, telefone: soDigitos(telefone) })
        .where(eq(schema.customers.id, customerId));
      // placa fica no veículo
      if (vehicleId && placa) {
        await tx
          .update(schema.vehicles)
          .set({ placa })
          .where(eq(schema.vehicles.id, vehicleId));
      }
    });
  } catch (e: any) {
    // provável colisão de placa (índice único) ou outro erro
    const msg = String(e?.message || "");
    if (msg.includes("placa") || msg.includes("unique") || msg.includes("duplicate")) {
      return { ok: false, values: { nome, email, telefone, placa: placaBruta }, errors: { placa: "Esta placa já está cadastrada." }, message: "Verifique a placa." };
    }
    return { ok: false, values: { nome, email, telefone, placa: placaBruta }, message: "Não foi possível salvar." };
  }

  revalidatePath("/clientes");
  redirect("/clientes?editado=1");
}

export async function alternarStatusCliente(customerId: string, novoStatus: "ativo" | "inativo") {
  const ctx = await getSessionContext();
  if (!["veilig_admin", "group_admin", "store_manager", "store_admin"].includes(ctx.role)) return;
  await withTenant(ctx, async (tx) => {
    await tx
      .update(schema.customers)
      .set({ status: novoStatus })
      .where(eq(schema.customers.id, customerId));
  });
  revalidatePath("/clientes");
}

export type CancelState = { ok: boolean; message: string };

// Cancelamento pela LOJA (vendedor/gestor atende o cliente que ligou).
export async function cancelarAssinaturaLoja(
  subscriptionId: string,
  _prev: CancelState,
  _formData: FormData
): Promise<CancelState> {
  const ctx = await getSessionContext();
  if (!["veilig_admin", "group_admin", "store_manager", "store_admin"].includes(ctx.role)) {
    return { ok: false, message: "Sem permissão para cancelar." };
  }
  const r = await cancelarAssinatura(ctx, subscriptionId);
  revalidatePath("/clientes");
  return r;
}

/**
 * Gera uma nova senha de acesso ao portal para o cliente.
 *
 * Rede de segurança necessária desde que a senha virou ALEATÓRIA: ela é
 * exibida uma única vez, no momento da venda. Se o vendedor fechar a aba antes
 * de anotar, o cliente ficaria trancado para fora do portal sem nenhuma saída —
 * não havia como regerar.
 *
 * Devolve a senha para a tela mostrar, pelo mesmo motivo de sempre: ela não
 * pode ser consultada depois, e mandar por query string deixaria a credencial
 * no histórico do navegador e nos logs.
 */
export async function gerarNovaSenhaCliente(
  cpf: string
): Promise<{ ok: boolean; senha?: string; message?: string }> {
  const ctx = await getSessionContext();
  if (!["veilig_admin", "group_admin", "store_manager", "store_admin"].includes(ctx.role)) {
    return { ok: false, message: "Sem permissão." };
  }

  const digitos = String(cpf ?? "").replace(/\D/g, "");
  if (digitos.length !== 11) return { ok: false, message: "CPF inválido." };

  try {
    // Busca a credencial existente. Usamos customer_auth_by_cpf +
    // atualizar_senha_cliente (e não upsert_customer_auth) porque a semântica
    // destas duas é conhecida: a primeira devolve o id, a segunda troca o hash.
    const r = await db.execute(sql`SELECT * FROM customer_auth_by_cpf(${digitos})`);
    const cred = (Array.isArray(r) ? r : (r as any).rows)[0] as { id: string } | undefined;

    const senha = gerarSenhaProvisoria();
    const hash = bcrypt.hashSync(senha, 10);

    if (cred?.id) {
      // definir_senha_provisoria_cliente e NÃO atualizar_senha_cliente: a
      // segunda é a que o próprio cliente usa ao definir sua senha, e por isso
      // marca a troca como já feita. Usá-la aqui apagava a obrigação de trocar,
      // e a provisória — que trafega por WhatsApp — virava definitiva.
      await db.execute(
        sql`SELECT definir_senha_provisoria_cliente(${cred.id}::uuid, ${hash})`
      );
    } else {
      // Cliente sem acesso criado (venda antiga ou falha no momento da venda).
      const p = await db.execute(
        sql`SELECT id FROM person WHERE regexp_replace(cpf, '\D', '', 'g') = ${digitos} LIMIT 1`
      );
      const pessoa = (Array.isArray(p) ? p : (p as any).rows)[0] as { id: string } | undefined;
      if (!pessoa?.id) return { ok: false, message: "Cliente não encontrado." };
      await db.execute(
        sql`SELECT upsert_customer_auth(${pessoa.id}::uuid, ${digitos}, ${hash})`
      );
    }

    // Mesma razão do reset de funcionário: gerar senha nova é a resposta ao
    // bloqueio, então mantê-lo prenderia o cliente que alguém foi ajudar.
    // No portal a chave do limite é o CPF, não o e-mail.
    try {
      await db.execute(sql`SELECT limpar_bloqueio_login(${digitos})`);
    } catch (e: any) {
      console.error("[SENHA CLIENTE] falha ao limpar bloqueio:", e?.message);
    }

    revalidatePath("/clientes");
    return { ok: true, senha };
  } catch (e: any) {
    console.error("[PORTAL] falha ao gerar nova senha:", e?.message);
    return { ok: false, message: "Não foi possível gerar a senha." };
  }
}

/**
 * Registra uma passagem do cliente pela loja.
 *
 * Um clique pendurado no fluxo que já existe: o consultor precisa consultar o
 * status antes de atender, então ele já está nesta tela. Um formulário
 * separado exigiria que alguém parasse para preencher, e isso só funciona
 * quando o pós-venda estiver desenhado dentro da concessionária.
 */
export async function registrarPassagem(
  subscriptionId: string,
  observacao: string
): Promise<{ ok: boolean; message?: string }> {
  const ctx = await getSessionContext();
  if (!["veilig_admin", "group_admin", "store_manager", "store_admin"].includes(ctx.role)) {
    return { ok: false, message: "Sem permissão." };
  }

  try {
    await withTenant(ctx, async (tx) => {
      // group_id e store_id vêm da assinatura, não da sessão: o veilig_admin
      // não tem grupo, e mesmo o gestor poderia estar vendo outra loja.
      const rows = await tx
        .select({
          groupId: schema.subscriptions.groupId,
          storeId: schema.subscriptions.storeId,
        })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.id, subscriptionId))
        .limit(1);
      if (!rows[0]) throw new Error("assinatura-nao-encontrada");

      await tx.insert(schema.passagensLoja).values({
        groupId: rows[0].groupId,
        storeId: rows[0].storeId,
        subscriptionId,
        registradoPor: ctx.userId ?? null,
        observacao: String(observacao ?? "").trim().slice(0, 500),
      });
    });
  } catch (e: any) {
    console.error("[PASSAGEM] falha ao registrar:", e?.message);
    return { ok: false, message: "Não foi possível registrar a passagem." };
  }

  revalidatePath(`/clientes`);
  return { ok: true };
}

/** Histórico de passagens de uma assinatura, para a ficha do cliente. */
export async function passagensDaAssinatura(subscriptionId: string) {
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) =>
    tx
      .select({
        id: schema.passagensLoja.id,
        observacao: schema.passagensLoja.observacao,
        createdAt: schema.passagensLoja.createdAt,
        registradoPor: schema.appUsers.nome,
      })
      .from(schema.passagensLoja)
      .leftJoin(schema.appUsers, eq(schema.appUsers.id, schema.passagensLoja.registradoPor))
      .where(eq(schema.passagensLoja.subscriptionId, subscriptionId))
      .orderBy(desc(schema.passagensLoja.createdAt))
      .limit(50)
  );
}

/**
 * Reenvia as boas-vindas (e, com elas, o link que verifica o e-mail).
 *
 * Serve para dois casos: o e-mail original não chegou, ou o endereço estava
 * errado e foi corrigido agora na ficha.
 */
export async function reenviarBoasVindas(customerId: string): Promise<{ ok: boolean; message: string }> {
  const ctx = await getSessionContext();
  if (ctx.somenteLeitura) return { ok: false, message: "Modo somente leitura." };

  try {
    const dados = await withTenant(ctx, async (tx) => {
      const r = await tx.execute(sql`
        SELECT c.person_id, c.email, st.nome_fantasia AS loja,
               pl.nome AS plano,
               coalesce(v.placa, v.chassi) AS veiculo,
               s.carencia_ate::text AS carencia_ate
        FROM customer c
        LEFT JOIN store st ON st.id = c.store_id
        LEFT JOIN subscription s ON s.customer_id = c.id AND s.status <> 'cancelada'
        LEFT JOIN plan pl ON pl.id = s.plan_id
        LEFT JOIN vehicle v ON v.id = s.vehicle_id
        WHERE c.id = ${customerId}::uuid
        ORDER BY s.created_at DESC NULLS LAST
        LIMIT 1
      `);
      return (Array.isArray(r) ? r : (r as any).rows)[0] as any;
    });

    if (!dados?.email) {
      return { ok: false, message: "Este cliente não tem e-mail no cadastro." };
    }

    const enviado = await enviarBoasVindas({
      personId: dados.person_id,
      loja: dados.loja ?? null,
      plano: dados.plano ?? null,
      veiculo: dados.veiculo ?? null,
      carenciaAte: dados.carencia_ate ?? null,
    });

    return enviado
      ? { ok: true, message: `Enviado para ${dados.email}.` }
      : { ok: false, message: "Não foi possível enviar. Confira o e-mail do cadastro." };
  } catch (e: any) {
    console.error("[CLIENTE] falha ao reenviar boas-vindas:", e?.message);
    return { ok: false, message: "Não foi possível enviar." };
  }
}
