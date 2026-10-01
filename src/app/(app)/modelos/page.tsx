import Link from "next/link";
import { BuscaInline } from "@/components/BuscaInline";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { desc, sql, count } from "drizzle-orm";
import { Paginacao } from "@/components/Paginacao";
import { lerPaginacao, condicaoBusca, totalPaginas, POR_PAGINA } from "@/lib/paginacao";
import { ModeloForm } from "./ModeloForm";
import { ImportarModelos } from "./ImportarModelos";
import { CATEGORIAS } from "@/lib/vehicle-model-validation";

export const dynamic = "force-dynamic";

function rotuloCategoria(valor: string) {
  return CATEGORIAS.find((c) => c.valor === valor)?.rotulo ?? valor;
}

// Busca e paginação são feitas NO BANCO. Antes a página carregava o catálogo
// inteiro e filtrava em JavaScript — o que funciona com 20 modelos e degrada
// mal com milhares. Filtrando só a página exibida seria pior ainda: a busca
// "não acharia" o que está na página seguinte.
async function getModelos(q: string | undefined, offset: number) {
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) => {
    const onde = condicaoBusca(q, [
      sql`${schema.vehicleModels.fabricante}`,
      sql`${schema.vehicleModels.modelo}`,
      sql`${schema.vehicleModels.versao}`,
      sql`${schema.vehicleModels.categoria}`,
    ]);

    const totalRows = await tx
      .select({ n: count() })
      .from(schema.vehicleModels)
      .where(onde);

    const linhas = await tx
      .select({
        id: schema.vehicleModels.id,
        fabricante: schema.vehicleModels.fabricante,
        modelo: schema.vehicleModels.modelo,
        versao: schema.vehicleModels.versao,
        categoria: schema.vehicleModels.categoria,
        status: schema.vehicleModels.status,
      })
      .from(schema.vehicleModels)
      .where(onde)
      .orderBy(desc(schema.vehicleModels.createdAt))
      .limit(POR_PAGINA)
      .offset(offset);

    return { linhas, total: Number(totalRows[0]?.n ?? 0) };
  });
}

export default async function ModelosPage({
  searchParams,
}: {
  searchParams: Promise<{ criado?: string; editado?: string; q?: string; p?: string }>;
}) {
  const { criado, editado, q, p } = await searchParams;
  const ctx = await getSessionContext();
  const isVeilig = ctx.role === "veilig_admin";
  const { pagina, offset } = lerPaginacao(p);

  // Em paralelo: são independentes, e em série cada uma pagava a viagem de
  // ida e volta até o banco antes de a outra começar.
  const [fabricantes, { linhas: modelos, total }] = await Promise.all([
    // Fabricantes já usados, para o seletor da importação — evita cadastrar
    // "Kawasaki" e "KAWASAKI" como coisas diferentes.
    withTenant(ctx, async (tx) => {
      const r = await tx
        .selectDistinct({ f: schema.vehicleModels.fabricante })
        .from(schema.vehicleModels)
        .orderBy(schema.vehicleModels.fabricante);
      return r.map((x) => x.f).filter(Boolean);
    }),
    getModelos(q, offset),
  ]);
  const paginas = totalPaginas(total);

  return (
      <main className="content">
        {criado && (
          <div className="banner banner-success">Modelo cadastrado com sucesso.</div>
        )}
        {editado && (
          <div className="banner banner-success">Modelo atualizado com sucesso.</div>
        )}

        <div className="page-head">
          <div>
            <h1>Modelos de veículo</h1>
            <p className="subtitle" style={{ margin: "6px 0 0" }}>
              Catálogo de marca, modelo e ano. Os planos são criados a partir destes modelos.
            </p>
          </div>
        </div>

        {isVeilig && (
          <>
            <ImportarModelos fabricantes={fabricantes} />
            <ModeloForm />
          </>
        )}

        {(total > 0 || q) && (
          <BuscaInline placeholder="Buscar por fabricante, modelo, versão, categoria…" />
        )}

        {q && total === 0 ? (
          <div className="busca-vazio">Nenhum modelo encontrado para “{q}”.</div>
        ) : modelos.length === 0 ? (
          <div className="table-wrap">
            <div className="empty">
              <h2>Nenhum modelo cadastrado ainda</h2>
              <p>
                {isVeilig
                  ? "Cadastre o primeiro modelo no formulário acima."
                  : "Os modelos ainda serão cadastrados pela Veilig."}
              </p>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th>Fabricante</th>
                  <th>Modelo</th>
                  <th>Versão</th>
                  <th>Categoria</th>
                  {isVeilig && <th></th>}
                </tr>
              </thead>
              <tbody>
                {modelos.map((m) => (
                  <tr key={m.id} style={m.status === "inativo" ? { opacity: 0.55 } : undefined}>
                    <td className="store-name">
                      {m.fabricante}
                      {m.status === "inativo" && (
                        <span className="badge badge-pending" style={{ marginLeft: 8 }}>Inativo</span>
                      )}
                    </td>
                    <td>{m.modelo}</td>
                    <td>{m.versao || "—"}</td>
                    <td>{rotuloCategoria(m.categoria)}</td>
                    {isVeilig && (
                      <td style={{ whiteSpace: "nowrap" }}>
                        <Link href={`/modelos/${m.id}/editar`} className="btn-ghost btn-sm">
                          Editar
                        </Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <Paginacao pagina={pagina} totalPaginas={paginas} total={total} rotulo="modelos" />
          </div>
        )}
      </main>

  );
}
