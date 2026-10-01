import Link from "next/link";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { desc, eq, sql, count } from "drizzle-orm";
import { BuscaInline } from "@/components/BuscaInline";
import { Paginacao } from "@/components/Paginacao";
import { lerPaginacao, condicaoBusca, totalPaginas, POR_PAGINA } from "@/lib/paginacao";
import { BotaoAcao } from "@/components/BotaoAcao";
import { alternarStatusPlano } from "./[id]/editar/actions";
import { SimuladorPlanos } from "./SimuladorPlanos";

export const dynamic = "force-dynamic";

// Busca e paginação NO BANCO. Era a última lista que carregava tudo.
async function getPlanos(q: string | undefined, offset: number) {
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) => {
    const onde = condicaoBusca(q, [
      sql`${schema.plans.nome}`,
      sql`${schema.plans.descricao}`,
    ]);

    // Contagem separada: com LEFT JOIN + GROUP BY, um count() na mesma query
    // contaria as linhas do join, não os planos.
    const totalRows = await tx
      .select({ n: count() })
      .from(schema.plans)
      .leftJoin(schema.groups, eq(schema.groups.id, schema.plans.groupId))
      .where(onde);

    // Contagem via LEFT JOIN + GROUP BY (robusto; a subquery correlacionada
    // anterior retornava 0 por um problema de referência à tabela externa).
    const planos = await tx
      .select({
        id: schema.plans.id,
        nome: schema.plans.nome,
        descricao: schema.plans.descricao,
        // Faixa dos mínimos dos modelos: o piso deixou de ser único por plano.
        grupoNome: schema.groups.nomeFantasia,
        grupoRazao: schema.groups.razaoSocial,
        // Agregação direta: plan_model JÁ está no JOIN abaixo. A subconsulta
        // correlacionada que estava aqui corria o mesmo risco da contagem de
        // lojas em Grupos — referência à tabela externa resolvida no escopo
        // interno, devolvendo NULL sem erro.
        minimoMin: sql<string>`min(${schema.planModels.precoMinimo})`,
        minimoMax: sql<string>`max(${schema.planModels.precoMinimo})`,
        status: schema.plans.status,
        idadeMaximaAnos: schema.plans.idadeMaximaAnos,
        aceitaZeroKm: schema.plans.aceitaZeroKm,
        qtdModelos: sql<number>`count(${schema.planModels.id})::int`,
      })
      .from(schema.plans)
      .leftJoin(
        schema.planModels,
        eq(schema.planModels.planId, schema.plans.id)
      )
      // O JOIN com `group` FALTAVA: as colunas do grupo eram selecionadas e
      // agrupadas sem a tabela estar no FROM, e o PostgreSQL derrubava a
      // consulta inteira com "missing FROM-clause entry for table g".
      .leftJoin(schema.groups, eq(schema.groups.id, schema.plans.groupId))
      .groupBy(
        schema.plans.id,
        schema.plans.nome,
        schema.plans.descricao,
        schema.plans.status,
        schema.plans.idadeMaximaAnos,
        schema.plans.aceitaZeroKm,
        schema.plans.createdAt,
        // O PostgreSQL exige no GROUP BY toda coluna selecionada que não está
        // dentro de agregação. Sem estas duas a consulta inteira falha e a
        // página de planos cai — foi o que aconteceu ao adicionar a coluna de
        // grupo.
        schema.groups.nomeFantasia,
        schema.groups.razaoSocial
      )
      .where(onde)
      .orderBy(desc(schema.plans.createdAt))
      .limit(POR_PAGINA)
      .offset(offset);

    return { linhas: planos, total: Number(totalRows[0]?.n ?? 0) };
  });
}

/**
 * Ofertas para o simulador: cada combinação (loja, modelo, plano) com preço.
 *
 * É a MESMA consulta da tela de venda — de propósito. Se divergirem, o preço
 * simulado deixa de ser o preço vendido, e o vendedor passa um valor que a
 * venda não confirma.
 */
