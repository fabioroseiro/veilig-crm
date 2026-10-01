"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";

/**
 * Registra uma passagem a partir da LISTA de clientes — um clique, sem
 * observação. O caminho com observação continua na ficha do cliente.
 */
export async function registrarPassagemRapida(
  subscriptionId: string
): Promise<{ ok: boolean }> {
  const ctx = await getSessionContext();
  if (!["veilig_admin", "group_admin", "store_manager", "store_admin"].includes(ctx.role)) {
    return { ok: false };
  }

  try {
    await withTenant(ctx, async (tx) => {
      // group_id e store_id vêm da ASSINATURA, não da sessão: o veilig_admin
      // não tem grupo, e o gestor pode estar vendo outra loja.
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
        observacao: "",
      });
    });
  } catch (e: any) {
    console.error("[PASSAGEM] falha ao registrar:", e?.message);
    return { ok: false };
  }

  revalidatePath("/clientes");
  return { ok: true };
}
