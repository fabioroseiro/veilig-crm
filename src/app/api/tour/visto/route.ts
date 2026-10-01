import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSessionContext } from "@/lib/session";
import { TOUR_IDS } from "@/lib/tours";

export const dynamic = "force-dynamic";

/**
 * Registra que o usuário viu um tour.
 *
 * Rota comum, não ação de servidor: no modo "ver como" as ações são recusadas
 * pelo middleware. E nesse modo ela não grava nada — a Veilig não pode marcar
 * como visto o tour de outra pessoa.
 */
export async function POST(req: Request) {
  const ctx = await getSessionContext().catch(() => null);
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");

  if (!ctx || ctx.somenteLeitura || !ctx.userId || !TOUR_IDS.includes(id)) {
    return NextResponse.json({ ok: false });
  }

  try {
    await db.execute(sql`SELECT marcar_tour_visto(${ctx.userId}::uuid, ${id})`);
  } catch (e: any) {
    console.error("[TOUR] falha ao marcar:", e?.message);
  }
  return NextResponse.json({ ok: true });
}
