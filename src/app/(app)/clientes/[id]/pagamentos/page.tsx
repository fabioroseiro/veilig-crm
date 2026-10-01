import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { eq, sql } from "drizzle-orm";
import { historicoPagamentosAsaas } from "@/lib/asaas";
import { formatarPlacaExibicao } from "@/lib/mascaras";

export const dynamic = "force-dynamic";

const meioLabel: Record<string, string> = {
  CREDIT_CARD: "Cartão de crédito",
  BOLETO: "Boleto",
  PIX: "Pix",
  UNDEFINED: "A definir",
};

const statusLabel: Record<string, { txt: string; cls: string }> = {
  paga: { txt: "Paga", cls: "badge-ok" },
  pendente: { txt: "Pendente", cls: "badge-pending" },
  atrasada: { txt: "Atrasada", cls: "badge-error" },
  cancelada: { txt: "Cancelada", cls: "badge-pending" },
  ativa: { txt: "Em processamento", cls: "badge-pending" },
};

// Vigente primeiro: é a que a loja precisa ver ao abrir a tela.
const pesoStatus = (st: string) =>
  st === "paga" ? 4 : st === "pendente" ? 3 : st === "atrasada" ? 2 : st === "ativa" ? 2 : 1;

/**
 * Histórico de pagamentos de TODAS as assinaturas do cliente.
 *
 * A versão anterior buscava com `.limit(1)` e mostrava só a primeira. Um
 * cliente com duas motos — ou que cancelou e reassinou — via o histórico de
 * uma só, e a loja não tinha como enxergar a outra. Mesmo erro que a lista de
 * clientes tinha: escolha silenciosa entre vários registros.
 */
async function getDados(customerId: string) {
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) => {
    const cliente = await tx
      .select({ personId: schema.customers.personId })
      .from(schema.customers)
      .where(eq(schema.customers.id, customerId))
      .limit(1);
    if (!cliente[0]) return null;

    const assinaturas = await tx
      .select({
        id: schema.subscriptions.id,
        asaasId: schema.subscriptions.asaasSubscriptionId,
        status: schema.subscriptions.status,
        contrato: schema.subscriptions.contratoNumero,
        preco: schema.subscriptions.precoContratado,
        criadaEm: schema.subscriptions.createdAt,
        placa: schema.vehicles.placa,
        chassi: schema.vehicles.chassi,
        marca: schema.vehicles.marca,
        modelo: schema.vehicles.modelo,
        ano: schema.vehicles.ano,
        plano: schema.plans.nome,
      })
      .from(schema.subscriptions)
      .leftJoin(schema.vehicles, eq(schema.vehicles.id, schema.subscriptions.vehicleId))
      .leftJoin(schema.plans, eq(schema.plans.id, schema.subscriptions.planId))
      .where(eq(schema.subscriptions.customerId, customerId));

    assinaturas.sort(
      (a, b) =>
        pesoStatus(String(b.status)) - pesoStatus(String(a.status)) ||
        new Date(b.criadaEm as any).getTime() - new Date(a.criadaEm as any).getTime()
    );

    const r = await tx.execute(
      sql`SELECT nome_completo AS nome FROM persons_by_ids(${"{" + cliente[0].personId + "}"}::uuid[])`
    );
    const nome = (Array.isArray(r) ? r : (r as any).rows)[0]?.nome ?? "Cliente";
    return { assinaturas, nome };
  });
}

const brl = (n: number) => "R$ " + Number(n).toFixed(2).replace(".", ",");
const fmtData = (d: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export default async function PagamentosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!["veilig_admin", "group_admin", "store_manager", "store_admin"].includes(ctx.role)) redirect("/");

  const dados = await getDados(id);
  if (!dados) notFound();
  const { assinaturas, nome } = dados;

  // Em paralelo: uma consulta à Asaas por assinatura, sem esperar uma pela outra.
  const historicos = await Promise.all(
    assinaturas.map((s) => (s.asaasId ? historicoPagamentosAsaas(s.asaasId) : Promise.resolve([])))
  );

  return (
    <main className="content">
      <p className="crumb" style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 6 }}>
        <Link href="/clientes">Clientes</Link> / {nome} / Pagamentos
      </p>
      <h1>Histórico de pagamentos</h1>
      <p className="subtitle">
        {nome} — {assinaturas.length}{" "}
        {assinaturas.length === 1 ? "assinatura" : "assinaturas"}. Dados em tempo real da Asaas.
      </p>

      {assinaturas.length === 0 && (
        <div className="card">
          <p style={{ margin: 0 }}>Este cliente não tem assinaturas.</p>
        </div>
      )}

      {assinaturas.map((s, idx) => {
        const historico = historicos[idx] ?? [];
        const selo = statusLabel[String(s.status)] ?? { txt: String(s.status), cls: "badge-pending" };
        const identificacao = s.placa
          ? formatarPlacaExibicao(s.placa)
          : s.chassi
          ? `chassi ${s.chassi}`
          : "veículo sem identificação";

        return (
          <section key={s.id} className="card" style={{ marginBottom: 20 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{identificacao}</div>
                <div className="store-sub" style={{ fontSize: 13 }}>
                  {[s.marca, s.modelo, s.ano].filter(Boolean).join(" · ")}
                </div>
                <div className="store-sub" style={{ fontSize: 13 }}>
                  {s.plano ?? "Plano"} · {brl(Number(s.preco))}/mês
                  {s.contrato ? ` · ${s.contrato}` : ""}
                </div>
              </div>
              <span className={`badge ${selo.cls}`}>{selo.txt}</span>
            </div>

            {!s.asaasId ? (
              <p className="hint" style={{ margin: 0 }}>
                Esta assinatura não está sincronizada com a Asaas, então não há histórico de
                cobranças para mostrar.
              </p>
            ) : historico.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>Nenhuma cobrança encontrada para esta assinatura.</p>
            ) : (
              <div className="table-wrap">
                <table className="list">
                  <thead>
                    <tr>
                      <th>Vencimento</th>
                      <th>Valor</th>
                      <th>Meio</th>
                      <th>Situação</th>
                      <th>Pago em</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.map((c, i) => {
                      const paga = ["RECEIVED", "RECEIVED_IN_CASH", "CONFIRMED"].includes(c.status);
                      const vencida = c.status === "OVERDUE";
                      return (
                        <tr key={i}>
                          <td>{fmtData(c.vencimento)}</td>
                          <td>{brl(c.valor)}</td>
                          <td>{meioLabel[c.meio] || c.meio}</td>
                          <td>
                            <span className={`badge ${paga ? "badge-ok" : vencida ? "badge-error" : "badge-pending"}`}>
                              {c.statusLabel}
                            </span>
                          </td>
                          <td>{fmtData(c.dataPagamento)}</td>
                          <td>
                            {c.link && (
                              <a href={c.link} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">
                                Ver
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
