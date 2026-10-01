"use server";

import bcrypt from "bcryptjs";
import { verificarLimiteLogin, registrarTentativa } from "@/lib/rate-limit";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { criarSessaoCliente } from "@/lib/cliente-session";
import { soDigitos } from "@/lib/loja-validation";

export type LoginState = { message?: string };

export async function loginCliente(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const cpf = soDigitos(String(formData.get("cpf") || ""));
  const senha = String(formData.get("senha") || "");

  if (cpf.length !== 11 || !senha) {
    return { message: "Informe CPF e senha." };
  }

  // Força bruta: bloqueia antes de consultar a credencial.
  const limite = await verificarLimiteLogin(cpf);
  if (limite.bloqueado) {
    return { message: limite.mensagem };
  }

  // busca a credencial do cliente (função SECURITY DEFINER)
  const r = await db.execute(sql`SELECT * FROM customer_auth_by_cpf(${cpf})`);
  const cred = (Array.isArray(r) ? r : (r as any).rows)[0] as
    | { id: string; senha_hash: string; precisa_trocar_senha: boolean; status: string }
    | undefined;

  // Mensagem idêntica nos dois casos e falha registrada mesmo quando o CPF
  // não existe: caso contrário, dá para descobrir quais CPFs têm conta.
  if (!cred || cred.status !== "ativo") {
    await registrarTentativa(cpf, "portal", false);
    return { message: "CPF ou senha inválidos." };
  }
  const ok = bcrypt.compareSync(senha, cred.senha_hash);
  if (!ok) {
    await registrarTentativa(cpf, "portal", false);
    return { message: "CPF ou senha inválidos." };
  }

  await registrarTentativa(cpf, "portal", true);
  await criarSessaoCliente(cred.id);

  if (cred.precisa_trocar_senha) {
    redirect("/portal/trocar-senha");
  }
  redirect("/portal");
}
