import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { withTenant, schema, db } from "@/db";
import { getSessionReal } from "@/lib/session";
import { COOKIE_VER_COMO, serializarAlvo, type AlvoVerComo } from "@/lib/ver-como";

export const dynamic = "force-dynamic";

/**
 * Entra no modo "ver como".
 *
 * Rota comum, NÃO ação de servidor: o middleware recusa ações de servidor
 * enquanto o modo está ativo, e trocar de uma visão para outra precisa
 * continuar funcionando.
 *
 * O alvo é resolvido NO BANCO a partir do id escolhido — grupo e loja vêm do
 * cadastro, não do formulário. Assim não há como montar uma combinação
 * incoerente, como um vendedor de uma loja num grupo que não é o dela.
 */
export async function POST(req: Request) {
  const real = await getSessionReal().catch(() => null);
  if (!real || real.role !== "veilig_admin") {
    return NextResponse.json({ erro: "Apenas a administração Veilig." }, { status: 403 });
  }

  const form = await req.formData();
  const papel = String(form.get("papel") || "");
  const id = String(form.get("alvo") || "");

  let alvo: AlvoVerComo | null = null;

  try {
    alvo = await withTenant(real, async (tx) => {
      if (papel === "group_admin") {
        const [g] = await tx
          .select({ id: schema.groups.id, nome: schema.groups.nomeFantasia })
          .from(schema.groups)
          .where(eq(schema.groups.id, id))
          .limit(1);
        return g
          ? { papel: "group_admin", groupId: g.id, storeId: null, userId: null, nome: g.nome }
          : null;
      }
      if (papel === "store_manager") {
        const [st] = await tx
          .select({ id: schema.stores.id, groupId: schema.stores.groupId, nome: schema.stores.nomeFantasia })
          .from(schema.stores)
          .where(eq(schema.stores.id, id))
          .limit(1);
        return st?.groupId
          ? { papel: "store_manager", groupId: st.groupId, storeId: st.id, userId: null, nome: st.nome }
          : null;
      }
      if (papel === "store_admin") {
        const [u] = await tx
          .select({
            id: schema.appUsers.id,
            nome: schema.appUsers.nome,
            groupId: schema.appUsers.groupId,
            storeId: schema.appUsers.storeId,
            role: schema.appUsers.role,
          })
          .from(schema.appUsers)
          .where(eq(schema.appUsers.id, id))
          .limit(1);
        return u && u.role === "store_admin" && u.groupId && u.storeId
          ? { papel: "store_admin", groupId: u.groupId, storeId: u.storeId, userId: u.id, nome: u.nome }
          : null;
      }
      return null;
    }) as AlvoVerComo | null;
  } catch (e: any) {
    console.error("[VER-COMO] falha ao resolver alvo:", e?.message);
  }

  if (!alvo) {
    return NextResponse.redirect(new URL("/ver-como?erro=1", req.url), 303);
  }

  // Rastro: quem olhou os dados de quem, e quando.
  try {
    // Função SECURITY DEFINER: a tabela tem RLS e esta rota grava sem contexto
    // de tenant. Com INSERT direto, a policy recusa — e como o modo não abre
    // sem registro, o "Ver como" simplesmente parava de funcionar.
    await db.execute(sql`
      SELECT registrar_ver_como(
        ${real.userId}::uuid, ${alvo.papel}, ${alvo.groupId}::uuid,
        ${alvo.storeId}::uuid, ${alvo.userId}::uuid, ${alvo.nome}
      )
    `);
  } catch (e: any) {
    // Sem o registro, não entra: acesso sem rastro é o que o log existe para evitar.
    console.error("[VER-COMO] falha ao registrar:", e?.message);
    return NextResponse.redirect(new URL("/ver-como?erro=registro", req.url), 303);
  }

  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set(COOKIE_VER_COMO, serializarAlvo(alvo), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    // Expira sozinho: esquecer o modo ligado não pode durar para sempre.
    maxAge: 60 * 60 * 8,
  });
  return res;
}
