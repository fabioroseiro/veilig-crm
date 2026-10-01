"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { grupoSchema } from "@/lib/grupo-validation";
import { soDigitos, soAlfanumerico } from "@/lib/loja-validation";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";

export type FormState = {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
};

export async function criarGrupo(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await getSessionContext();

  // Somente a Veilig cadastra grupos.
  if (ctx.role !== "veilig_admin") {
    return { ok: false, message: "Apenas a Veilig pode cadastrar grupos." };
  }

  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = grupoSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors, values: raw, message: "Verifique os campos." };
  }

  const d = parsed.data;
  const fee = Number(String(d.feePercent).replace(",", "."));

  try {
    await withTenant(ctx, async (tx) => {
      await tx.insert(schema.groups).values({
        razaoSocial: d.razaoSocial,
        nomeFantasia: d.nomeFantasia || null,
        // soAlfanumerico e não soDigitos: o CNPJ pode ter letras desde 2026.
          cnpj: soAlfanumerico(d.cnpj),
        responsavelNome: d.responsavelNome,
        responsavelEmail: d.responsavelEmail,
        telefone: d.telefone ? soDigitos(d.telefone) : null,
        feePercentPadrao: fee.toFixed(2),
        multaPercent: d.multaPercent.toFixed(2),
        jurosMesPercent: d.jurosMesPercent.toFixed(2),
        diasCancelamento: d.diasCancelamento,
        apuracaoDiaInicio: d.apuracaoDiaInicio,
        apuracaoDiaFim: d.apuracaoDiaFim,
        indiceReajuste: d.indiceReajuste,
        tetoReajustePercent:
          d.tetoReajustePercent === null ? null : d.tetoReajustePercent.toFixed(2),
        status: "ativo",
      });
    });
  } catch (e: any) {
    return { ok: false, values: raw, message: "Não foi possível cadastrar o grupo." };
  }

  revalidatePath("/grupos");
  redirect("/grupos?criado=1");
}
