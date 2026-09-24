import { NextResponse } from "next/server";
import { rodar } from "@/lib/cadencia";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Chamado pela Vercel Cron nos dias úteis, em horário comercial. */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  try {
    return NextResponse.json(await rodar());
  } catch (e) {
    console.error("[cron] cadências:", e);
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
