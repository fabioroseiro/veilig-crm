import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { lerLeadSite, receberLeadSite } from "@/lib/entrada-site";

export const dynamic = "force-dynamic";

/** Compara o segredo sem vazar tempo de comparação. */
function autorizado(req: Request) {
  const segredo = process.env.SITE_SEGREDO;
  if (!segredo) return false;
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(req.headers.get("authorization") || ""), h(`Bearer ${segredo}`));
}

/** Recebe os leads do site (simulador e formulário de contato). */
export async function POST(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const lead = lerLeadSite((await req.json().catch(() => null)) as Record<string, unknown> | null);
  if (!lead) return NextResponse.json({ erro: "dados inválidos" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await receberLeadSite(lead)) });
  } catch (e) {
    console.error("[site] lead:", e);
    return NextResponse.json({ erro: "falha ao registrar" }, { status: 500 });
  }
}
