"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { soDigitos } from "@/lib/loja-validation";

export type ResultadoIsencao = { ok: boolean; message?: string };

/**
 * O vendedor pede a isenção. A venda ainda NÃO aconteceu.
 *
 * É essa ordem que evita o conflito com o contrato congelado: a decisão vem
 * antes, e o documento nasce já sem carência. Aprovar depois exigiria alterar
 * um contrato assinado.
 */
export async function solicitarIsencao(
  formData: FormData
): Promise<ResultadoIsencao> {
  const ctx = await getSessionContext();
  if (!ctx.storeId && ctx.role !== "veilig_admin") {
    return { ok: false, message: "Apenas quem vende pode solicitar." };
  }

  const cpf = soDigitos(String(formData.get("cpf") || ""));
  const motivo = String(formData.get("motivo") || "").trim();
  const modelId = String(formData.get("vehicleModelId") || "") || null;
  const planId = String(formData.get("planId") || "") || null;
  const storeId = String(formData.get("storeId") || "") || ctx.storeId;

  if (cpf.length !== 11) return { ok: false, message: "CPF inválido." };
  if (motivo.length < 10) {
    // Motivo curto vira "ok" e não explica nada a quem for auditar depois.
    return { ok: false, message: "Explique o motivo em pelo menos 10 caracteres." };
  }
  if (!storeId) return { ok: false, message: "Loja não identificada." };

  try {
    await withTenant(ctx, async (tx) => {
      const [loja] = await tx
        .select({ groupId: schema.stores.groupId })
        .from(schema.stores)
        .where(eq(schema.stores.id, storeId))
        .limit(1);
      if (!loja?.groupId) throw new Error("loja-invalida");

      await tx.insert(schema.isencoesCarencia).values({
        groupId: loja.groupId,
        storeId,
        cpf,
        vehicleModelId: modelId,
        planId,
        motivo,
        solicitadoPor: ctx.userId ?? null,
      });
    });
  } catch (e: any) {
    console.error("[ISENCAO] falha ao solicitar:", e?.message);
    return { ok: false, message: `Não foi possível solicitar. ${e?.message ?? ""}` };
  }

  revalidatePath("/isencoes");
  return { ok: true };
}

/**
 * O gestor decide.
 *
 * Quem pode: gestor da LOJA (a sua) e gestor do GRUPO (qualquer loja dele) —
 * assim o vendedor não fica travado quando o gestor da loja está de folga.
 * O vendedor não aprova o próprio pedido; seria o mesmo que não ter aprovação.
 */
export async function decidirIsencao(
  id: string,
  aprovar: boolean,
  observacao: string
): Promise<ResultadoIsencao> {
  const ctx = await getSessionContext();

  const podeDecidir =
    ctx.role === "veilig_admin" ||
    ctx.role === "group_admin" ||
    ctx.role === "store_manager";
  if (!podeDecidir) {
    return { ok: false, message: "Apenas gestores podem aprovar ou negar." };
  }

  try {
    await withTenant(ctx, async (tx) => {
      const [alvo] = await tx
        .select({ storeId: schema.isencoesCarencia.storeId, status: schema.isencoesCarencia.status })
        .from(schema.isencoesCarencia)
        .where(eq(schema.isencoesCarencia.id, id))
        .limit(1);
      if (!alvo) throw new Error("solicitação não encontrada");
      if (alvo.status !== "pendente") throw new Error("esta solicitação já foi decidida");

      // Gestor de loja só decide a própria loja. O RLS já limita ao grupo; isto
      // fecha o nível de loja.
      if (ctx.role === "store_manager" && alvo.storeId !== ctx.storeId) {
        throw new Error("esta solicitação é de outra loja");
      }

      await tx
        .update(schema.isencoesCarencia)
        .set({
          status: aprovar ? "aprovada" : "negada",
          decididoPor: ctx.userId ?? null,
          decididoEm: new Date(),
          observacao: observacao.trim() || null,
        })
        .where(eq(schema.isencoesCarencia.id, id));
    });
  } catch (e: any) {
    console.error("[ISENCAO] falha ao decidir:", e?.message);
    return { ok: false, message: e?.message ?? "Não foi possível registrar a decisão." };
  }

  revalidatePath("/isencoes");
  revalidatePath("/clientes/nova");
  return { ok: true };
}
