"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { lojaSchema, soAlfanumerico } from "@/lib/loja-validation";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";

export type FormState = {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
};

// Edita uma loja existente. group_id NÃO muda (loja não troca de grupo aqui).
export async function editarLoja(
  storeId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = lojaSchema.safeParse(raw);

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors, values: raw, message: "Verifique os campos destacados." };
  }

  const ctx = await getSessionContext();
  // só Veilig e gestor de grupo editam lojas
  if (ctx.role !== "veilig_admin" && ctx.role !== "group_admin") {
    return { ok: false, message: "Sem permissão para editar lojas." };
  }

  const d = parsed.data;

  try {
    await withTenant(ctx, async (tx) => {
      await tx
        .update(schema.stores)
        .set({
          fabricante: d.fabricante,
          razaoSocial: d.razaoSocial,
          nomeFantasia: d.nomeFantasia,
          // soAlfanumerico como na criação: sem isto, o CNPJ é gravado com a
          // pontuação da máscara e não bate com o índice único nem com a
          // comparação de raiz que distingue matriz de filial.
          cnpj: soAlfanumerico(d.cnpj),
          inscricaoEstadual: d.inscricaoEstadual || null,
          cep: d.cep,
          logradouro: d.logradouro,
          numero: d.numero,
          complemento: d.complemento || null,
          bairro: d.bairro,
          cidade: d.cidade,
          uf: d.uf,
          responsavelNome: d.responsavelNome,
          responsavelCpf: d.responsavelCpf || null,
          email: d.email.toLowerCase(),
          telefone: d.telefone,
          walletId: d.walletId || null,
          // Informar o walletId é o que torna a loja apta a vender. Sem isto,
          // ela ficaria presa em 'onboarding' depois de completar o cadastro.
          ...(d.walletId?.trim() ? { status: "ativo" as const } : {}),
        })
        .where(eq(schema.stores.id, storeId));
    });
  } catch (e: any) {
    const msg = String(e?.message ?? "");

    // O índice único de CNPJ é o motivo mais comum aqui — e a mensagem
    // genérica não deixava a pessoa entender o que houve.
    if (msg.includes("uq_store_cnpj") || msg.includes("store_cnpj")) {
      return {
        ok: false,
        values: raw,
        errors: { cnpj: "Já existe outra loja com este CNPJ." },
        message:
          "Este CNPJ já está cadastrado em outra loja. Cada estabelecimento " +
          "tem CNPJ próprio — matriz e filiais diferem nos quatro dígitos do meio.",
      };
    }

    console.error("[LOJA] falha ao editar:", msg);
    return {
      ok: false,
      values: raw,
      message: `Não foi possível salvar. Detalhe: ${msg || "erro desconhecido"}`,
    };
  }

  revalidatePath("/lojas");
  redirect(`/lojas/${storeId}?salva=1`);
}

// Inativa ou reativa uma loja (soft delete — preserva histórico).
export async function alternarStatusLoja(storeId: string, novoStatus: "ativo" | "inativo") {
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin" && ctx.role !== "group_admin") {
    return;
  }
  await withTenant(ctx, async (tx) => {
    await tx
      .update(schema.stores)
      .set({ status: novoStatus })
      .where(eq(schema.stores.id, storeId));
  });
  revalidatePath("/lojas");
  revalidatePath(`/lojas/${storeId}`);
}
