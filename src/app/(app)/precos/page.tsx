import Link from "next/link";
import { redirect } from "next/navigation";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Preços são sempre POR LOJA (cada loja define o seu). Então:
//  • Gestor de loja: atalho direto para a própria loja.
//  • Veilig e gestor de grupo: precisam escolher a loja primeiro — antes não
//    havia caminho nenhum até aqui, embora a permissão já existisse.
export default async function PrecosPage() {
  const ctx = await getSessionContext();

  if (ctx.role === "store_manager") {
    if (!ctx.storeId) redirect("/");
    redirect(`/lojas/${ctx.storeId}/planos`);
  }

  if (ctx.role !== "veilig_admin" && ctx.role !== "group_admin") {
    redirect("/");
  }

  const lojas = await withTenant(ctx, async (tx) =>
    tx
      .select({
        id: schema.stores.id,
        nome: schema.stores.nomeFantasia,
        status: schema.stores.status,
        grupoNome: schema.groups.nomeFantasia,
        grupoRazao: schema.groups.razaoSocial,
        planos: sql<number>`(
          SELECT count(*)::int FROM store_plan sp WHERE sp.store_id = "store"."id"
        )`,
        precos: sql<number>`(
          SELECT count(*)::int FROM store_plan_price spp
          JOIN store_plan sp ON sp.id = spp.store_plan_id
          WHERE sp.store_id = "store"."id"
        )`,
      })
      .from(schema.stores)
      .leftJoin(schema.groups, sql`${schema.groups.id} = ${schema.stores.groupId}`)
      .orderBy(schema.stores.nomeFantasia)
  );

  return (
    <main className="content">
      <h1>Preços</h1>
      <p className="subtitle">
        Cada loja define o preço dos planos que vende. Escolha a loja para
        precificar.
      </p>

      {lojas.length === 0 ? (
        <div className="card">
          <div className="banner banner-error" style={{ marginBottom: 0 }}>
            Nenhuma loja cadastrada ainda.
          </div>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Loja</th>
                <th>Grupo</th>
                <th>Planos</th>
                <th>Modelos com preço</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lojas.map((l) => (
                <tr key={l.id} style={l.status === "inativo" ? { opacity: 0.55 } : undefined}>
                  <td>
                    {l.nome}
                    {l.status === "inativo" && (
                      <span className="badge badge-pending" style={{ marginLeft: 8 }}>
                        Inativa
                      </span>
                    )}
                  </td>
                  <td>{l.grupoNome || l.grupoRazao || "—"}</td>
                  <td>{l.planos}</td>
                  <td>
                    {l.precos === 0 ? (
                      <span className="badge badge-pending">Sem preço</span>
                    ) : (
                      l.precos
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <Link href={`/lojas/${l.id}/planos`} className="btn-link-primary">
                      Precificar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
