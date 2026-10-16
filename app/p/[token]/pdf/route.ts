import { NextResponse } from "next/server";
import { urlApp } from "@/lib/mensagem";

export const dynamic = "force-dynamic";

/**
 * A proposta deixou de ter PDF próprio: ela é a apresentação do link, e o PDF o
 * cliente gera pelo botão "Baixar PDF" da própria página, sempre igual à tela.
 * Esta rota continua existindo só para não quebrar links já enviados.
 */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.redirect(`${urlApp()}/p/${token}`, 308);
}
