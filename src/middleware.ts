// Middleware de proteção de rotas.
// Tudo que não for a página de login ou a API de auth exige sessão.
// Sem login → redireciona para /login.

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  // Rotas públicas: login, endpoints do Auth.js, webhooks, cron e o PORTAL do
  // cliente (o portal tem seu próprio circuito de autenticação; o cron é
  // protegido pelo CRON_SECRET dentro da própria rota).
  const isPublic =
    pathname === "/login" ||
    // Recuperação de senha: quem esqueceu a senha não tem como estar logado.
    pathname === "/esqueci-senha" ||
    pathname === "/redefinir-senha" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/cron/") ||
    // API de integração: autentica por chave própria (X-Api-Key), não por
    // sessão. Deixá-la sob o login do painel impediria qualquer DMS de chamar.
    pathname.startsWith("/api/v1/") ||
    pathname.startsWith("/portal"); // portal do cliente final (auth própria)

  if (isPublic) return NextResponse.next();

  if (!isLoggedIn) {
    const url = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(url);
  }

  // Modo "ver como" é SOMENTE LEITURA: recusa qualquer ação de servidor.
  //
  // É a primeira das duas travas — a segunda é o banco, que abre as
  // transações como READ ONLY. Esta existe porque algumas ações falam com a
  // Asaas ANTES de gravar no banco: um estorno feito "como" o vendedor
  // devolveria dinheiro de verdade, e só a gravação local falharia.
  //
  // Só vale para a Veilig: para qualquer outro papel o cookie é ignorado, como
  // na leitura da sessão. Nome do cookie repetido aqui porque o middleware
  // roda no edge e não deve importar código que depende de Node.
  const role = (req.auth?.user as any)?.role;
  if (
    role === "veilig_admin" &&
    req.headers.get("next-action") &&
    req.cookies.get("veilig_ver_como")?.value
  ) {
    return NextResponse.json(
      { erro: "Modo ver como é somente leitura. Saia do modo para agir." },
      { status: 403 }
    );
  }

  // Troca de senha obrigatória: enquanto não trocar, só acessa /trocar-senha.
  const precisaTrocar = (req.auth?.user as any)?.precisaTrocarSenha;
  if (precisaTrocar && pathname !== "/trocar-senha") {
    const url = new URL("/trocar-senha", req.nextUrl.origin);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

// Aplica a todas as rotas, exceto arquivos estáticos e assets.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico)).*)"],
};
