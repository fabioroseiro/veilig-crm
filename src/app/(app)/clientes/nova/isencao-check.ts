"use server";

import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";

/**
 * Há isenção aprovada e válida para este CPF nesta loja?
 *
 * Consultado quando o vendedor volta do gestor: ele precisa VER que já pode
 * fechar sem carência, senão fecharia com, sem querer.
 *
 * CUIDADO QUE JÁ CUSTOU UM BUG: a versão anterior consultava
 * `isencao_carencia` direto pelo `db`, sem contexto de tenant. A tabela tem
 * RLS, então a consulta voltava VAZIA — a tela dizia que não havia aprovação
 * enquanto a venda, que usa o caminho certo, saía sem carência. Mesma
 * armadilha do portal e do contrato.
 *
 * A resposta continua sendo informativa: quem decide de verdade é o servidor,
 * na venda.
 */
export async function temIsencaoValida(
  cpf: string,
  storeId: string,
  vehicleModelId: string
): Promise<{ valida: boolean; motivo?: string }> {
  const ctx = await getSessionContext();
  if (!ctx.userId) return { valida: false };

  const cpfLimpo = (cpf ?? "").replace(/\D/g, "");
  if (cpfLimpo.length !== 11 || !storeId || !vehicleModelId) return { valida: false };

  try {
    return await withTenant(ctx, async (tx) => {
      // A MESMA função que a venda usa. Duas implementações da mesma regra
      // divergiriam — e a divergência apareceria justamente aqui, com a tela
      // dizendo uma coisa e a venda fazendo outra.
      const r = await tx.execute(
        sql`SELECT isencao_valida(${cpfLimpo}, ${storeId}::uuid, ${vehicleModelId}::uuid) AS id`
      );
      const id = ((Array.isArray(r) ? r : (r as any).rows)[0]?.id as string) ?? null;
      if (!id) return { valida: false };

      const [iso] = await tx
        .select({ motivo: schema.isencoesCarencia.motivo })
        .from(schema.isencoesCarencia)
        .where(eq(schema.isencoesCarencia.id, id))
        .limit(1);

      return { valida: true, motivo: iso?.motivo };
    });
  } catch (e: any) {
    console.error("[ISENCAO] falha ao checar:", e?.message);
    return { valida: false };
  }
}
