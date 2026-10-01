import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { apurarComissoes, type ModeloComissao } from "./apuracao";
import { BaixarExcel } from "./BaixarExcel";
import { Tour } from "@/components/tour/Tour";
import { TOURS } from "@/lib/tours";

export const dynamic = "force-dynamic";

const brl = (n: number) =>
  `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function ComissoesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; modelo?: string; grupo?: string }>;
}) {
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin" && ctx.role !== "group_admin") redirect("/");

  const sp = await searchParams;
  const hoje = new Date();
  const casa = /^(\d{4})-(\d{2})$/.exec(String(sp?.mes ?? ""));
  const ano = casa ? Number(casa[1]) : hoje.getFullYear();
  const mes = casa ? Number(casa[2]) : hoje.getMonth() + 1;
  const mesRef = `${ano}-${String(mes).padStart(2, "0")}`;
  const modelo: ModeloComissao = sp?.modelo === "primeira" ? "primeira" : "recorrente";

  const dados = await withTenant(ctx, async (tx) => {
    // O período vem do GRUPO. A regra fica no banco porque tela, extração e o
    // futuro e-mail usam a mesma — três implementações divergiriam.
    //
    // Veilig admin não tem grupo próprio, e caía no mês cheio ignorando a
    // configuração. Como ele vê os dados de um grupo por vez na prática, usa o
    // grupo escolhido — ou o único que houver.
    // Gestor de grupo: sempre o dele. Veilig admin: o que escolher no seletor
    // — sem isso a tela misturava vendedores de grupos diferentes num total só,
    // com um período que não era o de nenhum deles.
    let grupoId = ctx.groupId ?? null;
    let gruposDisponiveis: { id: string; nome: string }[] = [];

    if (!grupoId) {
      const rg = await tx.execute(
        sql`SELECT id, nome_fantasia AS nome FROM "group"
            WHERE status <> 'inativo' ORDER BY nome_fantasia`
      );
      gruposDisponiveis = (Array.isArray(rg) ? rg : (rg as any).rows) as any[];

      const escolhido = String(sp?.grupo ?? "");
      grupoId =
        gruposDisponiveis.find((g) => g.id === escolhido)?.id ??
        gruposDisponiveis[0]?.id ??
        null;
    }
    let inicio = `${mesRef}-01`;
    let fim = new Date(ano, mes, 0).toISOString().slice(0, 10);

    if (grupoId) {
      const r = await tx.execute(
        sql`SELECT * FROM periodo_apuracao(${grupoId}::uuid, ${ano}, ${mes})`
      );
      const l = (Array.isArray(r) ? r : (r as any).rows)[0] as any;
      if (l) {
        inicio = String(l.inicio).slice(0, 10);
        fim = String(l.fim).slice(0, 10);
      }
    }

    const apuracao = await apurarComissoes(tx, inicio, fim, modelo, grupoId);
    return { inicio, fim, grupoId, gruposDisponiveis, ...apuracao };
  });

  const totalCompetencia = dados.linhas.reduce((s, l) => s + l.valorCompetencia, 0);
  const totalCaixa = dados.linhas.reduce((s, l) => s + l.valorCaixa, 0);

  const fmt = (d: string) => d.split("-").reverse().join("/");

  return (
    <main className="content">
      <h1>Apuração de comissões</h1>
      <Tour id="comissoes" passos={TOURS.comissoes} />
      <p className="subtitle">
        Mensalidades pagas por vendedor no período, pelo modelo de comissão
        escolhido.
      </p>

      <form method="get" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <label htmlFor="mes" style={{ fontSize: 14 }}>Competência:</label>
        <input type="month" id="mes" name="mes" defaultValue={mesRef} style={{ width: "auto" }} data-tour="com-competencia" />
        {/* Só para a Veilig: o gestor tem um grupo só e não precisa escolher. */}
        {dados.gruposDisponiveis.length > 0 && (
          <>
            <label htmlFor="grupo" style={{ fontSize: 14, marginLeft: 8 }}>Grupo:</label>
            <select
              id="grupo"
              name="grupo"
              defaultValue={dados.grupoId ?? ""}
              style={{ width: "auto" }}
            >
              {dados.gruposDisponiveis.map((g) => (
                <option key={g.id} value={g.id}>{g.nome}</option>
              ))}
            </select>
          </>
        )}
        <label htmlFor="modelo" style={{ fontSize: 14, marginLeft: 8 }}>Modelo:</label>
        <select id="modelo" name="modelo" defaultValue={modelo} style={{ width: "auto" }} data-tour="com-modelo">
          <option value="recorrente">Recorrente — todas as mensalidades</option>
          <option value="primeira">Só a primeira parcela de cada contrato</option>
        </select>
        <button type="submit" className="btn-ghost" style={{ padding: "8px 14px" }}>Ver</button>
      </form>

      {/* As datas exatas, sempre visíveis: com período deslocado, "outubro" não
          é 01 a 31, e quem confere a comissão precisa saber o intervalo. */}
      <p className="hint" style={{ marginTop: 0 }}>
        Período: <strong>{fmt(dados.inicio)} a {fmt(dados.fim)}</strong> ·{" "}
        {modelo === "primeira"
          ? "comissionando só a primeira parcela de cada contrato"
          : "comissionando todas as mensalidades pagas"}
      </p>

      <div className="stat-row" style={{ marginBottom: 18 }}>
        <div className="stat-card">
          <div className="stat-num" style={{ color: "var(--accent-ink)" }}>{brl(totalCompetencia)}</div>
          <div className="stat-label">Competência (pago pelos clientes)</div>
        </div>
        <div className="stat-card">
          <div className="stat-num" style={{ color: "var(--accent-ink)" }}>{brl(totalCaixa)}</div>
          <div className="stat-label">Caixa (já disponível)</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{dados.linhas.length}</div>
          <div className="stat-label">Vendedores com venda</div>
        </div>
      </div>

      {dados.foraDaApuracao.qtd > 0 && (
        // Sem isto, o grupo compara com o faturamento e acha que falta dinheiro.
        <div className="banner" style={{ background: "rgba(184,134,11,.10)", borderLeft: "3px solid #b8860b", marginBottom: 18 }}>
          <strong>{dados.foraDaApuracao.qtd} pagamento(s)</strong> no período, somando{" "}
          {brl(dados.foraDaApuracao.valor)}, ficaram fora da apuração: são vendas
          feitas por gestores ou pela administração, que não recebem comissão.
        </div>
      )}

      {dados.linhas.length === 0 ? (
        <p className="hint">Nenhuma mensalidade paga por vendedores neste período.</p>
      ) : (
        <>
          <BaixarExcel linhas={dados.linhas} inicio={dados.inicio} fim={dados.fim} />
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="list">
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th className="col-hide-sm">Loja</th>
                  <th>Mensalidades</th>
                  <th>Competência</th>
                  <th className="col-hide-sm">Líquido</th>
                  <th>Caixa</th>
                  <th>A receber</th>
                </tr>
              </thead>
              <tbody>
                {dados.linhas.map((l) => (
                  <tr key={l.vendedorId}>
                    <td>{l.vendedor}</td>
                    <td className="col-hide-sm store-sub">{l.loja ?? "—"}</td>
                    <td>{l.qtdPagas}</td>
                    <td><strong>{brl(l.valorCompetencia)}</strong></td>
                    <td className="col-hide-sm store-sub">{brl(l.valorLiquidoCompetencia)}</td>
                    <td>{brl(l.valorCaixa)}</td>
                    <td className="store-sub">
                      {/* A diferença entre competência e caixa: pago pelo
                          cliente, ainda não liberado pela Asaas. */}
                      {brl(Math.max(0, l.valorCompetencia - l.valorCaixa))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            <strong>Competência</strong> é o que os clientes pagaram no período.{" "}
            <strong>Caixa</strong> é o que já ficou disponível na conta — cartão
            leva mais tempo que boleto e Pix. A diferença é o que ainda vai cair.
          </p>
        </>
      )}
    </main>
  );
}
