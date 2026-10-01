"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { validarForcaSenha } from "@/lib/senha";

export type RedefinirCliente = { ok: boolean; message: string };

const hashDoToken = (t: string) =>
  crypto.createHash("sha256").update(String(t ?? "")).digest("hex");

export async function conferirTokenCliente(token: string): Promise<boolean> {
  try {
    const r = await db.execute(sql`SELECT token_senha_cliente_valido(${hashDoToken(token)}) AS v`);
    return (Array.isArray(r) ? r : (r as any).rows)[0]?.v === true;
  } catch (e: any) {
    console.error("[PORTAL] falha ao conferir token:", e?.message);
    return false;
  }
}

export async function redefinirSenhaCliente(formData: FormData): Promise<RedefinirCliente> {
  const token = String(formData.get("token") || "");
  const senha = String(formData.get("senha") || "");
  const repetir = String(formData.get("repetir") || "");

  if (senha !== repetir) return { ok: false, message: "As senhas não conferem." };
  if (!(await conferirTokenCliente(token))) {
    return { ok: false, message: "Este link expirou ou já foi usado. Peça um novo." };
  }

  const fraca = validarForcaSenha(senha);
  if (fraca) return { ok: false, message: fraca };

  try {
    const hash = await bcrypt.hash(senha, 10);
    const r = await db.execute(sql`SELECT usar_token_senha_cliente(${hashDoToken(token)}, ${hash}) AS cpf`);
    const cpf = (Array.isArray(r) ? r : (r as any).rows)[0]?.cpf as string | null;

    if (!cpf) return { ok: false, message: "Este link expirou ou já foi usado. Peça um novo." };

    try {
      // Usar um link enviado ao e-mail PROVA que o endereço é do cliente.
      // É assim que a verificação acontece — sem pedir nada a mais a ele.
      await db.execute(sql`SELECT marcar_email_verificado(${cpf})`);
    } catch (e: any) {
      console.error("[PORTAL] não foi possível marcar o e-mail:", e?.message);
    }

    try {
      // O bloqueio do portal é registrado pelo CPF. Quem esqueceu a senha
      // costuma ter errado várias vezes antes.
      await db.execute(sql`SELECT limpar_bloqueio_login(${cpf})`);
    } catch (e: any) {
      console.error("[PORTAL] não foi possível limpar o bloqueio:", e?.message);
    }
  } catch (e: any) {
    console.error("[PORTAL] falha ao redefinir:", e?.message);
    return { ok: false, message: "Não foi possível salvar a nova senha. Tente de novo." };
  }

  return { ok: true, message: "Senha alterada. Você já pode entrar." };
}
