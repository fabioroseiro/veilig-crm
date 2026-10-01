"use server";

// Server Action: cadastra uma loja.
// Roda no servidor, dentro do contexto de tenant (RLS). O group_id NÃO vem do
// formulário — vem da sessão do usuário logado, para o admin não conseguir
// cadastrar loja em outro grupo. (A sessão real entra quando ligarmos o auth;
// por ora, um placeholder deixa o fluxo testável.)

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { lojaSchema, soAlfanumerico } from "@/lib/loja-validation";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";

export type FormState = {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
};

export async function criarLoja(
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
  const data = parsed.data;

  // Grupo: Veilig escolhe no form; group_admin usa o próprio da sessão.
  const groupIdAlvo =
    ctx.role === "veilig_admin" ? data.groupId : ctx.groupId;

  if (!groupIdAlvo) {
    return {
      ok: false,
      errors: ctx.role === "veilig_admin" ? { groupId: "Selecione o grupo." } : undefined,
      values: raw,
      message: "Selecione o grupo da loja.",
    };
  }

  try {
    await withTenant(ctx, async (tx) => {
      await tx.insert(schema.stores).values({
        groupId: groupIdAlvo,
        fabricante: data.fabricante,
        razaoSocial: data.razaoSocial,
        nomeFantasia: data.nomeFantasia,
        // soAlfanumerico e NÃO replace(/\D/g): o CNPJ pode ter letras desde
        // 2026, e filtrar dígitos gravava "WH.HCV.XKL/0001-81" como "000181".
        // A edição já usava a função certa — por isso salvar de novo corrigia.
        cnpj: soAlfanumerico(data.cnpj),
        inscricaoEstadual: data.inscricaoEstadual || null,
        cep: data.cep.replace(/\D/g, ""),
        logradouro: data.logradouro,
        numero: data.numero,
        complemento: data.complemento || null,
        bairro: data.bairro,
        cidade: data.cidade,
        uf: data.uf,
        responsavelNome: data.responsavelNome,
        responsavelCpf: data.responsavelCpf || null,
        email: data.email,
        telefone: data.telefone.replace(/\D/g, ""),
        walletId: data.walletId.trim() || null,
        // Sem walletId a loja existe e pode ser configurada, mas não vende.
        // 'onboarding' é o estado honesto: cadastrada, ainda não operante.
        status: data.walletId.trim() ? "ativo" : "onboarding",
      });
    });
  } catch (e: any) {
    // Erro amigável para CNPJ duplicado (constraint única).
    if (String(e?.message || "").includes("uq_store_cnpj")) {
      return {
        ok: false,
        errors: { cnpj: "Já existe uma loja com este CNPJ." },
        values: raw,
        message: "Este CNPJ já está cadastrado.",
      };
    }
    return { ok: false, values: raw, message: "Não foi possível cadastrar a loja. Tente novamente." };
  }

  revalidatePath("/lojas");
  redirect("/lojas?criada=1");
}
