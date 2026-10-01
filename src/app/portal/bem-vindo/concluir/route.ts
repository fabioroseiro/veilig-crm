import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getClienteAuthId } from "@/lib/cliente-session";

export const dynamic = "force-dynamic";

/** Marca como visto e segue para o portal. */
export async function POST(req: Request) {
  const authId = await getClienteAuthId();
  if (authId) {
    try {
      await db.execute(sql`SELECT marcar_onboarding_cliente(${authId}::uuid)`);
    } catch (e: any) {
      // Falhar aqui não pode prender o cliente na tela de boas-vindas.
      console.error("[ONBOARDING] falha ao marcar cliente:", e?.message);
    }
  }
  return NextResponse.redirect(new URL("/portal", req.url), 303);
}
