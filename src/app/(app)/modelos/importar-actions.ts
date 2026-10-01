"use server";

import { revalidatePath } from "next/cache";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { lerModelosColados, type ResultadoLeitura } from "@/lib/importar-modelos";
import { CATEGORIAS } from "@/lib/vehicle-model-validation";

/**
 * Analisa o texto colado SEM gravar nada.
 *
 * A pré-visualização é o ponto do desenho: importação que grava direto é como
 * se descobre 40 modelos errados depois. Aqui a pessoa vê o que o sistema
 * entendeu, o que é duplicado e o que tem erro, e só então confirma.
 */
export async function analisarModelos(
  texto: string,
  fabricante: string
): Promise<ResultadoLeitura & { erro?: string }> {
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin") {
    return { novos: [], duplicados: [], invalidos: [], erro: "Apenas a Veilig gerencia o catálogo." };
  }
  if (!fabricante.trim()) {
    return { novos: [], duplicados: [], invalidos: [], erro: "Informe o fabricante." };
  }

  // Compara contra o catálogo INTEIRO daquele fabricante, não só a página
  // atual — senão um modelo já cadastrado passaria como novo e o banco
  // recusaria com erro de chave duplicada.
  const existentes = await withTenant(ctx, async (tx) =>
    tx
      .select({
        fabricante: schema.vehicleModels.fabricante,
        modelo: schema.vehicleModels.modelo,
        versao: schema.vehicleModels.versao,
      })
      .from(schema.vehicleModels)
  );

  return lerModelosColados(texto, fabricante, existentes);
}

/**
 * Grava as linhas aprovadas.
 *
 * Reanalisa em vez de confiar na lista vinda da tela: entre a análise e a
 * confirmação alguém pode ter cadastrado o mesmo modelo, e o que a tela mandou
 * é manipulável.
 */
export async function importarModelos(
  texto: string,
  fabricante: string,
  categoria: string
): Promise<{ ok: boolean; inseridos: number; message?: string }> {
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin") {
    return { ok: false, inseridos: 0, message: "Apenas a Veilig pode cadastrar modelos." };
  }
  if (!CATEGORIAS.some((c) => c.valor === categoria)) {
    return { ok: false, inseridos: 0, message: "Categoria inválida." };
  }

  const analise = await analisarModelos(texto, fabricante);
  if (analise.erro) return { ok: false, inseridos: 0, message: analise.erro };
  if (analise.novos.length === 0) {
    return { ok: false, inseridos: 0, message: "Nenhum modelo novo para importar." };
  }

  try {
    await withTenant(ctx, async (tx) => {
      // Uma transação só: ou entra tudo, ou nada. Importação pela metade
      // deixaria a pessoa sem saber o que já foi e o que falta.
      await tx.insert(schema.vehicleModels).values(
        analise.novos.map((m) => ({
          fabricante: fabricante.trim(),
          modelo: m.modelo,
          versao: m.versao,
          categoria: categoria as any,
          status: "ativo" as const,
        }))
      );
    });
  } catch (e: any) {
    console.error("[IMPORTAR MODELOS] falha:", e?.message);
    return {
      ok: false,
      inseridos: 0,
      message: `Não foi possível importar. Detalhe: ${e?.message ?? "erro desconhecido"}`,
    };
  }

  revalidatePath("/modelos");
  return { ok: true, inseridos: analise.novos.length };
}
