// Contexto de sessão (tenant) — agora LENDO O USUÁRIO REAL do Auth.js.
//
// Substitui o placeholder anterior. O role e o group_id vêm do usuário logado,
// que o Auth.js guardou no token. É isto que o RLS usa para isolar os dados.
//
// Se não houver usuário logado, lança erro — páginas protegidas nunca devem
// chegar aqui sem sessão (o middleware barra antes).

import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import type { TenantContext } from "@/db";
import { COOKIE_VER_COMO, lerAlvo, rotuloPapel } from "@/lib/ver-como";

/** O usuário que de fato fez login — ignora o modo "ver como". */
export async function getSessionReal(): Promise<TenantContext> {
  const session = await auth();
  const user = session?.user as
    | { id?: string; role?: TenantContext["role"]; groupId?: string | null; storeId?: string | null }
    | undefined;

  if (!user?.role) {
    throw new Error("Sem sessão ativa. Faça login.");
  }

  return {
    role: user.role,
    groupId: user.groupId ?? null,
    storeId: user.storeId ?? null,
    userId: user.id ?? null,
  };
}

/**
 * O contexto com que as telas trabalham.
 *
 * Para a Veilig em modo "ver como", devolve o contexto do papel visualizado —
 * e aí o RLS, os menus e os painéis passam a enxergar exatamente o que aquele
 * usuário enxerga. Sempre SOMENTE LEITURA.
 *
 * O cookie só vale se o usuário REAL for veilig_admin. Qualquer outro papel o
 * ignora, então forjá-lo não dá acesso a nada.
 */
export async function getSessionContext(): Promise<TenantContext> {
  const real = await getSessionReal();
  if (real.role !== "veilig_admin") return real;

  let bruto: string | undefined;
  try {
    bruto = (await cookies()).get(COOKIE_VER_COMO)?.value;
  } catch {
    // Fora de um contexto de requisição não há cookie — segue como Veilig.
    return real;
  }

  const alvo = lerAlvo(bruto);
  if (!alvo) return real;

  return {
    role: alvo.papel,
    groupId: alvo.groupId,
    storeId: alvo.storeId,
    userId: alvo.userId,
    somenteLeitura: true,
    verComo: { papel: rotuloPapel[alvo.papel], nome: alvo.nome },
  };
}
