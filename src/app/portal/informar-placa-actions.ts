"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getClienteAuthId } from "@/lib/cliente-session";

/**
 * O cliente informa a placa do veículo comprado zero km.
 *
 * Toda a verificação acontece na função SECURITY DEFINER: formato da placa,
 * posse do veículo, e se a placa já não está em uso. Fazer isso aqui seria
 * frágil — o portal roda sem contexto de tenant, e uma checagem em JavaScript
 * pode ser contornada por um POST montado à mão.
 */
export async function informarPlaca(
  subscriptionId: string,
  placa: string
): Promise<{ ok: boolean; message?: string }> {
  const authId = await getClienteAuthId();
  if (!authId) return { ok: false, message: "Sessão expirada. Entre novamente." };

  try {
    const cred = await db.execute(
      sql`SELECT person_id FROM customer_auth WHERE id = ${authId}::uuid LIMIT 1`
    );
    const personId = (Array.isArray(cred) ? cred : (cred as any).rows)[0]?.person_id;
    if (!personId) return { ok: false, message: "Sessão inválida." };

    const r = await db.execute(
      sql`SELECT informar_placa_cliente(
            ${personId}::uuid, ${subscriptionId}::uuid, ${placa}
          ) AS ok`
    );
    const ok = (Array.isArray(r) ? r : (r as any).rows)[0]?.ok === true;

    if (!ok) {
      return {
        ok: false,
        message:
          "Não foi possível registrar a placa. Confira o formato (ABC1D23) e " +
          "veja se ela já não está cadastrada.",
      };
    }

    revalidatePath("/portal");
    return { ok: true };
  } catch (e: any) {
    console.error("[PORTAL] falha ao informar placa:", e?.message);
    return { ok: false, message: "Erro ao registrar a placa. Tente de novo." };
  }
}
