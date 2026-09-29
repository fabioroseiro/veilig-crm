import { NextResponse } from "next/server";
import { propostaPorToken, remetenteProposta, emitidaISO } from "@/lib/proposta";
import { conteudoProposta } from "@/lib/proposta-conteudo";
import { gerarPdfProposta } from "@/lib/proposta-pdf";

export const dynamic = "force-dynamic";

/** PDF da proposta, pelo mesmo token do link. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await propostaPorToken(token);
  if (!p || p.status === "cancelada") return NextResponse.json({ erro: "Proposta não encontrada" }, { status: 404 });
  const pdf = await gerarPdfProposta(conteudoProposta(p.dados, p.numero, emitidaISO(p), p.validade, await remetenteProposta()));
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="Proposta Veilig ${p.numero}.pdf"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
}
