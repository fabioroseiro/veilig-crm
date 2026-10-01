"use server";

import { validarForcaSenha } from "@/lib/senha";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getClienteAuthId } from "@/lib/cliente-session";

export type TrocaState = { message?: string };

export async function trocarSenhaCliente(
  _prev: TrocaState,
  formData: FormData
): Promise<TrocaState> {
  const authId = await getClienteAuthId();
  if (!authId) redirect("/portal/login");

  const nova = String(formData.get("nova") || "");
  const confirma = String(formData.get("confirma") || "");

  // Sem regra de força, o cliente troca a provisória aleatória por algo
  // trivial e desfaz a proteção no mesmo minuto.
  // (O CPF não está no escopo aqui — só o id da credencial. A checagem contra
  // CPF acontece na criação da conta, onde ele é conhecido.)
  const problema = validarForcaSenha(nova);
  if (problema) return { message: problema };
  if (!/[a-zA-Z]/.test(nova) || !/[0-9]/.test(nova)) return { message: "Use ao menos uma letra e um número." };
  if (nova !== confirma) return { message: "A confirmação não confere." };

  const hash = bcrypt.hashSync(nova, 10);
  await db.execute(sql`SELECT atualizar_senha_cliente(${authId}::uuid, ${hash})`);

  redirect("/portal");
}
