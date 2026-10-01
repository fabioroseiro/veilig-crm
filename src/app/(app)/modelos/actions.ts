"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { vehicleModelSchema } from "@/lib/vehicle-model-validation";
import { withTenant, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getSessionContext } from "@/lib/session";

export type FormState = {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
};

export async function criarModelo(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await getSessionContext();

  // Somente a Veilig gerencia o catálogo central de modelos.
  if (ctx.role !== "veilig_admin") {
    return { ok: false, message: "Apenas a Veilig pode cadastrar modelos." };
  }

  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = vehicleModelSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors, values: raw, message: "Verifique os campos." };
  }

  const data = parsed.data;

  try {
    await withTenant(ctx, async (tx) => {
      await tx.insert(schema.vehicleModels).values({
        fabricante: data.fabricante,
        modelo: data.modelo,
        versao: data.versao || "",
        categoria: data.categoria,
        status: "ativo",
      });
    });
  } catch (e: any) {
    if (String(e?.message || "").includes("uq_vehicle_model")) {
      return {
        ok: false,
        values: raw,
        message: "Este modelo já está cadastrado.",
      };
    }
    return { ok: false, values: raw, message: "Não foi possível cadastrar o modelo." };
  }

  revalidatePath("/modelos");
  redirect("/modelos?criado=1");
}

// Edita um modelo do catálogo (todos os campos). Trava de duplicidade no banco.
export async function editarModelo(
  modelId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin") {
    return { ok: false, message: "Apenas a Veilig pode editar modelos." };
  }

  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = vehicleModelSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors, values: raw, message: "Verifique os campos." };
  }

  const data = parsed.data;

  try {
    await withTenant(ctx, async (tx) => {
      await tx
        .update(schema.vehicleModels)
        .set({
          fabricante: data.fabricante,
          modelo: data.modelo,
          versao: data.versao || "",
            categoria: data.categoria,
        })
        .where(eq(schema.vehicleModels.id, modelId));
    });
  } catch (e: any) {
    if (String(e?.message || "").includes("uq_vehicle_model")) {
      return { ok: false, values: raw, message: "Já existe outro modelo com este fabricante, modelo e versão." };
    }
    return { ok: false, values: raw, message: "Não foi possível salvar o modelo." };
  }

  revalidatePath("/modelos");
  redirect("/modelos?editado=1");
}

// Inativa/reativa um modelo (soft delete — não apaga, pois há precificações e
// assinaturas ligadas a ele; apenas some dos novos cadastros).
export async function alternarStatusModelo(modelId: string, novoStatus: "ativo" | "inativo") {
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin") return;
  await withTenant(ctx, async (tx) => {
    await tx
      .update(schema.vehicleModels)
      .set({ status: novoStatus })
      .where(eq(schema.vehicleModels.id, modelId));
  });
  revalidatePath("/modelos");
}
