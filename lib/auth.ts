import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, lerToken } from "./sessao";
import { q1 } from "./db";

export type Usuario = { id: string; nome: string; email: string };

export async function usuarioAtual(): Promise<Usuario | null> {
  const id = await lerToken((await cookies()).get(COOKIE)?.value);
  if (!id) return null;
  return q1<Usuario>("SELECT id, nome, email FROM usuario WHERE id = $1", [id]);
}

/** Para páginas e ações: sem sessão válida, vai para o login. */
export async function exigirUsuario(): Promise<Usuario> {
  const u = await usuarioAtual();
  if (!u) redirect("/login");
  return u;
}
