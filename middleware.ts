import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, lerToken } from "./lib/sessao";

const LIVRES = ["/login", "/primeiro-acesso", "/sair", "/api/cron"];

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

export const config = { matcher: ["/((?!_next/|icon.png|logo.png|favicon.ico|fontes/).*)"] };
