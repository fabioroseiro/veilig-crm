import Link from "next/link";
import { redirect } from "next/navigation";
import { formatarPlacaExibicao } from "@/lib/mascaras";
import { BuscaInline } from "@/components/BuscaInline";
import { AutoRefresh } from "@/components/AutoRefresh";
import { withTenant, schema } from "@/db";
import { emCarencia, formatarData } from "@/lib/carencia";
import { Paginacao } from "@/components/Paginacao";
import { lerPaginacao, totalPaginas, POR_PAGINA } from "@/lib/paginacao";
import { BotaoAcao } from "@/components/BotaoAcao";
import { reprocessarCobranca } from "./reprocessar-actions";
import { BotaoPassagem } from "./BotaoPassagem";
import { getSessionContext } from "@/lib/session";
import { desc, eq, inArray, sql, count } from "drizzle-orm";

export const dynamic = "force-dynamic";

function fmtCpf(cpf: string) {
  const d = (cpf || "").padStart(11, "0");
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// Busca e paginação NO BANCO.
//
// Nome e CPF estão em `person`, que é global e fora do RLS — por isso a busca
// por esses campos passa pela função SECURITY DEFINER persons_buscar_ids().
// Os ids retornados são cruzados com `customer`, que É protegida por RLS, então
// um id de outro tenant simplesmente não casa com nada.
async function getClientes(q: string | undefined, offset: number) {
  const ctx = await getSessionContext();
  const termo = (q ?? "").trim();

  const customersResult = await withTenant(ctx, async (tx) => {
    let onde: any = undefined;

    if (termo) {
      // ids de pessoas cujo nome ou CPF casam com o termo
      const r = await tx.execute(sql`SELECT id FROM persons_buscar_ids(${termo})`);
      const rows = (Array.isArray(r) ? r : (r as any).rows) as { id: string }[];
      const ids = rows.map((x) => x.id);
      const arrLiteral = `{${ids.join(",")}}`;

      const placa = termo.replace(/[\s-]/g, "").toUpperCase();
      const escapado = placa.replace(/[\\%_]/g, (c) => "\\" + c);

      onde = sql`(
        ${ids.length > 0 ? sql`${schema.customers.personId} = ANY(${arrLiteral}::uuid[])` : sql`false`}
        OR EXISTS (
          SELECT 1 FROM vehicle v
          WHERE v.customer_id = "customer"."id"
            AND v.placa ILIKE ${"%" + escapado + "%"} ESCAPE '\\'
        )
        OR coalesce(${schema.customers.email}, '') ILIKE ${"%" + escapado + "%"}
      )`;
    }

    const totalRows = await tx
      .select({ n: count() })
      .from(schema.customers)
      .where(onde);

    const linhas = await tx
      .select({
        id: schema.customers.id,
        personId: schema.customers.personId,
        email: schema.customers.email,
        telefone: schema.customers.telefone,
        storeId: schema.customers.storeId,
        lojaNome: schema.stores.nomeFantasia,
        status: schema.customers.status,
        createdAt: schema.customers.createdAt,
      })
      .from(schema.customers)
      // leftJoin: cliente sem loja (dado antigo) não some da lista.
      .leftJoin(schema.stores, eq(schema.stores.id, schema.customers.storeId))
      .where(onde)
      .orderBy(desc(schema.customers.createdAt))
      .limit(POR_PAGINA)
      .offset(offset);

    // ── Tudo o que a tela precisa, NA MESMA TRANSAÇÃO ────────────────────
    //
    // Antes eram quatro `withTenant` separados. Cada um custa BEGIN, dois
    // set_config e COMMIT — e cada um desses é uma ida e volta pela rede até o
    // banco. Eram ~26 viagens por carregamento, quando bastam 10.
    //
    // Com o banco perto, isso são dezenas de milissegundos. Com ele longe,
    // segundos. As consultas em si nunca foram o problema.
    if (linhas.length === 0) {
      return { linhas: [], total: Number(totalRows[0]?.n ?? 0), pessoas: [], veiculos: [], assinaturas: [] };
    }

    const custIds = linhas.map((c) => c.id);

    // person é global (fora do RLS); lê nomes/CPF via função SECURITY DEFINER.
    const personIds = Array.from(new Set(linhas.map((c) => c.personId)));
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const idsValidos = personIds.filter((id) => uuidRe.test(id));

    let pessoas: { id: string; nome: string; cpf: string }[] = [];
    if (idsValidos.length > 0) {
      // Drizzle não serializa array JS como uuid[]; montamos o array literal
      // do Postgres ({a,b,c}) e fazemos cast explícito para uuid[].
      const arrLiteral = `{${idsValidos.join(",")}}`;
      const r = await tx.execute(
        sql`SELECT id, nome_completo AS nome, cpf FROM persons_by_ids(${arrLiteral}::uuid[])`
      );
      pessoas = (Array.isArray(r) ? r : (r as any).rows) as typeof pessoas;
    }

    const veiculos = await tx
      .select({
        customerId: schema.vehicles.customerId,
        marca: schema.vehicles.marca,
        modelo: schema.vehicles.modelo,
        ano: schema.vehicles.ano,
        placa: schema.vehicles.placa,
        chassi: schema.vehicles.chassi,
      })
      .from(schema.vehicles)
      .where(inArray(schema.vehicles.customerId, custIds));

    // assinaturas ativas dos clientes (plano + preço contratado)
    const assinaturas = await tx
      .select({
        customerId: schema.subscriptions.customerId,
        preco: schema.subscriptions.precoContratado,
        planoNome: schema.plans.nome,
        status: schema.subscriptions.status,
        migrada: schema.subscriptions.migrada,
        // Desempate entre duas do mesmo status: a mais recente vale.
        createdAt: schema.subscriptions.createdAt,
        linkPagamento: schema.subscriptions.asaasLinkPagamento,
        syncStatus: schema.subscriptions.asaasSyncStatus,
        carenciaAte: schema.subscriptions.carenciaAte,
        syncErro: schema.subscriptions.asaasSyncErro,
        subId: schema.subscriptions.id,
        // Alias explícito na tabela EXTERNA. Sem ele, a referência pode ser
        // resolvida no escopo interno (passagem_loja também tem `id`), a
        // condição vira sempre falsa e o contador fica em zero SEM ERRO.
        // Mesma armadilha da contagem de lojas em Grupos.
        passagens: sql<number>`(
          SELECT count(*)::int FROM passagem_loja pl
          WHERE pl.subscription_id = "subscription"."id"
        )`,
      })
      .from(schema.subscriptions)
      .innerJoin(schema.plans, eq(schema.subscriptions.planId, schema.plans.id))
      .where(inArray(schema.subscriptions.customerId, custIds));

    return {
      linhas,
      total: Number(totalRows[0]?.n ?? 0),
      pessoas,
      veiculos,
      assinaturas,
    };
  });

  const customers = customersResult.linhas;
  const total = customersResult.total;
  if (customers.length === 0) return { lista: [], total };

  const mapaPessoa = new Map(customersResult.pessoas.map((p) => [p.id, p]));

  const mapaVeiculo = new Map<string, (typeof customersResult.veiculos)[number]>();
  for (const v of customersResult.veiculos)
    if (!mapaVeiculo.has(v.customerId)) mapaVeiculo.set(v.customerId, v);

  // Um cliente pode ter MAIS DE UMA assinatura: quem cancela e volta a
  // assinar o mesmo veículo fica com duas.
  //
  // Ficar com a primeira que aparecer escondia a vigente atrás da cancelada —
  // a loja olhava a lista e concluía que o cliente não tinha plano, quando
  // tinha. Agora a vigente ganha sempre; entre duas do mesmo tipo, a mais
  // recente.
  const pesoStatus = (st: string) =>
    st === "paga" ? 4 : st === "pendente" ? 3 : st === "atrasada" ? 2 : 1;

  const mapaAssinatura = new Map<string, (typeof customersResult.assinaturas)[number]>();
  for (const a of customersResult.assinaturas) {
    const atual = mapaAssinatura.get(a.customerId);
    if (!atual) {
      mapaAssinatura.set(a.customerId, a);
      continue;
    }
    const melhor =
      pesoStatus(String(a.status)) - pesoStatus(String(atual.status)) ||
      (new Date(a.createdAt as any).getTime() -
        new Date(atual.createdAt as any).getTime());
    if (melhor > 0) mapaAssinatura.set(a.customerId, a);
  }

  // Quantas assinaturas cada cliente tem, para a tela avisar quando houver
  // mais de uma — senão a escolha continua invisível.
  const totalPorCliente = new Map<string, number>();
  for (const a of customersResult.assinaturas)
    totalPorCliente.set(a.customerId, (totalPorCliente.get(a.customerId) ?? 0) + 1);

  const lista = customers.map((c) => {
    const p = mapaPessoa.get(c.personId);
    const v = mapaVeiculo.get(c.id);
    const a = mapaAssinatura.get(c.id);
    return {
      id: c.id,
      qtdAssinaturas: totalPorCliente.get(c.id) ?? 0,
      personId: c.personId,
      nome: p?.nome ?? "—",
      cpf: p?.cpf ?? "",
      email: c.email,
      telefone: c.telefone,
      status: (c as any).status ?? "ativo",
      veiculo: v ? `${v.marca} ${v.modelo} · ${v.ano}` : "—",
      placa: v?.placa ?? "",
      chassi: v?.chassi ?? "",
      plano: a ? a.planoNome : null,
      preco: a ? Number(a.preco).toFixed(2).replace(".", ",") : null,
      linkPagamento: a?.linkPagamento ?? null,
      syncStatus: a?.syncStatus ?? null,
      statusAssinatura: a?.status ?? null,
      migrada: (a as any)?.migrada === true,
      carenciaAte: a?.carenciaAte ?? null,
      syncErro: a?.syncErro ?? null,
      subId: a?.subId ?? null,
      passagens: Number(a?.passagens ?? 0),
      // Vinha da query mas se perdia aqui — a coluna mostrava sempre "—".
      lojaNome: c.lojaNome ?? null,
    };
  });

  return { lista, total };
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ criado?: string; q?: string; editado?: string; p?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!["veilig_admin", "group_admin", "store_manager", "store_admin"].includes(ctx.role)) redirect("/");

  // Vendedor e gestor enxergam UMA loja só — a coluna seria a mesma em todas
  // as linhas, ocupando espaço numa tabela que já é larga.
  const verLoja = ctx.role === "veilig_admin" || ctx.role === "group_admin";

  const { criado, q, editado, p } = await searchParams;
  const { pagina, offset } = lerPaginacao(p);
  const { lista: clientes, total } = await getClientes(q, offset);
  const paginas = totalPaginas(total);

  return (
      <main className="content">
        <AutoRefresh segundos={15} />
        {criado && <div className="banner banner-success">Cliente e veículo cadastrados.</div>}
        {editado && <div className="banner banner-success">Alterações salvas.</div>}

        <div className="page-head">
          <div>
            <h1>Clientes</h1>
            <p className="subtitle" style={{ margin: "6px 0 0" }}>
              Clientes e seus veículos. A partir daqui nasce a assinatura.
            </p>
          </div>
          <Link href="/clientes/nova" className="btn-link-primary">
            + Novo cliente
          </Link>
        </div>

        {(total > 0 || q) && (
          <BuscaInline placeholder="Buscar por nome, CPF ou placa…" />
        )}

        {q && total === 0 ? (
          <div className="busca-vazio">Nenhum cliente encontrado para “{q}”.</div>
        ) : clientes.length === 0 ? (
          <div className="table-wrap">
            <div className="empty">
              <h2>Nenhum cliente ainda</h2>
              <p>Cadastre o primeiro cliente e veículo.</p>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th className="col-hide-sm">CPF</th>
                  <th>Veículo</th>
                  <th>Plano</th>
                  {verLoja && <th className="col-hide-sm">Loja</th>}
                  <th>Pagamento</th>
                  <th>Passagens</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => (
                  <tr key={c.id} style={c.status === "inativo" ? { opacity: 0.55 } : undefined}>
                    <td>
                      <div className="store-name">
                        {c.nome}
                        {c.status === "inativo" && (
                          <span className="badge badge-pending" style={{ marginLeft: 8 }}>Inativo</span>
                        )}
                      </div>
                      <div className="store-sub">{c.email}</div>
                    </td>
                    <td className="col-hide-sm">{c.cpf ? fmtCpf(c.cpf) : "—"}</td>
                    <td className="compacta">
                      <div>{c.veiculo}</div>
                      {/* A condição externa era `c.placa &&`, o que fazia o
                          bloco inteiro sumir justamente no caso que interessa:
                          veículo SEM placa. Agora testa os dois. */}
                      {(c.placa || c.chassi) && (
                        <div className="store-sub">
                          {c.placa ? (
                            formatarPlacaExibicao(c.placa)
                          ) : (
                            /* Zero km ainda sem emplacar: mostra o começo do
                               chassi e sinaliza a pendência, senão o cadastro
                               incompleto passa despercebido. */
                            <>
                              <span title={`Chassi ${c.chassi}`}>
                                {c.chassi.slice(0, 8)}…
                              </span>
                              <span
                                className="badge badge-pending"
                                style={{ marginLeft: 6, fontSize: 11 }}
                              >
                                sem placa
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="compacta">
                      {c.plano ? (
                        <div>
                          <div>{c.plano}</div>
                          <div className="store-sub">R$ {c.preco}/mês</div>
                        </div>
                      ) : (
                        <span className="badge badge-pending">Sem plano</span>
                      )}
                    </td>
                    {verLoja && (
                      <td className="col-hide-sm store-sub">{c.lojaNome ?? "—"}</td>
                    )}
                    <td>
                      {/* Mais de uma assinatura: a tela mostra UMA, e sem este
                          aviso a escolha ficaria invisível — foi assim que uma
                          assinatura paga ficou escondida atrás de uma
                          cancelada. */}
                      {/* Preço diferente do plano não é erro: veio do plano
                          anterior da concessionária. */}
                      {c.migrada && (
                        <span
                          className="badge badge-pending"
                          style={{ fontSize: 11, marginRight: 6 }}
                          title="Cliente migrado de plano anterior, com preço preservado."
                        >
                          migrado
                        </span>
                      )}
                      {c.qtdAssinaturas > 1 && (
                        <div className="store-sub" style={{ fontSize: 12 }}>
                          {c.qtdAssinaturas} assinaturas ·{" "}
                          <Link href={`/clientes/${c.id}/pagamentos`}>ver todas</Link>
                        </div>
                      )}
                      {c.statusAssinatura === "paga" ? (
                        <span className="badge badge-ok">Paga</span>
                      ) : c.statusAssinatura === "atrasada" ? (
                        <span className="badge badge-error">Atrasada</span>
                      ) : c.statusAssinatura === "cancelada" ? (
                        <span className="badge badge-pending">Cancelada</span>
                      ) : c.syncStatus === "erro" ? (
                        <span className="badge badge-error" title={c.syncErro ?? undefined}>
                          Falha na cobrança
                        </span>
                      ) : c.statusAssinatura === "pendente" ? (
                        <span className="badge badge-pending">Pendente</span>
                      ) : c.plano ? (
                        <span className="badge badge-pending">Processando…</span>
                      ) : (
                        <span className="store-sub">—</span>
                      )}
                      {/* Pagamento e direito de uso são dimensões distintas:
                          o cliente pode estar em dia E em carência. */}
                      {c.statusAssinatura !== "cancelada" && emCarencia(c.carenciaAte) && (
                        <div style={{ marginTop: 4 }}>
                          <span className="badge badge-pending" title="Cliente paga, mas ainda não pode usar o plano">
                            Carência até {formatarData(c.carenciaAte)}
                          </span>
                        </div>
                      )}
                      {/* Motivo da falha: sem isto o vendedor vê "falha na
                          cobrança" e não tem como saber o que corrigir. O erro
                          já era gravado no banco, só nunca era mostrado. */}
                      {c.syncStatus === "erro" && (
                        <div style={{ marginTop: 4, maxWidth: 200 }}>
                          {/* Uma linha só: a mensagem da Asaas pode ser longa e
                              estava esticando a coluna, empurrando as ações
                              para fora da tela. O texto completo fica no title
                              e no selo acima. */}
                          <div
                            className="store-sub"
                            title={c.syncErro ?? undefined}
                            style={{
                              color: "var(--erro, #b91c1c)",
                              fontSize: 12,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {c.syncErro || "Motivo não registrado."}
                          </div>
                          {c.subId && (
                            <form action={reprocessarCobranca.bind(null, c.subId)}>
                              <BotaoAcao className="btn-ghost" style={{ fontSize: 12, padding: "4px 10px", marginTop: 4 }}>
                                Tentar cobrança de novo
                              </BotaoAcao>
                            </form>
                          )}
                        </div>
                      )}
                      {/* Link da cobrança: é por aqui que o vendedor manda o
                          cliente pagar. Só faz sentido enquanto há algo em
                          aberto — assinatura paga ou cancelada não mostra. */}
                      {c.linkPagamento &&
                        c.statusAssinatura !== "cancelada" &&
                        c.statusAssinatura !== "paga" && (
                          <div style={{ marginTop: 4 }}>
                            <a
                              href={c.linkPagamento}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-link-primary"
                              style={{ fontSize: 12, padding: "4px 10px" }}
                            >
                              Abrir cobrança
                            </a>
                          </div>
                        )}
                    </td>

                    {/* Passagem na loja, ao lado do status: é aqui que o
                        consultor já está quando confere se o cliente pode ser
                        atendido. Numa tela separada, ninguém registraria. */}
                    <td>
                      {c.subId && c.statusAssinatura !== "cancelada" ? (
                        <BotaoPassagem subscriptionId={c.subId} inicial={c.passagens} />
                      ) : (
                        <span className="store-sub">—</span>
                      )}
                    </td>
                    <td className="nowrap">
                      {c.plano && (
                        <Link href={`/clientes/${c.id}/pagamentos`} className="btn-ghost btn-sm" style={{ marginRight: 8 }}>
                          Histórico
                        </Link>
                      )}
                      <Link href={`/clientes/${c.id}/editar`} className="btn-ghost btn-sm">
                        Editar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Paginacao pagina={pagina} totalPaginas={paginas} total={total} rotulo="clientes" />
          </div>
        )}
      </main>

  );
}
