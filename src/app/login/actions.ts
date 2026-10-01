"use server";

import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { verificarLimiteLogin } from "@/lib/rate-limit";

export type LoginState = { error?: string };

export async function fazerLogin(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") || "").toLowerCase().trim();

  // Verificado ANTES do signIn: o Auth.js só sabe devolver erro genérico, e
  // "e-mail ou senha incorretos" com a senha CERTA faz o usuário achar que o
  // sistema quebrou. Ele precisa saber que está bloqueado e por quanto tempo.
  //
  // Sobre revelar o bloqueio: quem chegou a disparar o limite já sabe que a
  // conta existe. O que se ganha escondendo é quase nada; o que se perde é um
  // usuário legítimo sem entender o que houve.
  const limite = await verificarLimiteLogin(email);
  if (limite.bloqueado) {
    return { error: limite.mensagem };
  }

  try {
    await signIn("credentials", {
      email,
      senha: String(formData.get("senha") || ""),
      // Painel, não /lojas: é a tela que resume o negócio e existe para os
      // quatro papéis. Mandar para Lojas fazia o vendedor cair numa lista que
      // ele nem gerencia, e o admin numa tela operacional em vez do resumo.
      redirectTo: "/",
    });
    return {};
  } catch (e) {
    if (e instanceof AuthError) {
      // Depois da falha, avisa quantas tentativas restam — o aviso chega antes
      // do bloqueio, não depois.
      const apos = await verificarLimiteLogin(email);
      if (apos.bloqueado) return { error: apos.mensagem };
      if (apos.restantes != null && apos.restantes <= 2) {
        return {
          error:
            `E-mail ou senha incorretos. Mais ${apos.restantes} ` +
            `${apos.restantes === 1 ? "tentativa" : "tentativas"} antes do bloqueio temporário.`,
        };
      }
      return { error: "E-mail ou senha incorretos." };
    }
    // O signIn lança um redirect em caso de sucesso — precisa propagar.
    throw e;
  }
}
