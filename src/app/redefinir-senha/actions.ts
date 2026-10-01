"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { validarForcaSenha } from "@/lib/senha";

export type RedefinirResult = { ok: boolean; message: string };

const hashDoToken = (t: string) =>
  crypto.createHash("sha256").update(String(t ?? "")).digest("hex");

/** O link ainda vale? Usado para mostrar o formulário ou o aviso de expirado. */
export async function conferirToken(token: string): Promise<{ valido: boolean; email: string | null }> {
  try {
    const r = await db.execute(sql`SELECT * FROM token_senha_valido(${hashDoToken(token)})`);
    const l = (Array.isArray(r) ? r : (r as any).rows)[0] as { valido: boolean; email: string } | undefined;
    return { valido: l?.valido === true, email: l?.email ?? null };
  } catch (e: any) {
    console.error("[SENHA] falha ao conferir token:", e?.message);
    return { valido: false, email: null };
  }
}

/**
 * Grava a nova senha.
 *
 * A troca e a marcação do token como usado acontecem na mesma operação, no
 * banco: sem isso, dois cliques no link trocariam a senha duas vezes.
 *
 * Ao final, desbloqueia o login — quem esqueceu a senha normalmente errou
 * várias vezes antes, e sairia daqui com a senha nova e a conta travada.
 */
export async function redefinirSenha(formData: FormData): Promise<RedefinirResult> {
  const token = String(formData.get("token") || "");
  const senha = String(formData.get("senha") || "");
  const repetir = String(formData.get("repetir") || "");

  if (senha !== repetir) return { ok: false, message: "As senhas não conferem." };

  const { valido, email } = await conferirToken(token);
  if (!valido) {
    return { ok: false, message: "Este link expirou ou já foi usado. Peça um novo." };
  }

  const fraca = validarForcaSenha(senha, { email: email ?? undefined });
  if (fraca) return { ok: false, message: fraca };

  try {
    const hash = await bcrypt.hash(senha, 10);
    const r = await db.execute(sql`SELECT usar_token_senha(${hashDoToken(token)}, ${hash}) AS email`);
    const emailTrocado = (Array.isArray(r) ? r : (r as any).rows)[0]?.email as string | null;

    if (!emailTrocado) {
      return { ok: false, message: "Este link expirou ou já foi usado. Peça um novo." };
    }

    try {
      await db.execute(sql`SELECT limpar_bloqueio_login(${emailTrocado})`);
    } catch (e: any) {
      // A senha já foi trocada; o bloqueio expira sozinho em 15 minutos.
      console.error("[SENHA] não foi possível limpar o bloqueio:", e?.message);
    }
  } catch (e: any) {
    console.error("[SENHA] falha ao redefinir:", e?.message);
    return { ok: false, message: "Não foi possível salvar a nova senha. Tente de novo." };
  }

  return { ok: true, message: "Senha alterada. Você já pode entrar." };
}
