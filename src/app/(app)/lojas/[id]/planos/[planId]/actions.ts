"use server";

import { revalidatePath } from "next/cache";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { VALOR_MINIMO_COBRANCA } from "@/lib/plano-validation";
import { parsePreco } from "@/lib/plano-validation";
import { and, eq } from "drizzle-orm";

export type PrecoState = { ok?: boolean; message?: string; erros?: Record<string, string> };

// Salva os preços por modelo de um plano numa loja.
// Recebe pares preco_<vehicleModelId> = valor. Vazio = não vende (remove preço).
// Regra: preço informado não pode ser menor que o preço mínimo do plano.
export async function salvarPrecos(
  storeId: string,
  planId: string,
  _prev: PrecoState,
  formData: FormData
): Promise<PrecoState> {
  const ctx = await getSessionContext();

  try {
    return await withTenant(ctx, async (tx) => {
      // valida loja + plano no tenant e pega o preço mínimo do plano
      const planoRows = await tx
        .select({ id: schema.plans.id, groupId: schema.plans.groupId })
        .from(schema.plans)
        .where(eq(schema.plans.id, planId))
        .limit(1);
      const plano = planoRows[0];
      if (!plano) return { ok: false, message: "Plano não encontrado." };

      const lojaRows = await tx
        .select({ id: schema.stores.id, groupId: schema.stores.groupId })
        .from(schema.stores)
        .where(eq(schema.stores.id, storeId))
        .limit(1);
      const loja = lojaRows[0];
      if (!loja) return { ok: false, message: "Loja não encontrada." };

      const groupId = loja.groupId;

      // O piso agora é POR MODELO, não único do plano: uma 160cc e uma 400cc
      // no mesmo plano têm custos de manutenção muito diferentes.
      const minimosRows = await tx
        .select({
          vehicleModelId: schema.planModels.vehicleModelId,
          precoMinimo: schema.planModels.precoMinimo,
        })
        .from(schema.planModels)
        .where(eq(schema.planModels.planId, planId));
      const minimoPorModelo = new Map(
        minimosRows.map((m) => [m.vehicleModelId, Number(m.precoMinimo)])
      );

      // afinidade da loja: só permite precificar modelos compatíveis
      const afinidades = await tx
        .select({
          fabricante: schema.storeAffinities.fabricante,
          categoria: schema.storeAffinities.categoria,
        })
        .from(schema.storeAffinities)
        .where(eq(schema.storeAffinities.storeId, storeId));
      const paresAfinidade = new Set(
        afinidades.map((a) => `${a.fabricante}|${a.categoria}`)
      );

      // modelos do plano que a loja pode precificar (compatíveis com afinidade)
      const modelosPlano = await tx
        .select({
          id: schema.vehicleModels.id,
          fabricante: schema.vehicleModels.fabricante,
          categoria: schema.vehicleModels.categoria,
        })
        .from(schema.planModels)
        .innerJoin(schema.vehicleModels, eq(schema.planModels.vehicleModelId, schema.vehicleModels.id))
        .where(eq(schema.planModels.planId, planId));
      const permitidos = new Set(
        modelosPlano
          .filter((m) => paresAfinidade.has(`${m.fabricante}|${m.categoria}`))
          .map((m) => m.id)
      );

      // coleta os preços do form: campos preco_<modelId>
      const precos: { modelId: string; valor: number }[] = [];
      const erros: Record<string, string> = {};
      for (const [key, raw] of formData.entries()) {
        if (!key.startsWith("preco_")) continue;
        const modelId = key.slice("preco_".length);
        if (!permitidos.has(modelId)) continue; // ignora modelos fora da afinidade
        const txt = String(raw).trim();
        if (!txt) continue; // vazio = não vende
        const n = parsePreco(txt);
        if (n === null || n <= 0) {
          erros[modelId] = "Preço inválido.";
        } else if (n < VALOR_MINIMO_COBRANCA) {
          // Piso da Asaas: abaixo disso a cobrança é recusada na venda.
          erros[modelId] = `Mínimo R$ ${VALOR_MINIMO_COBRANCA.toFixed(2).replace(".", ",")} (limite da Asaas).`;
        } else if (n < (minimoPorModelo.get(modelId) ?? 0)) {
          const min = minimoPorModelo.get(modelId) ?? 0;
          erros[modelId] = `Mínimo R$ ${min.toFixed(2).replace(".", ",")}.`;
        } else {
          precos.push({ modelId, valor: n });
        }
      }

      if (Object.keys(erros).length > 0) {
        return { ok: false, erros, message: "Corrija os preços destacados." };
      }

      // garante o store_plan (instância do plano na loja)
      const existente = await tx
        .select({ id: schema.storePlans.id })
        .from(schema.storePlans)
        .where(and(eq(schema.storePlans.storeId, storeId), eq(schema.storePlans.planId, planId)))
        .limit(1);

      let storePlanId: string;
      if (existente[0]) {
        storePlanId = existente[0].id;
      } else {
        const ins = await tx
          .insert(schema.storePlans)
          .values({ groupId, storeId, planId, status: "ativo" })
          .returning({ id: schema.storePlans.id });
        storePlanId = ins[0].id;
      }

      // estratégia simples: apaga os preços atuais e regrava os informados
      await tx.delete(schema.storePlanPrices).where(eq(schema.storePlanPrices.storePlanId, storePlanId));
      if (precos.length > 0) {
        await tx.insert(schema.storePlanPrices).values(
          precos.map((p) => ({
            groupId,
            storePlanId,
            vehicleModelId: p.modelId,
            preco: p.valor.toFixed(2),
          }))
        );
      }

      revalidatePath(`/lojas/${storeId}/planos/${planId}`);
      return { ok: true, message: `Preços salvos (${precos.length} modelo(s) à venda).` };
    });
  } catch (e: any) {
    return { ok: false, message: "Não foi possível salvar os preços." };
  }
}
