import { redirect } from "next/navigation";
import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { eq } from "drizzle-orm";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Desempenho por loja e por vendedor, num PERÍODO.
 *
 * O período não é conveniência: as comissões dos clientes saem daqui, então o
 * número precisa ser reproduzível — "agosto" tem que dar o mesmo resultado
 * hoje e daqui a três meses, e por isso o filtro é por data de venda, não por
 * "últimos 30 dias".
 */
async function getDesempenho(de: Date, ate: Date) {
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) => {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    // lojas do grupo (RLS já limita ao grupo do gestor; Veilig vê todas)
    const lojas = await tx
      .select({
        id: schema.stores.id,
        nome: schema.stores.nomeFantasia,
      })
      .from(schema.stores);

    // todas as assinaturas visíveis (RLS limita ao grupo)
    //
    // O vendedor entra por LEFT JOIN: venda feita por administrador não tem
    // vendedor de loja, e com innerJoin ela sumiria da tabela — o total por
    // vendedor deixaria de bater com o total do grupo, e ninguém entenderia
    // por quê.
    const subs = await tx
      .select({
        storeId: schema.subscriptions.storeId,
        preco: schema.subscriptions.precoContratado,
        createdAt: schema.subscriptions.createdAt,
        vendedorId: schema.subscriptions.vendedorId,
        vendedorNome: schema.appUsers.nome,
        lojaDoVendedor: schema.stores.nomeFantasia,
        status: schema.subscriptions.status,
        canceladaEm: schema.subscriptions.canceladaEm,
      })
      .from(schema.subscriptions)
      .leftJoin(schema.appUsers, eq(schema.appUsers.id, schema.subscriptions.vendedorId))
      .leftJoin(schema.stores, eq(schema.stores.id, schema.subscriptions.storeId));

    // agrupa por VENDEDOR
    const porVendedor = new Map<
      string,
      {
        nome: string; loja: string;
        qtd: number; valor: number;
        canceladas: number; valorCancelado: number;
      }
    >();
    for (const s of subs) {
      // Sem vendedor identificado, agrupa numa linha própria em vez de sumir.
      const vendida = new Date(s.createdAt);
      if (vendida < de || vendida > ate) continue;

      const chave = s.vendedorId ?? "__sem_vendedor__";
      if (!porVendedor.has(chave)) {
        porVendedor.set(chave, {
          nome: s.vendedorNome ?? "Contratação pela administração",
          loja: s.lojaDoVendedor ?? "—",
          qtd: 0, valor: 0,
          canceladas: 0, valorCancelado: 0,
        });
      }
      const alvo = porVendedor.get(chave)!;
      const preco = Number(s.preco) || 0;

      alvo.qtd += 1;
      alvo.valor += preco;

      // Cancelada conta à parte: quem vende muito e perde muito não vendeu
      // bem, e comissão sobre venda desfeita é dinheiro pago a mais.
      if (s.status === "cancelada") {
        alvo.canceladas += 1;
        alvo.valorCancelado += preco;
      }
    }

    // agrupa por loja
    const porLoja = new Map<
      string,
      { nome: string; qtdMes: number; qtdTotal: number; valorMes: number; valorTotal: number }
    >();
    for (const l of lojas) {
      porLoja.set(l.id, { nome: l.nome, qtdMes: 0, qtdTotal: 0, valorMes: 0, valorTotal: 0 });
    }
    for (const s of subs) {
      const alvo = porLoja.get(s.storeId);
      if (!alvo) continue;
      const preco = Number(s.preco) || 0;
      const noMes = new Date(s.createdAt) >= inicioMes;
      alvo.qtdTotal += 1;
      alvo.valorTotal += preco;
      if (noMes) {
        alvo.qtdMes += 1;
        alvo.valorMes += preco;
      }
    }

    const linhas = Array.from(porLoja.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.valorTotal - a.valorTotal);

    const totalMes = linhas.reduce((s, l) => s + l.valorMes, 0);
    const totalGeral = linhas.reduce((s, l) => s + l.valorTotal, 0);

    const vendedores = [...porVendedor.values()].sort(
      (a, b) => b.valor - a.valor
    );

    return { linhas, vendedores, totalMes, totalGeral };
  });
}

const brl = (n: number) => "R$ " + n.toFixed(2).replace(".", ",");

/**
 * Lê o período da URL. Sem parâmetro, usa o mês corrente.
 *
 * Formato `?mes=2026-08`: legível na barra de endereços, e o gestor consegue
 * salvar ou mandar o link do mês que usou para calcular a comissão.
 */
