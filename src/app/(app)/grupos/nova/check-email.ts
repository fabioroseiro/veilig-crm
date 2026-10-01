"use server";

import { dominioDeEmailExiste } from "@/lib/email-dominio";

/**
 * Checagem do domínio ao sair do campo, para o erro aparecer enquanto a pessoa
 * ainda está olhando para ele — e não depois de preencher o formulário inteiro.
 */
export async function checarDominioEmail(email: string): Promise<{ ok: boolean }> {
  if (!email || !email.includes("@")) return { ok: true };
  return { ok: await dominioDeEmailExiste(email) };
}
