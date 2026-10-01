"use server";

import { sql } from "drizzle-orm";
import { withTenant } from "@/db";
import { getSessionContext } from "@/lib/session";

const soDigitos = (s: string) => (s || "").replace(/\D/g, "");

// Verifica se o CPF já teve assinatura cancelada (ponto de atenção ao reassinar).
// Camada 1: só sinaliza — não calcula diferença nem bloqueia.
export async function checarCancelamentoAnterior(cpfBruto: string): Promise<{ jaCancelou: boolean; qtd: number }> {
  const cpf = soDigitos(cpfBruto);
  if (cpf.length !== 11) return { jaCancelou: false, qtd: 0 };
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) => {
    const r = await tx.execute(sql`SELECT assinaturas_canceladas_por_cpf(${cpf}) AS n`);
    const n = Number((Array.isArray(r) ? r : (r as any).rows)[0]?.n ?? 0);
    return { jaCancelou: n > 0, qtd: n };
  });
}
