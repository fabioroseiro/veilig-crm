import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/AutoRefresh";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getVendas(storeId: string) {
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) => {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    // todas as assinaturas da loja, com o vendedor e o valor
    const linhas = await tx
      .select({
        vendedorId: schema.subscriptions.vendedorId,
        vendedorNome: schema.appUsers.nome,
        preco: schema.subscriptions.precoContratado,
        status: schema.subscriptions.status,
        createdAt: schema.subscriptions.createdAt,
      })
      .from(schema.subscriptions)
      .leftJoin(schema.appUsers, eq(schema.appUsers.id, schema.subscriptions.vendedorId))
      .where(eq(schema.subscriptions.storeId, storeId));

    // agrupa por vendedor (em memória — volume por loja é pequeno)
    const porVendedor = new Map<
      string,
      { nome: string; qtdMes: number; qtdTotal: number; valorMes: number; valorTotal: number }
    >();

    for (const l of linhas) {
      const chave = l.vendedorId || "sem-vendedor";
      const nome = l.vendedorNome || "Sem vendedor";
      const preco = Number(l.preco) || 0;
      const noMes = new Date(l.createdAt) >= inicioMes;
      const atual = porVendedor.get(chave) || {
        nome,
        qtdMes: 0,
        qtdTotal: 0,
        valorMes: 0,
        valorTotal: 0,
      };
      atual.qtdTotal += 1;
      atual.valorTotal += preco;
      if (noMes) {
        atual.qtdMes += 1;
        atual.valorMes += preco;
      }
      porVendedor.set(chave, atual);
    }

    const vendedores = Array.from(porVendedor.values()).sort(
      (a, b) => b.valorTotal - a.valorTotal
    );

    const totalMes = vendedores.reduce((s, v) => s + v.valorMes, 0);
    const totalGeral = vendedores.reduce((s, v) => s + v.valorTotal, 0);

    return { vendedores, totalMes, totalGeral };
  });
}

const brl = (n: number) => "R$ " + n.toFixed(2).replace(".", ",");

export default async function VendasPage() {
  const ctx = await getSessionContext();
  if (ctx.role !== "store_manager" || !ctx.storeId) redirect("/");

  const { vendedores, totalMes, totalGeral } = await getVendas(ctx.storeId);

  return (
      <main className="content">
        <AutoRefresh segundos={20} />
        <h1>Vendas por vendedor</h1>
        <p className="subtitle">
          Acompanhe o desempenho da equipe e apure comissões.
        </p>

        <div className="stat-row">
          <div className="stat-card">
            <div className="stat-num">{brl(totalMes)}</div>
            <div className="stat-label">Faturamento este mês</div>
          </div>
          <div className="stat-card">
            <div className="stat-num">{brl(totalGeral)}</div>
            <div className="stat-label">Faturamento total</div>
          </div>
        </div>

        <div className="table-wrap" style={{ marginTop: 20 }}>
          {vendedores.length === 0 ? (
            <div className="card">
              <p style={{ margin: 0 }}>Ainda não há vendas nesta loja.</p>
            </div>
          ) : (
            <table className="list">
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>Vendas no mês</th>
                  <th>Valor no mês</th>
                  <th>Vendas no total</th>
                  <th>Valor no total</th>
                </tr>
              </thead>
              <tbody>
                {vendedores.map((v, i) => (
                  <tr key={i}>
                    <td className="store-name">{v.nome}</td>
                    <td>{v.qtdMes}</td>
                    <td>{brl(v.valorMes)}</td>
                    <td>{v.qtdTotal}</td>
                    <td>{brl(v.valorTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="hint" style={{ marginTop: 16 }}>
          O valor considera o preço mensal contratado de cada assinatura. A
          comissão pode ser calculada sobre esses totais conforme sua política.
        </p>
      </main>

  );
}
