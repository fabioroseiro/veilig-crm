"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/session";
import { ressincronizarStatusCore, type ResyncResult } from "@/lib/ressync";

export type { ResyncResult };

// Botão manual no painel Veilig admin. Só veilig_admin. Reusa o núcleo comum.
export async function ressincronizarStatus(): Promise<ResyncResult> {
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin") {
    return { ok: false, verificadas: 0, corrigidas: 0, falhas: 0, linksRepostos: 0, message: "Sem permissão." };
  }
  const r = await ressincronizarStatusCore();
  revalidatePath("/clientes");
  revalidatePath("/");
  return r;
}
