import Link from "next/link";
import { BuscaInline } from "@/components/BuscaInline";
import { withTenant, schema } from "@/db";
import { formatarCnpjExibicao } from "@/lib/mascaras";
import { relacaoComGrupo, ehMatriz } from "@/lib/contrato";
import { getSessionContext } from "@/lib/session";
import { desc, sql, count, or, eq } from "drizzle-orm";
import { Paginacao } from "@/components/Paginacao";
import { lerPaginacao, condicaoBusca, termoAlfanumerico, totalPaginas, POR_PAGINA } from "@/lib/paginacao";

// Lê do banco por requisição (dados ao vivo) — não pré-renderizar no build.
export const dynamic = "force-dynamic";

// Busca e paginação no BANCO (antes carregava tudo e filtrava em JS).
async function getLojas(q: string | undefined, offset: number) {
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) => {
    const texto = condicaoBusca(q, [
      sql`${schema.stores.nomeFantasia}`,
      sql`${schema.stores.razaoSocial}`,
      sql`${schema.stores.cidade}`,
      sql`${schema.stores.fabricante}`,
      sql`${schema.stores.uf}`,
    ]);
    // CNPJ é gravado só com dígitos; quem digita "12.345" precisa achar.
    // Alfanumérico: o CNPJ pode ter letras, e reduzir a dígitos
    // impediria achar "WH.HCV.XKL/0001-81".
    const dig = termoAlfanumerico(q);
    const porCnpj = dig
      ? sql`upper(regexp_replace(coalesce(${schema.stores.cnpj}, ''), '[^0-9A-Za-z]', '', 'g')) LIKE ${"%" + dig + "%"}`
      : undefined;
    const onde =
      texto && porCnpj ? or(texto, porCnpj) : texto ?? porCnpj ?? undefined;

    const totalRows = await tx.select({ n: count() }).from(schema.stores).where(onde);

    const linhas = await tx
      .select({
        id: schema.stores.id,
        nomeFantasia: schema.stores.nomeFantasia,
        razaoSocial: schema.stores.razaoSocial,
        fabricante: schema.stores.fabricante,
        cnpj: schema.stores.cnpj,
        cidade: schema.stores.cidade,
        uf: schema.stores.uf,
        walletId: schema.stores.walletId,
        grupoCnpj: schema.groups.cnpj,
        // Status do grupo: uma loja de grupo inativo não opera, por mais que o
        // status dela própria diga "ativo". Mostrar só o status individual
        // fazia a lista contradizer o login, que já bloqueia via tenant_ativo().
        grupoStatus: schema.groups.status,
        status: schema.stores.status,
        grupoNome: schema.groups.nomeFantasia,
        grupoRazao: schema.groups.razaoSocial,
      })
      .from(schema.stores)
      // leftJoin para a loja não sumir da lista se o grupo faltar.
      .leftJoin(schema.groups, eq(schema.groups.id, schema.stores.groupId))
      .where(onde)
      .orderBy(desc(schema.stores.createdAt))
      .limit(POR_PAGINA)
      .offset(offset);

    return { linhas, total: Number(totalRows[0]?.n ?? 0) };
  });
}

// Formata CNPJ (14 dígitos) para exibição.

