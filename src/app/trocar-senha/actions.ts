"use server";

import { validarForcaSenha } from "@/lib/senha";

import bcrypt from "bcryptjs";
import { withTenant, schema } from "@/db";
import { eq } from "drizzle-orm";
import { auth, signOut } from "@/lib/auth";
import { getSessionContext } from "@/lib/session";

export type TrocaState = { ok?: boolean; message?: string };

export async function trocarSenha(
  _prev: TrocaState,
  formData: FormData
): Promise<TrocaState> {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return { ok: false, message: "Sessão inválida. Faça login de novo." };

  const nova = String(formData.get("nova") || "");
  const confirma = String(formData.get("confirma") || "");

  // Regras mínimas de senha nova. Sem isto, o usuário troca a provisória
  // aleatória por "12345678" e desfaz a proteção no mesmo minuto.
  const problema = validarForcaSenha(nova, { email: session?.user?.email ?? undefined });
  if (problema) {
    return { ok: false, message: problema };
  }
  if (!/[a-zA-Z]/.test(nova) || !/[0-9]/.test(nova)) {
    return { ok: false, message: "Use ao menos uma letra e um número." };
  }
  if (nova !== confirma) {
    return { ok: false, message: "A confirmação não confere." };
  }

  const hash = bcrypt.hashSync(nova, 10);

  // Grava DENTRO do contexto de tenant do próprio usuário, para o RLS liberar
  // o UPDATE (a conexão app_runtime respeita o RLS; sem contexto, o update era
  // bloqueado silenciosamente e a senha não mudava).
  try {
    const ctx = await getSessionContext();
    const afetadas = await withTenant(ctx, async (tx) => {
      const r = await tx
        .update(schema.appUsers)
        .set({ senhaHash: hash, precisaTrocarSenha: false, updatedAt: new Date() })
        .where(eq(schema.appUsers.id, userId))
        .returning({ id: schema.appUsers.id });
      return r.length;
    });
    if (afetadas === 0) {
      return { ok: false, message: "Não foi possível salvar a nova senha (registro não atingido)." };
    }
  } catch (e: any) {
    // Registrar a causa: sem isto, uma falha de banco aqui é invisível e o
    // usuário só vê "não foi possível", sem ninguém saber por quê.
    console.error("[SENHA] falha ao salvar nova senha:", e?.message);
    return { ok: false, message: "Não foi possível salvar a nova senha." };
  }

  // Força novo login para o token refletir precisaTrocarSenha=false.
  await signOut({ redirectTo: "/login?trocada=1" });
  return { ok: true };
}
