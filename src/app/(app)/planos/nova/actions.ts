"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { planoSchema } from "@/lib/plano-validation";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { propagarPrecosDoGrupo } from "@/lib/precos-grupo";
import { lerRevisoesDoForm, lerBeneficiosDoForm, lerModelosDoForm, lerArgumentosDoForm, regravarRevisoes, regravarBeneficios, regravarArgumentos, limitesParaBanco } from "@/lib/plano-revisoes";

export type FormState = {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
};

export async function criarPlano(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await getSessionContext();

  // Planos são criados pelo grupo (ou pela Veilig atuando sobre um grupo).
  if (ctx.role !== "group_admin" && ctx.role !== "veilig_admin") {
    return { ok: false, message: "Sem permissão para criar planos." };
  }
  if (!ctx.groupId && ctx.role !== "veilig_admin") {
    return { ok: false, message: "Usuário sem grupo definido." };
  }

  const raw = {
    nome: String(formData.get("nome") || ""),
    descricao: String(formData.get("descricao") || ""),
    modelos: lerModelosDoForm(String(formData.get("modelos") || "[]")),
    // política de aceitação e carência
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
    groupId: String(formData.get("groupId") || ""),
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

  // Veilig escolhe o grupo; group_admin usa o próprio.
  const grupoEscolhido = String(formData.get("groupId") || "");
  const groupIdAlvo =
    ctx.role === "veilig_admin" ? grupoEscolhido : ctx.groupId;

  if (!groupIdAlvo) {
    return {
      ok: false,
      errors: ctx.role === "veilig_admin" ? { groupId: "Selecione o grupo." } : undefined,
      values: valuesEcho,
      message: "Selecione o grupo para o qual o plano será criado.",
    };
  }

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
      const groupId = groupIdAlvo;

      const inserted = await tx
        .insert(schema.plans)
        .values({
          groupId,
          nome: data.nome,
          descricao: data.descricao || "",
          periodicidade: "mensal",
          status: "ativo",
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
        })
        .returning({ id: schema.plans.id });

      const planId = inserted[0].id;

      const linhas = data.modelos.map((m) => ({
        groupId,
        planId,
        vehicleModelId: m.id,
        precoMinimo: m.precoMinimo.toFixed(2),
        fatorCusto: m.fatorCusto.toFixed(2),
      }));
      if (linhas.length > 0) {
        await tx.insert(schema.planModels).values(linhas);
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
    return { ok: false, values: valuesEcho, message: "Não foi possível criar o plano." };
  }

  revalidatePath("/planos");
  redirect("/planos?criado=1");
}
