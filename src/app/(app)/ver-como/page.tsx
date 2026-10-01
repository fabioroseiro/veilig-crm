import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { withTenant, schema } from "@/db";
import { getSessionReal } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Escolha de quem visualizar.
 *
 * Usa a sessão REAL, não a efetiva: se a Veilig já estiver "vendo como" alguém,
 * ainda precisa conseguir trocar de visão por aqui.
 *
 * Três formulários separados, um por papel, em vez de seletores encadeados: é
 * o caminho mais curto, e o banco resolve grupo e loja a partir do id.
 */
export default async function VerComoPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const real = await getSessionReal();
  if (real.role !== "veilig_admin") redirect("/");
  const sp = await searchParams;

  const dados = await withTenant(real, async (tx) => {
    const grupos = await tx
      .select({ id: schema.groups.id, nome: schema.groups.nomeFantasia })
      .from(schema.groups)
      .where(eq(schema.groups.status, "ativo"))
      .orderBy(schema.groups.nomeFantasia);

    const lojas = await tx
      .select({
        id: schema.stores.id,
        nome: schema.stores.nomeFantasia,
        grupo: schema.groups.nomeFantasia,
      })
      .from(schema.stores)
      .leftJoin(schema.groups, eq(schema.groups.id, schema.stores.groupId))
      .where(eq(schema.stores.status, "ativo"))
      .orderBy(schema.groups.nomeFantasia, schema.stores.nomeFantasia);

    const vendedores = await tx
      .select({
        id: schema.appUsers.id,
        nome: schema.appUsers.nome,
        loja: schema.stores.nomeFantasia,
      })
      .from(schema.appUsers)
      .leftJoin(schema.stores, eq(schema.stores.id, schema.appUsers.storeId))
      .where(and(eq(schema.appUsers.role, "store_admin"), eq(schema.appUsers.status, "ativo")))
      .orderBy(schema.stores.nomeFantasia, schema.appUsers.nome);

    return { grupos, lojas, vendedores };
  });

  const bloco = (
    titulo: string,
    papel: string,
    opcoes: { id: string; rotulo: string }[],
    vazio: string
  ) => (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{titulo}</div>
      {opcoes.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>{vazio}</p>
      ) : (
        <form method="post" action="/api/ver-como" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input type="hidden" name="papel" value={papel} />
          <select name="alvo" required style={{ flex: 1, minWidth: 240 }}>
            {opcoes.map((o) => (
              <option key={o.id} value={o.id}>{o.rotulo}</option>
            ))}
          </select>
          <button type="submit" className="btn-primary" style={{ padding: "8px 16px" }}>
            Ver como
          </button>
        </form>
      )}
    </div>
  );

  return (
    <main className="content">
      <h1>Ver como</h1>
      <p className="subtitle">
        Enxergue a plataforma exatamente como um cliente enxerga. O modo é{" "}
        <strong>somente leitura</strong>: nada pode ser alterado enquanto ele estiver
        ativo, e cada entrada fica registrada.
      </p>

      {sp?.erro && (
        <div className="banner banner-error" style={{ marginBottom: 16 }}>
          {sp.erro === "registro"
            ? "Não foi possível registrar o acesso, então o modo não foi ativado."
            : "Não foi possível abrir essa visão. Confira se o cadastro está completo."}
        </div>
      )}

      {bloco(
        "Gestor de grupo",
        "group_admin",
        dados.grupos.map((g) => ({ id: g.id, rotulo: g.nome ?? "Grupo sem nome" })),
        "Nenhum grupo ativo."
      )}
      {bloco(
        "Gestor de loja",
        "store_manager",
        dados.lojas.map((l) => ({ id: l.id, rotulo: `${l.nome} — ${l.grupo ?? "sem grupo"}` })),
        "Nenhuma loja ativa."
      )}
      {bloco(
        "Vendedor",
        "store_admin",
        dados.vendedores.map((v) => ({ id: v.id, rotulo: `${v.nome} — ${v.loja ?? "sem loja"}` })),
        "Nenhum vendedor ativo."
      )}
    </main>
  );
}