async function getOfertas() {
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) => {
    let lojasAlvo: { id: string; nome: string | null }[] = [];
    if (ctx.role === "store_admin" || ctx.role === "store_manager") {
      if (ctx.storeId) {
        lojasAlvo = await tx
          .select({ id: schema.stores.id, nome: schema.stores.nomeFantasia })
          .from(schema.stores)
          .where(eq(schema.stores.id, ctx.storeId))
          .limit(1);
      }
    } else {
      lojasAlvo = await tx
        .select({ id: schema.stores.id, nome: schema.stores.nomeFantasia })
        .from(schema.stores)
        .orderBy(schema.stores.nomeFantasia);
    }

    const ofertas = await tx
      .select({
        storeId: schema.storePlans.storeId,
        modelId: schema.vehicleModels.id,
        fabricante: schema.vehicleModels.fabricante,
        modelo: schema.vehicleModels.modelo,
        versao: schema.vehicleModels.versao,
        categoria: schema.vehicleModels.categoria,
        preco: schema.storePlanPrices.preco,
        planId: schema.storePlans.planId,
        planoNome: schema.plans.nome,
        aceitaZeroKm: schema.plans.aceitaZeroKm,
        idadeMaximaAnos: schema.plans.idadeMaximaAnos,
        carenciaZeroKm: schema.plans.carenciaZeroKm,
        carenciaAte2Anos: schema.plans.carenciaAte2Anos,
        carencia3a5Anos: schema.plans.carencia3a5Anos,
        carencia6Mais: schema.plans.carencia6Mais,
        acrescimoAte2Anos: schema.plans.acrescimoAte2Anos,
        acrescimo3a5Anos: schema.plans.acrescimo3a5Anos,
        acrescimo6Mais: schema.plans.acrescimo6Mais,
      })
      .from(schema.storePlanPrices)
      .innerJoin(schema.storePlans, eq(schema.storePlanPrices.storePlanId, schema.storePlans.id))
      .innerJoin(schema.vehicleModels, eq(schema.storePlanPrices.vehicleModelId, schema.vehicleModels.id))
      .innerJoin(schema.plans, eq(schema.storePlans.planId, schema.plans.id))
      // Plano inativado não pode mais ser vendido, então não entra na simulação.
      .where(eq(schema.plans.status, "ativo"));

    const porLoja: Record<string, any[]> = {};
    for (const o of ofertas) {
      (porLoja[o.storeId] ||= []).push({
        modelId: o.modelId,
        fabricante: o.fabricante,
        modeloLabel: `${o.modelo}${o.versao ? " " + o.versao : ""}`,
        categoria: o.categoria,
        precoBase: Number(o.preco),
        planId: o.planId,
        planoNome: o.planoNome,
        politica: {
          aceitaZeroKm: o.aceitaZeroKm,
          idadeMaximaAnos: o.idadeMaximaAnos,
          carenciaZeroKm: o.carenciaZeroKm,
          carenciaAte2Anos: o.carenciaAte2Anos,
          carencia3a5Anos: o.carencia3a5Anos,
          carencia6Mais: o.carencia6Mais,
          acrescimoAte2Anos: Number(o.acrescimoAte2Anos),
          acrescimo3a5Anos: Number(o.acrescimo3a5Anos),
          acrescimo6Mais: Number(o.acrescimo6Mais),
        },
      });
    }

    return {
      lojas: lojasAlvo,
      porLoja,
      isVendedor: ctx.role === "store_admin" || ctx.role === "store_manager",
      storeIdVendedor: ctx.storeId ?? null,
    };
  });
}

