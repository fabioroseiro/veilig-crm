"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { grupoSchema } from "@/lib/grupo-validation";
import { soDigitos, soAlfanumerico } from "@/lib/loja-validation";
import type { FormState } from "../../nova/actions";

// Grupo é a entidade de topo: só a Veilig mexe. Um group_admin editando o
// próprio grupo poderia mudar o fee que a Veilig cobra dele.
function podeMexer(role: string) {
  return role === "veilig_admin";
}

export async function editarGrupo(
  groupId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await getSessionContext();
  if (!podeMexer(ctx.role)) {
    return { ok: false, message: "Apenas a Veilig pode editar grupos." };
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
      const atual = await tx
        .select({ id: schema.groups.id })
        .from(schema.groups)
        .where(eq(schema.groups.id, groupId))
        .limit(1);
      if (!atual[0]) throw new Error("nao-encontrado");

      await tx
        .update(schema.groups)
        .set({
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
          updatedAt: new Date(),
        })
        .where(eq(schema.groups.id, groupId));
    });
  } catch (e: any) {
    if (String(e?.message) === "nao-encontrado") {
      return { ok: false, values: raw, message: "Grupo não encontrado." };
    }
    console.error("[GRUPO] falha ao editar:", e?.message);
    return { ok: false, values: raw, message: "Não foi possível salvar o grupo." };
  }

  revalidatePath("/grupos");
  redirect("/grupos?salvo=1");
}

/**
 * Soft delete, como no resto do sistema.
 *
 * Inativar um grupo tem efeito REAL: `tenant_ativo()` é consultada no login e
 * bloqueia todos os usuários do grupo e das lojas dele. Antes desta função a
 * inativação era só um selo na tela.
 *
 * O que NÃO acontece: as assinaturas continuam sendo cobradas pela Asaas. O
 * dinheiro é da relação loja↔cliente e não deve parar porque a Veilig
 * suspendeu o acesso do grupo ao painel. Cancelar cobrança é ato deliberado,
 * assinatura por assinatura.
 */
export async function alternarStatusGrupo(groupId: string, novo: "ativo" | "inativo") {
  const ctx = await getSessionContext();
  if (!podeMexer(ctx.role)) return;

  await withTenant(ctx, async (tx) => {
    await tx
      .update(schema.groups)
      .set({ status: novo, updatedAt: new Date() })
      .where(eq(schema.groups.id, groupId));
  });
  revalidatePath("/grupos");
}

/** Números que o admin precisa ver ANTES de inativar. */
export async function resumoDoGrupo(groupId: string) {
  const ctx = await getSessionContext();
  if (!podeMexer(ctx.role)) return null;

  return withTenant(ctx, async (tx) => {
    const r = await tx.execute(sql`
      SELECT
        (SELECT count(*)::int FROM store WHERE group_id = ${groupId}::uuid AND status = 'ativo') AS lojas,
        (SELECT count(*)::int FROM app_user WHERE group_id = ${groupId}::uuid AND status = 'ativo') AS usuarios,
        (SELECT count(*)::int FROM subscription WHERE group_id = ${groupId}::uuid AND status <> 'cancelada') AS assinaturas
    `);
    const linhas = (Array.isArray(r) ? r : (r as any).rows) as any[];
    return {
      lojas: Number(linhas[0]?.lojas ?? 0),
      usuarios: Number(linhas[0]?.usuarios ?? 0),
      assinaturas: Number(linhas[0]?.assinaturas ?? 0),
    };
  });
}
