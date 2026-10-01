"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, and, inArray } from "drizzle-orm";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { propagarPrecosDoGrupo } from "@/lib/precos-grupo";
import { lerRevisoesDoForm, lerBeneficiosDoForm, lerModelosDoForm, lerArgumentosDoForm, regravarRevisoes, regravarBeneficios, regravarArgumentos, limitesParaBanco } from "@/lib/plano-revisoes";
import { planoSchema } from "@/lib/plano-validation";
import type { FormState } from "../../nova/actions";

// Só quem manda no grupo mexe em plano: Veilig e gestor do grupo.
// Gestor de loja define PREÇO, não altera o plano em si.
function podeEditarPlano(role: string) {
  return role === "veilig_admin" || role === "group_admin";
}

export async function editarPlano(
  planId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await getSessionContext();
  if (!podeEditarPlano(ctx.role)) {
    return { ok: false, message: "Você não tem permissão para editar planos." };
  }

  const raw = {
    nome: String(formData.get("nome") || ""),
    descricao: String(formData.get("descricao") || ""),
    modelos: lerModelosDoForm(String(formData.get("modelos") || "[]")),
    aceitaZeroKm: formData.get("aceitaZeroKm") === "on",
    idadeMaximaAnos: String(formData.get("idadeMaximaAnos") || ""),
    carenciaZeroKm: String(formData.get("carenciaZeroKm") || ""),
    carenciaAte2Anos: String(formData.get("carenciaAte2Anos") || ""),
    carencia3a5Anos: String(formData.get("carencia3a5Anos") || ""),
    carencia6Mais: String(formData.get("carencia6Mais") || ""),
    acrescimoAte2Anos: String(formData.get("acrescimoAte2Anos") || ""),
    acrescimo3a5Anos: String(formData.get("acrescimo3a5Anos") || ""),
    acrescimo6Mais: String(formData.get("acrescimo6Mais") || ""),
    limiteRevisoesAno: String(formData.get("limiteRevisoesAno") || ""),
    limiteValorPecasAno: String(formData.get("limiteValorPecasAno") || ""),
    limiteValorMaoObraAno: String(formData.get("limiteValorMaoObraAno") || ""),
    limiteValorTotalAno: String(formData.get("limiteValorTotalAno") || ""),
    limiteKmAno: String(formData.get("limiteKmAno") || ""),
    exclusoes: String(formData.get("exclusoes") || ""),
    revisoes: lerRevisoesDoForm(String(formData.get("revisoes") || "[]")),
    beneficios: lerBeneficiosDoForm(String(formData.get("beneficios") || "[]")),
    argumentos: lerArgumentosDoForm(String(formData.get("argumentos") || "[]")),
    condicoes: String(formData.get("condicoes") || ""),
    precoPeloGrupo: formData.get("precoPeloGrupo") === "on",
  };
  const valuesEcho = {
    nome: raw.nome,
    descricao: raw.descricao,
    aceitaZeroKm: raw.aceitaZeroKm ? "on" : "",
    idadeMaximaAnos: raw.idadeMaximaAnos,
    carenciaZeroKm: raw.carenciaZeroKm,
    carenciaAte2Anos: raw.carenciaAte2Anos,
    carencia3a5Anos: raw.carencia3a5Anos,
    carencia6Mais: raw.carencia6Mais,
    acrescimoAte2Anos: raw.acrescimoAte2Anos,
    acrescimo3a5Anos: raw.acrescimo3a5Anos,
    acrescimo6Mais: raw.acrescimo6Mais,
    limiteRevisoesAno: raw.limiteRevisoesAno,
    limiteValorPecasAno: raw.limiteValorPecasAno,
    limiteValorMaoObraAno: raw.limiteValorMaoObraAno,
    limiteValorTotalAno: raw.limiteValorTotalAno,
    limiteKmAno: raw.limiteKmAno,
    exclusoes: raw.exclusoes,
    condicoes: raw.condicoes,
    precoPeloGrupo: raw.precoPeloGrupo ? "on" : "",
  };

  const parsed = planoSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors, values: valuesEcho, message: "Verifique os campos." };
  }

  const data = parsed.data;

  try {
    await withTenant(ctx, async (tx) => {
      const atual = await tx
        .select({ id: schema.plans.id, groupId: schema.plans.groupId })
        .from(schema.plans)
        .where(eq(schema.plans.id, planId))
        .limit(1);
      if (!atual[0]) throw new Error("nao-encontrado");
      const groupId = atual[0].groupId;

      await tx
        .update(schema.plans)
        .set({
          nome: data.nome,
          descricao: data.descricao || "",
          aceitaZeroKm: data.aceitaZeroKm,
          idadeMaximaAnos: data.idadeMaximaAnos,
          carenciaZeroKm: data.carenciaZeroKm,
          carenciaAte2Anos: data.carenciaAte2Anos,
          carencia3a5Anos: data.carencia3a5Anos,
          carencia6Mais: data.carencia6Mais,
          acrescimoAte2Anos: data.acrescimoAte2Anos.toFixed(2),
          acrescimo3a5Anos: data.acrescimo3a5Anos.toFixed(2),
          acrescimo6Mais: data.acrescimo6Mais.toFixed(2),
          ...limitesParaBanco(data),
          exclusoes: data.exclusoes,
          condicoes: data.condicoes,
          precoPeloGrupo: data.precoPeloGrupo,
          updatedAt: new Date(),
        })
        .where(eq(schema.plans.id, planId));

      // Modelos cobertos: acrescenta os novos e remove os desmarcados.
      //
      // CUIDADO: um modelo desmarcado pode já ter PREÇO cadastrado por alguma
      // loja. Removendo o vínculo, aquele preço fica órfão. Por isso removemos
      // só os que não têm preço; os demais continuam e a tela avisa.
      const atuais = await tx
        .select({ vehicleModelId: schema.planModels.vehicleModelId })
        .from(schema.planModels)
        .where(eq(schema.planModels.planId, planId));
      const idsAtuais = new Set(atuais.map((a) => a.vehicleModelId));
      const idsNovos = new Set(data.modelos.map((m) => m.id));

      const paraAdicionar = data.modelos.filter((m) => !idsAtuais.has(m.id));
      const paraRemover = [...idsAtuais].filter((id) => !idsNovos.has(id));
      // Modelos que continuam podem ter tido o MÍNIMO alterado — sem isto, a
      // edição de preço de um modelo já vinculado seria silenciosamente perdida.
      const paraAtualizar = data.modelos.filter((m) => idsAtuais.has(m.id));

      if (paraAdicionar.length > 0) {
        await tx.insert(schema.planModels).values(
          paraAdicionar.map((m) => ({
            groupId,
            planId,
            vehicleModelId: m.id,
            precoMinimo: m.precoMinimo.toFixed(2),
            fatorCusto: m.fatorCusto.toFixed(2),
          }))
        );
      }

      for (const m of paraAtualizar) {
        await tx
          .update(schema.planModels)
          .set({
            precoMinimo: m.precoMinimo.toFixed(2),
            fatorCusto: m.fatorCusto.toFixed(2),
          })
          .where(
            and(
              eq(schema.planModels.planId, planId),
              eq(schema.planModels.vehicleModelId, m.id)
            )
          );
      }

      if (paraRemover.length > 0) {
        const comPreco = await tx
          .select({ vehicleModelId: schema.storePlanPrices.vehicleModelId })
          .from(schema.storePlanPrices)
          .innerJoin(
            schema.storePlans,
            eq(schema.storePlans.id, schema.storePlanPrices.storePlanId)
          )
          .where(
            and(
              eq(schema.storePlans.planId, planId),
              inArray(schema.storePlanPrices.vehicleModelId, paraRemover)
            )
          );
        const protegidos = new Set(comPreco.map((c) => c.vehicleModelId));
        const removiveis = paraRemover.filter((m) => !protegidos.has(m));
        if (removiveis.length > 0) {
          await tx
            .delete(schema.planModels)
            .where(
              and(
                eq(schema.planModels.planId, planId),
                inArray(schema.planModels.vehicleModelId, removiveis)
              )
            );
        }
      }

      await regravarRevisoes(tx, groupId, planId, data.revisoes);
      await regravarBeneficios(tx, groupId, planId, data.beneficios);
      await regravarArgumentos(tx, groupId, planId, data.argumentos);

      // No modo central, o preço do grupo vira o preço das lojas na hora.
      if (data.precoPeloGrupo) {
        await propagarPrecosDoGrupo(tx, groupId, planId);
      }
    });
  } catch (e: any) {
    if (String(e?.message) === "nao-encontrado") {
      return { ok: false, values: valuesEcho, message: "Plano não encontrado." };
    }
    console.error("[PLANO] falha ao editar:", e?.message);
    return { ok: false, values: valuesEcho, message: "Não foi possível salvar o plano." };
  }

  revalidatePath("/planos");
  redirect("/planos?salvo=1");
}

/**
 * Soft delete, como no resto do sistema: nunca apaga, só muda o status.
 * Plano inativo não aparece para venda, mas as assinaturas já vendidas
 * continuam valendo — o cliente contratou aquele plano.
 */
export async function alternarStatusPlano(planId: string, novo: "ativo" | "inativo") {
  const ctx = await getSessionContext();
  if (!podeEditarPlano(ctx.role)) return;

  await withTenant(ctx, async (tx) => {
    await tx
      .update(schema.plans)
      .set({ status: novo, updatedAt: new Date() })
      .where(eq(schema.plans.id, planId));
  });
  revalidatePath("/planos");
}