function fmtBRL(v: string) {
  const n = Number(v);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function PlanosPage({
  searchParams,
}: {
  searchParams: Promise<{ criado?: string; salvo?: string; q?: string; p?: string }>;
}) {
  const { criado, salvo, q, p } = await searchParams;
  const ctx = await getSessionContext();
  const podeEditar = ctx.role === "veilig_admin" || ctx.role === "group_admin";
  // Só a Veilig vê planos de mais de um grupo.
  const verGrupo = ctx.role === "veilig_admin";
  const { pagina, offset } = lerPaginacao(p);
  const [{ linhas: planos, total }, ofertas] = await Promise.all([
    getPlanos(q, offset),
    getOfertas(),
  ]);
  const paginas = totalPaginas(total);

  return (
      <main className="content">
        {criado && (
          <div className="banner banner-success">Plano criado com sucesso.</div>
        )}
        {salvo && (
          <div className="banner banner-success">Plano atualizado com sucesso.</div>
        )}

        <div className="page-head">
          <div>
            <h1>Planos</h1>
            <p className="subtitle" style={{ margin: "6px 0 0" }}>
              Planos do grupo, com preço padrão e os modelos que cobrem.
            </p>
          </div>
          {/* Só quem edita. O vendedor passou a ver a lista para consultar a
              minuta e os argumentos de venda — mostrar o botão de criar levaria
              a uma tela que a action recusa. */}
          {podeEditar && (
            <Link href="/planos/nova" className="btn-link-primary">
              + Novo plano
            </Link>
          )}
        </div>

        {/* Simulação na própria tela: o vendedor precisa de preço e carência
            ANTES de começar um cadastro — é o que o cliente pergunta primeiro. */}
        {total > 0 && (
          <SimuladorPlanos
            lojas={ofertas.lojas}
            porLoja={ofertas.porLoja}
            isVendedor={ofertas.isVendedor}
            storeIdVendedor={ofertas.storeIdVendedor}
          />
        )}

        {(total > 0 || q) && (
          <BuscaInline placeholder="Buscar por nome ou descrição do plano…" />
        )}

        {q && total === 0 ? (
          <div className="busca-vazio">Nenhum plano encontrado para “{q}”.</div>
        ) : planos.length === 0 ? (
          <div className="table-wrap">
            <div className="empty">
              <h2>Nenhum plano criado ainda</h2>
              {podeEditar ? (
                <>
                  <p>Crie o primeiro plano para o seu grupo.</p>
                  <Link href="/planos/nova" className="btn-link-primary">
                    + Criar plano
                  </Link>
                </>
              ) : (
                // Dizer "crie o primeiro plano" a quem não pode criar é pior
                // que não dizer nada: a pessoa procura o botão que não existe.
                <p>
                  O gestor do grupo ainda não cadastrou planos. Assim que
                  houver, eles aparecem aqui.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th>Plano</th>
                  <th>Preço mínimo</th>
                  <th>Aceita</th>
                  {verGrupo && <th className="col-hide-sm">Grupo</th>}
                  <th>Modelos cobertos</th>
                  <th>Material</th>
                  {podeEditar && <th></th>}
                </tr>
              </thead>
              <tbody>
                {planos.map((p) => (
                  <tr key={p.id} style={p.status === "inativo" ? { opacity: 0.55 } : undefined}>
                    <td>
                      <div className="store-name">
                        {p.nome}
                        {p.status === "inativo" && (
                          <span className="badge badge-pending" style={{ marginLeft: 8 }}>
                            Inativo
                          </span>
                        )}
                      </div>
                      {p.descricao && (
                        <div className="store-sub">{p.descricao}</div>
                      )}
                    </td>
                                        <td>
                      {p.minimoMin == null ? (
                        <span className="store-sub">—</span>
                      ) : Number(p.minimoMin) === Number(p.minimoMax) ? (
                        <>{fmtBRL(p.minimoMin)}/mês</>
                      ) : (
                        <>
                          {fmtBRL(p.minimoMin)} a {fmtBRL(p.minimoMax)}
                          <div className="store-sub" style={{ fontSize: 12 }}>por modelo</div>
                        </>
                      )}
                    </td>
                    <td className="store-sub">
                      {p.aceitaZeroKm ? "Zero km" : ""}
                      {p.aceitaZeroKm && p.idadeMaximaAnos > 0 ? " · " : ""}
                      {p.idadeMaximaAnos > 0
                        ? p.idadeMaximaAnos >= 99
                          ? "seminovo (sem limite)"
                          : `seminovo até ${p.idadeMaximaAnos} anos`
                        : ""}
                      {!p.aceitaZeroKm && p.idadeMaximaAnos === 0 ? "—" : ""}
                    </td>
                    {verGrupo && (
                      <td className="col-hide-sm store-sub">
                        {p.grupoNome || p.grupoRazao || "—"}
                      </td>
                    )}
                    <td>{p.qtdModelos} modelo(s)</td>
                    {/* Minuta visível para QUEM VENDE, não só para quem edita:
                        é a peça que o vendedor mostra ao cliente antes de
                        fechar. */}
                    <td className="nowrap">
                      <Link
                        href={`/planos/${p.id}/vender`}
                        className="btn-link-primary"
                        style={{ fontSize: 13, padding: "5px 12px" }}
                      >
                        Vender
                      </Link>{" "}
                      <Link
                        href={`/planos/${p.id}/contrato`}
                        className="btn-ghost"
                        style={{ fontSize: 13, padding: "5px 12px" }}
                      >
                        Contrato
                      </Link>
                    </td>
                    {podeEditar && (
                      <td style={{ whiteSpace: "nowrap" }}>
                        <Link href={`/planos/${p.id}/editar`} className="btn-link-primary" style={{ fontSize: 13, padding: "5px 12px" }}>
                          Editar
                        </Link>{" "}
                        <form
                          style={{ display: "inline-block" }}
                          action={async () => {
                            "use server";
                            await alternarStatusPlano(p.id, p.status === "inativo" ? "ativo" : "inativo");
                          }}
                        >
                          <BotaoAcao className="btn-ghost" style={{ fontSize: 13, padding: "5px 12px" }}>
                            {p.status === "inativo" ? "Reativar" : "Inativar"}
                          </BotaoAcao>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <Paginacao pagina={pagina} totalPaginas={paginas} total={total} rotulo="planos" />
          </div>
        )}
      </main>

  );
}
