"use server";

import { getSessionContext } from "@/lib/session";
import { importarHistoricoCobrancas } from "@/lib/importar-cobrancas";

export type ImportResult = { ok: boolean; message: string };

/**
 * Carga inicial do espelho de cobranças. Só a Veilig dispara — é operação de
 * plataforma, não de grupo.
 */
export async function importarCobrancas(): Promise<ImportResult> {
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin") {
    return { ok: false, message: "Apenas a administração Veilig." };
  }

  try {
    const r = await importarHistoricoCobrancas();
    return { ok: r.falhas === 0, message: r.mensagem };
  } catch (e: any) {
    console.error("[IMPORT] falhou:", e?.message);
    return { ok: false, message: `Falhou: ${e?.message ?? "erro desconhecido"}` };
  }
}
