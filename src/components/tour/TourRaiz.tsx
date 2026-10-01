import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSessionContext } from "@/lib/session";
import { TourProvider } from "./TourProvider";

/**
 * Decide, no servidor, como o tour se comporta para quem está logado.
 *
 * - Veilig: sem tour — quem opera a plataforma não precisa dele.
 * - Veilig em "ver como": o "?" funciona, mas nada começa sozinho nem é
 *   marcado — senão cada tela visitada interromperia a visualização.
 * - Demais: começa sozinho nas telas ainda não vistas.
 */
export async function TourRaiz({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext().catch(() => null);
  if (!ctx || (ctx.role === "veilig_admin" && !ctx.somenteLeitura)) return <>{children}</>;

  let vistos: string[] = [];
  let autoIniciar = !ctx.somenteLeitura;

  if (autoIniciar && ctx.userId) {
    try {
      const r = await db.execute(sql`SELECT tours_vistos_usuario(${ctx.userId}::uuid) AS v`);
      vistos = ((Array.isArray(r) ? r : (r as any).rows)[0]?.v ?? []) as string[];
    } catch {
      // Sem a migração não há como saber o que foi visto. Melhor não começar
      // sozinho do que repetir o tour a cada tela aberta.
      autoIniciar = false;
    }
  }

  return (
    <TourProvider vistos={vistos} autoIniciar={autoIniciar}>
      {children}
    </TourProvider>
  );
}
