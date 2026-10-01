"use server";

import { revalidatePath } from "next/cache";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { eq } from "drizzle-orm";

export type AffinityState = { ok?: boolean; message?: string };

// Recebe listas de fabricantes e categorias selecionados e recria as afinidades
// da loja como o produto das duas listas (cada fabricante × cada categoria).
export async function salvarAfinidades(
  storeId: string,
  _prev: AffinityState,
  formData: FormData
): Promise<AffinityState> {
  const ctx = await getSessionContext();

  const fabricantes = formData.getAll("fabricante").map(String).filter(Boolean);
  const categorias = formData.getAll("categoria").map(String).filter(Boolean);

  if (fabricantes.length === 0 || categorias.length === 0) {
    return { ok: false, message: "Selecione ao menos um fabricante e uma categoria." };
  }

  try {
    await withTenant(ctx, async (tx) => {
      // Confirma que a loja pertence ao tenant (RLS já filtra, mas garantimos).
      const loja = await tx
        .select({ id: schema.stores.id, groupId: schema.stores.groupId })
        .from(schema.stores)
        .where(eq(schema.stores.id, storeId))
        .limit(1);

      if (!loja[0]) throw new Error("Loja não encontrada.");
      const groupId = loja[0].groupId;

      // Estratégia simples e previsível: apaga as afinidades atuais e recria.
      await tx.delete(schema.storeAffinities).where(eq(schema.storeAffinities.storeId, storeId));

      const linhas = [];
      for (const fab of fabricantes) {
        for (const cat of categorias) {
          linhas.push({
            groupId,
            storeId,
            fabricante: fab,
            categoria: cat as "moto" | "leve" | "pesado" | "utilitario",
          });
        }
      }
      if (linhas.length > 0) {
        await tx.insert(schema.storeAffinities).values(linhas);
      }
    });
  } catch (e: any) {
    return { ok: false, message: "Não foi possível salvar as afinidades." };
  }

  revalidatePath(`/lojas/${storeId}`);
  return { ok: true, message: "Afinidades salvas." };
}
