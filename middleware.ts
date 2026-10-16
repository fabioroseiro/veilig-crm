import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, lerToken } from "./lib/sessao";

const LIVRES = ["/login", "/primeiro-acesso", "/sair", "/api/cron", "/api/site", "/p"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (LIVRES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  const id = await lerToken(req.cookies.get(COOKIE)?.value).catch(() => null);
  if (!id) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Os arquivos de /public usados na página pública da proposta precisam ficar fora do
// middleware: sem sessão, a requisição da imagem viraria redirecionamento para o login
// e o navegador receberia HTML no lugar do PNG.
export const config = {
  matcher: ["/((?!_next/|icon.png|logo.png|proposta-ciclo.png|favicon.ico|fontes/).*)"],
};
