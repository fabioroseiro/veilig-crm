"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { q, q1 } from "./db";
import { COOKIE, criarToken } from "./sessao";

const s = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" ? v.trim() : ""; };
const LIMITE = 5, JANELA_MIN = 15;

export async function entrar(_: unknown, f: FormData) {
  const email = s(f, "email").toLowerCase();
  const senha = s(f, "senha");
  if (!email || !senha) return { erro: "Informe e-mail e senha." };

  const falhas = await q1<{ n: string }>("SELECT count(*) AS n FROM login_falha WHERE email=$1 AND em > now() - ($2 || ' minutes')::interval", [email, JANELA_MIN]);
  if (Number(falhas?.n ?? 0) >= LIMITE) return { erro: `Muitas tentativas. Aguarde ${JANELA_MIN} minutos e tente de novo.` };

  const u = await q1<{ id: string; senha_hash: string }>("SELECT id, senha_hash FROM usuario WHERE lower(email)=$1", [email]);
  // Compara mesmo sem usuário, para não revelar quais e-mails existem.
  const ok = await bcrypt.compare(senha, u?.senha_hash ?? "$2a$12$eixSqlQ/sfJdL5lNYX9DauhxUkWhFHRMJCSYl.HHWzFAcpSEFjc7u");
  if (!u || !ok) {
    await q("INSERT INTO login_falha (email) VALUES ($1)", [email]);
    return { erro: "E-mail ou senha incorretos." };
  }
  await q("DELETE FROM login_falha WHERE email=$1", [email]);
  const { token, maxAge } = await criarToken(u.id);
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge });
  redirect("/hoje");
}

/** Cria os usuários no primeiro acesso. Exige o SETUP_TOKEN definido na Vercel. */
export async function primeiroAcesso(_: unknown, f: FormData) {
  const token = process.env.SETUP_TOKEN;
  if (!token || token.length < 20) return { erro: "O primeiro acesso está desativado (SETUP_TOKEN não configurado)." };
  if (s(f, "token") !== token) return { erro: "Código de configuração inválido." };
  const nome = s(f, "nome"), email = s(f, "email").toLowerCase(), senha = s(f, "senha");
  if (!nome || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { erro: "Informe nome e e-mail válidos." };
  if (senha.length < 10) return { erro: "A senha precisa ter pelo menos 10 caracteres." };
  const total = await q1<{ n: string }>("SELECT count(*) AS n FROM usuario");
  if (Number(total?.n ?? 0) >= 5) return { erro: "Limite de usuários atingido." };
  const existe = await q1("SELECT 1 FROM usuario WHERE lower(email)=$1", [email]);
  if (existe) return { erro: "Este e-mail já tem acesso. Use a tela de login." };
  await q("INSERT INTO usuario (nome, email, senha_hash) VALUES ($1,$2,$3)", [nome, email, await bcrypt.hash(senha, 12)]);
  return { ok: `Acesso criado para ${nome}. Já pode entrar pelo login.` };
}
