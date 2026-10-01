import Link from "next/link";
import { redirect } from "next/navigation";
import { withTenant, schema } from "@/db";
import { formatarCnpjExibicao } from "@/lib/mascaras";
import { getSessionContext } from "@/lib/session";
import { desc, sql, count, or, eq } from "drizzle-orm";
import { BuscaInline } from "@/components/BuscaInline";
import { Paginacao } from "@/components/Paginacao";
import { lerPaginacao, condicaoBusca, termoAlfanumerico, totalPaginas, POR_PAGINA } from "@/lib/paginacao";

export const dynamic = "force-dynamic";


// Busca e paginação NO BANCO, como nas demais listas. Grupos tende a ser a
// menor tabela do sistema, mas manter o padrão evita que esta seja a única
// que degrada quando alguém não esperava.
async function getGrupos(q: string | undefined, offset: number) {
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) => {
    const texto = condicaoBusca(q, [
      sql`${schema.groups.razaoSocial}`,
      sql`${schema.groups.nomeFantasia}`,
      sql`${schema.groups.responsavelNome}`,
      sql`${schema.groups.responsavelEmail}`,
    ]);
    // CNPJ é gravado só com dígitos; quem digita "12.345" precisa achar.
    // Alfanumérico: o CNPJ pode ter letras, e reduzir a dígitos
    // impediria achar "WH.HCV.XKL/0001-81".
    const dig = termoAlfanumerico(q);
    const porCnpj = dig
      ? sql`upper(regexp_replace(coalesce(${schema.groups.cnpj}, ''), '[^0-9A-Za-z]', '', 'g')) LIKE ${"%" + dig + "%"}`
      : undefined;
    const onde = texto && porCnpj ? or(texto, porCnpj) : texto ?? porCnpj ?? undefined;

    const totalRows = await tx.select({ n: count() }).from(schema.groups).where(onde);

    const linhas = await tx
      .select({
        id: schema.groups.id,
        razaoSocial: schema.groups.razaoSocial,
        nomeFantasia: schema.groups.nomeFantasia,
        cnpj: schema.groups.cnpj,
        feePercentPadrao: schema.groups.feePercentPadrao,
        status: schema.groups.status,
        // Contagem por JOIN, não por subconsulta correlacionada.
        //
        // A subconsulta anterior devolvia SEMPRE 0, sem erro: a referência à
        // coluna do grupo saía sem o nome da tabela, e o PostgreSQL resolvia
        // no escopo mais interno — `store st`, que também tem uma coluna `id`.
        // A condição virava `st.group_id = st.id`, nunca verdadeira. Zero
        // silencioso é pior que erro, porque ninguém desconfia do número.
        //
        // FILTER separa ativas do total numa passagem só.
        lojasAtivas: sql<number>`count(${schema.stores.id}) FILTER (WHERE ${schema.stores.status} = 'ativo')::int`,
        lojasTotal: sql<number>`count(${schema.stores.id})::int`,
      })
      .from(schema.groups)
      .leftJoin(schema.stores, eq(schema.stores.groupId, schema.groups.id))
      .groupBy(
        schema.groups.id,
        schema.groups.razaoSocial,
        schema.groups.nomeFantasia,
        schema.groups.cnpj,
        schema.groups.feePercentPadrao,
        schema.groups.status,
        schema.groups.createdAt
      )
      .where(onde)
      .orderBy(desc(schema.groups.createdAt))
      .limit(POR_PAGINA)
      .offset(offset);

    return { linhas, total: Number(totalRows[0]?.n ?? 0) };
  });
}

export default async function GruposPage({
  searchParams,
}: {
  searchParams: Promise<{ criado?: string; salvo?: string; q?: string; p?: string }>;
}) {
  const ctx = await getSessionContext();
  // Página exclusiva da Veilig.
  if (ctx.role !== "veilig_admin") redirect("/");

  const { criado, salvo, q, p } = await searchParams;
  const { pagina, offset } = lerPaginacao(p);
  const { linhas: grupos, total } = await getGrupos(q, offset);
  const paginas = totalPaginas(total);

  return (
      <main className="content">
        {criado && (
          <div className="banner banner-success">Grupo cadastrado com sucesso.</div>
        )}
        {salvo && (
          <div className="banner banner-success">Grupo atualizado com sucesso.</div>
        )}

        <div className="page-head">
          <div>
            <h1>Grupos</h1>
            <p className="subtitle" style={{ margin: "6px 0 0" }}>
              Grupos econômicos clientes da Veilig. Cada grupo tem suas marcas e lojas.
            </p>
          </div>
          <Link href="/grupos/nova" className="btn-link-primary">
            + Novo grupo
          </Link>
        </div>

        {(total > 0 || q) && (
          <BuscaInline placeholder="Buscar por nome, CNPJ, responsável…" />
        )}

        {q && total === 0 ? (
          <div className="busca-vazio">Nenhum grupo encontrado para “{q}”.</div>
        ) : grupos.length === 0 ? (
          <div className="table-wrap">
            <div className="empty">
              <h2>Nenhum grupo cadastrado</h2>
              <p>Cadastre o primeiro grupo cliente.</p>
              <Link href="/grupos/nova" className="btn-link-primary">
                + Cadastrar grupo
              </Link>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th className="col-hide-sm">CNPJ</th>
                  <th>Lojas</th>
                  <th>Fee Veilig</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => (
                  <tr key={g.id} style={g.status === "inativo" ? { opacity: 0.55 } : undefined}>
                    <td>
                      <div className="store-name">
                        {g.nomeFantasia || g.razaoSocial}
                        {g.status === "inativo" && (
                          <span className="badge badge-pending" style={{ marginLeft: 8 }}>
                            Inativo
                          </span>
                        )}
                      </div>
                      {g.nomeFantasia && (
                        <div className="store-sub">{g.razaoSocial}</div>
                      )}
                    </td>
                    <td className="col-hide-sm">{formatarCnpjExibicao(g.cnpj)}</td>
                                        <td>
                      {g.lojasTotal === 0 ? (
                        <span className="store-sub">—</span>
                      ) : g.lojasAtivas === g.lojasTotal ? (
                        g.lojasAtivas
                      ) : (
                        <>
                          {g.lojasAtivas}
                          <span className="store-sub" style={{ fontSize: 12 }}>
                            {" "}de {g.lojasTotal}
                          </span>
                        </>
                      )}
                    </td>
                    <td>{Number(g.feePercentPadrao).toFixed(2)}%</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <Link
                        href={`/grupos/${g.id}/editar`}
                        className="btn-link-primary"
                        style={{ fontSize: 13, padding: "5px 12px" }}
                      >
                        Editar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Paginacao pagina={pagina} totalPaginas={paginas} total={total} rotulo="grupos" />
          </div>
        )}
      </main>

  );
}