function lerPeriodo(sp: { mes?: string }) {
  const hoje = new Date();
  const bruto = String(sp?.mes ?? "");
  const casa = /^(\d{4})-(\d{2})$/.exec(bruto);

  const ano = casa ? Number(casa[1]) : hoje.getFullYear();
  const mes = casa ? Number(casa[2]) - 1 : hoje.getMonth();

  const de = new Date(ano, mes, 1, 0, 0, 0, 0);
  // Dia 0 do mês seguinte = último dia deste mês.
  const ate = new Date(ano, mes + 1, 0, 23, 59, 59, 999);

  return {
    de,
    ate,
    mesRef: `${ano}-${String(mes + 1).padStart(2, "0")}`,
    rotulo: de.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
  };
}

export default async function DesempenhoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin" && ctx.role !== "group_admin") redirect("/");

  const { de, ate, rotulo, mesRef } = lerPeriodo(await searchParams);
  const { linhas, vendedores, totalMes, totalGeral } = await getDesempenho(de, ate);

  return (
      <main className="content">
        <AutoRefresh segundos={20} />
        <h1>Desempenho por loja</h1>
        <p className="subtitle">
          Acompanhe as vendas de cada loja do grupo.
        </p>

        <div className="stat-row">
          <div className="stat-card">
            <div className="stat-num">{brl(totalMes)}</div>
            <div className="stat-label">Faturamento do grupo este mês</div>
          </div>
          <div className="stat-card">
            <div className="stat-num">{brl(totalGeral)}</div>
            <div className="stat-label">Faturamento do grupo total</div>
          </div>
        </div>

        <div className="table-wrap" style={{ marginTop: 20 }}>
          {linhas.length === 0 ? (
            <div className="card">
              <p style={{ margin: 0 }}>Nenhuma loja cadastrada no grupo ainda.</p>
            </div>
          ) : (
            <table className="list">
              <thead>
                <tr>
                  <th>Loja</th>
                  <th>Vendas no mês</th>
                  <th>Valor no mês</th>
                  <th>Vendas no total</th>
                  <th>Valor no total</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id}>
                    <td className="store-name">
                      <Link href={`/lojas/${l.id}`}>{l.nome}</Link>
                    </td>
                    <td>{l.qtdMes}</td>
                    <td>{brl(l.valorMes)}</td>
                    <td>{l.qtdTotal}</td>
                    <td>{brl(l.valorTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Por vendedor: o gestor de loja já tinha essa visão, o de grupo não.
            Quem cobra meta precisa ver quem vendeu, não só onde. */}
        <div className="section-label" style={{ marginTop: 28 }}>
          Vendas por vendedor — {rotulo}
        </div>

        {/* Filtro por mês fechado, não "últimos 30 dias": a comissão precisa
            dar o mesmo número hoje e daqui a três meses. */}
        <form method="get" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <label htmlFor="mes" style={{ fontSize: 14 }}>Mês:</label>
          <input
            type="month"
            id="mes"
            name="mes"
            defaultValue={mesRef}
            style={{ width: "auto" }}
          />
          <button type="submit" className="btn-ghost" style={{ padding: "8px 14px" }}>
            Ver período
          </button>
        </form>
        {vendedores.length === 0 ? (
          <p className="hint">Nenhuma venda neste período.</p>
        ) : (
          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th className="col-hide-sm">Loja</th>
                  <th>Vendas</th>
                  <th>Valor vendido</th>
                  <th>Canceladas</th>
                  <th>Valor líquido</th>
                </tr>
              </thead>
              <tbody>
                {vendedores.map((v, i) => (
                  <tr key={i}>
                    <td>{v.nome}</td>
                    <td className="col-hide-sm store-sub">{v.loja}</td>
                    <td>{v.qtd}</td>
                    <td>{brl(v.valor)}</td>
                    <td>
                      {v.canceladas > 0 ? (
                        <span style={{ color: "var(--danger)" }}>
                          {v.canceladas}
                          <span className="store-sub" style={{ fontSize: 12 }}>
                            {" "}({brl(v.valorCancelado)})
                          </span>
                        </span>
                      ) : (
                        <span className="store-sub">—</span>
                      )}
                    </td>
                    {/* Líquido = vendido menos cancelado. É a base de comissão
                        que faz sentido: venda desfeita não gera receita. */}
                    <td>
                      <strong>{brl(v.valor - v.valorCancelado)}</strong>
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