export default async function LojasPage({
  searchParams,
}: {
  searchParams: Promise<{ criada?: string; q?: string; p?: string }>;
}) {
  const { criada, q, p } = await searchParams;
  // Só a Veilig enxerga mais de um grupo — para o group_admin a coluna seria
  // a mesma em todas as linhas.
  const ctxPagina = await getSessionContext();
  const verGrupo = ctxPagina.role === "veilig_admin";

  const { pagina, offset } = lerPaginacao(p);
  const { linhas: lojas, total } = await getLojas(q, offset);
  const paginas = totalPaginas(total);

  return (
      <main className="content">
      {criada && (
        <div className="banner banner-success">
          Loja cadastrada com sucesso.
        </div>
      )}

      <div className="page-head">
        <div>
          <h1>Lojas</h1>
          <p className="subtitle" style={{ margin: "6px 0 0" }}>
            Lojas que vendem planos e recebem os pagamentos das assinaturas.
          </p>
        </div>
        <Link href="/lojas/nova" className="btn-link-primary">
          + Nova loja
        </Link>
      </div>

      {(total > 0 || q) && (
        <BuscaInline placeholder="Buscar loja por nome, cidade, CNPJ…" />
      )}

      {q && total === 0 ? (
        <div className="busca-vazio">Nenhuma loja encontrada para “{q}”.</div>
      ) : lojas.length === 0 ? (
        <div className="table-wrap">
          <div className="empty">
            <h2>Nenhuma loja cadastrada ainda</h2>
            <p>Cadastre a primeira loja para começar a vender planos.</p>
            <Link href="/lojas/nova" className="btn-link-primary">
              + Cadastrar loja
            </Link>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th>Loja</th>
                {verGrupo && <th className="col-hide-sm">Grupo</th>}
                  <th>Fabricante</th>
                <th className="col-hide-sm">CNPJ</th>
                <th className="col-hide-sm">Cidade</th>
                <th>Recebimento</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lojas.map((loja) => {
                const apta = Boolean(loja.walletId);
                return (
                  <tr key={loja.id} style={loja.status === "inativo" ? { opacity: 0.55 } : undefined}>
                    <td>
                      <div className="store-name">
                        {loja.nomeFantasia}
                        {loja.status === "inativo" && (
                          <span className="badge badge-pending" style={{ marginLeft: 8 }}>Inativa</span>
                        )}
                      </div>
                      <div className="store-sub">{loja.razaoSocial}</div>
                    </td>
                    {verGrupo && (
                      <td className="col-hide-sm store-sub">
                        {loja.grupoNome || loja.grupoRazao || "—"}
                      </td>
                    )}
                    <td>{loja.fabricante}</td>
                    <td className="col-hide-sm">
                      {formatarCnpjExibicao(loja.cnpj)}
                      {/* Matriz/filial x grupo econômico: a raiz do CNPJ revela
                          qual é o caso, e o contrato usa redação diferente para
                          cada um. Mostrar aqui também ajuda a perceber CNPJ
                          digitado errado. */}
                      {(() => {
                        const rel = relacaoComGrupo(loja.cnpj, loja.grupoCnpj);
                        if (rel === "filial") {
                          return (
                            <div className="store-sub" style={{ fontSize: 12 }}>
                              {ehMatriz(loja.cnpj) ? "matriz" : "filial"}
                            </div>
                          );
                        }
                        if (rel === "mesmo_estabelecimento") {
                          return (
                            <div className="store-sub" style={{ fontSize: 12 }}>
                              mesmo CNPJ do grupo
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </td>
                    <td className="col-hide-sm">
                      {loja.cidade}/{loja.uf}
                    </td>
                    <td>
                      {loja.grupoStatus === "inativo" ? (
                        <span
                          className="badge badge-pending"
                          title="O grupo desta loja está inativo. Ninguém consegue entrar, e a loja não opera — mesmo que o status dela seja ativo."
                        >
                          Grupo inativo
                        </span>
                      ) : apta ? (
                        <span className="badge badge-ok">Configurado</span>
                      ) : (
                        <span
                          className="badge badge-error"
                          title="A loja pode ser configurada, mas não consegue vender: sem o walletId a Asaas não divide o pagamento."
                        >
                          Não vende ainda
                        </span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <Link href={`/lojas/${loja.id}/editar`} className="btn-ghost btn-sm">
                        Editar
                      </Link>{" "}
                      <Link href={`/lojas/${loja.id}`} className="btn-ghost btn-sm">
                        Detalhes
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Paginacao pagina={pagina} totalPaginas={paginas} total={total} rotulo="lojas" />
        </div>
      )}
      </main>

  );
}
