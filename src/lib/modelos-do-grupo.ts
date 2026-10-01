import { eq } from "drizzle-orm";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";

/**
 * Modelos que o grupo pode incluir num plano = os que casam com a afinidade
 * (fabricante + categoria) de alguma loja do grupo. Sem afinidade, lista vazia.
 * A Veilig enxerga o catálogo inteiro.
 *
 * Fica aqui, e não dentro da página, porque as telas de CRIAR e de EDITAR plano
 * precisam exatamente da mesma lista.
 */
export async function getModelosDoGrupo() {
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) => {
    const todos = await tx
      .select({
        id: schema.vehicleModels.id,
        fabricante: schema.vehicleModels.fabricante,
        modelo: schema.vehicleModels.modelo,
        versao: schema.vehicleModels.versao,
        categoria: schema.vehicleModels.categoria,
      })
      .from(schema.vehicleModels)
      .where(eq(schema.vehicleModels.status, "ativo"));

    if (ctx.role === "veilig_admin") return todos;

    const afinidades = await tx
      .select({
        fabricante: schema.storeAffinities.fabricante,
        categoria: schema.storeAffinities.categoria,
      })
      .from(schema.storeAffinities);

    if (afinidades.length === 0) return [];
    const pares = new Set(afinidades.map((a) => `${a.fabricante}|${a.categoria}`));
    return todos.filter((m) => pares.has(`${m.fabricante}|${m.categoria}`));
  });
}
