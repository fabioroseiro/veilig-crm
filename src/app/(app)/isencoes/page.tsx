import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { DecidirIsencao } from "./DecidirIsencao";
import { Tour } from "@/components/tour/Tour";
import { TOURS } from "@/lib/tours";
import { mascaraCpf } from "@/lib/mascaras";

export const dynamic = "force-dynamic";

/**
 * Pendências de isenção de carência.
 *
 * Sem notificação por enquanto — o vendedor vai até o gestor e pede. Esta tela
 * é onde o gestor decide, e o histórico fica registrado para quando alguém
 * perguntar por que aquele cliente não teve carência.
 */
export default async function IsencoesPage() {
  const ctx = await getSessionContext();
  const podeDecidir =
    ctx.role === "veilig_admin" ||
    ctx.role === "group_admin" ||
    ctx.role === "store_manager";
  if (!podeDecidir) redirect("/");

  const linhas = await withTenant(ctx, async (tx) =>
    tx
      .select({
        id: schema.isencoesCarencia.id,
        cpf: schema.isencoesCarencia.cpf,
        motivo: schema.isencoesCarencia.motivo,
        status: schema.isencoesCarencia.status,
        solicitadoEm: schema.isencoesCarencia.solicitadoEm,
        decididoEm: schema.isencoesCarencia.decididoEm,
        observacao: schema.isencoesCarencia.observacao,
        usadaEm: schema.isencoesCarencia.usadaEm,
        storeId: schema.isencoesCarencia.storeId,
        loja: schema.stores.nomeFantasia,
        solicitante: schema.appUsers.nome,
      })
      .from(schema.isencoesCarencia)
      .leftJoin(schema.stores, eq(schema.stores.id, schema.isencoesCarencia.storeId))
      .leftJoin(schema.appUsers, eq(schema.appUsers.id, schema.isencoesCarencia.solicitadoPor))
      .orderBy(desc(schema.isencoesCarencia.solicitadoEm))
      .limit(60)
  );

  // Gestor de loja só decide a própria loja — mesma regra do servidor.
  const minhas = linhas.filter(
    (l) => ctx.role !== "store_manager" || l.storeId === ctx.storeId
  );
  const pendentes = minhas.filter((l) => l.status === "pendente");
  const decididas = minhas.filter((l) => l.status !== "pendente");

  const horas = (d: Date | null) =>
    d ? (Date.now() - new Date(d).getTime()) / 36e5 : 0;

  return (
    <main className="content">
      <h1>Isenção de carência</h1>
      <p className="subtitle">
        Pedidos dos vendedores para vender sem carência. A aprovação vale por{" "}
        <strong>24 horas</strong> e serve para uma venda só.
      </p>

      <Tour id="isencoes" passos={TOURS.isencoes} />
      <div className="section-label" data-tour="isen-pendentes">Aguardando decisão</div>
      {pendentes.length === 0 ? (
        <p className="hint">Nenhum pedido pendente.</p>
      ) : (
        pendentes.map((l) => (
          <div key={l.id} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>CPF {mascaraCpf(l.cpf)}</div>
                <div className="store-sub" style={{ fontSize: 13 }}>
                  {l.loja ?? "—"} · pedido por {l.solicitante ?? "—"} ·{" "}
                  {new Date(l.solicitadoEm).toLocaleString("pt-BR")}
                </div>
              </div>
            </div>
            <p style={{ marginTop: 10, marginBottom: 12 }}>{l.motivo}</p>
            <DecidirIsencao id={l.id} />
          </div>
        ))
      )}

      <div className="section-label" style={{ marginTop: 28 }}>Decididos recentemente</div>
      {decididas.length === 0 ? (
        <p className="hint">Nada ainda.</p>
      ) : (
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th>CPF</th>
                <th className="col-hide-sm">Loja</th>
                <th>Decisão</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {decididas.map((l) => {
                const expirada =
                  l.status === "aprovada" && !l.usadaEm && horas(l.decididoEm) > 24;
                return (
                  <tr key={l.id}>
                    <td>
                      {mascaraCpf(l.cpf)}
                      <div className="store-sub" style={{ fontSize: 12 }}>{l.motivo}</div>
                    </td>
                    <td className="col-hide-sm store-sub">{l.loja ?? "—"}</td>
                    <td>
                      {l.status === "aprovada" ? (
                        <span className="badge badge-ok">Aprovada</span>
                      ) : (
                        <span className="badge badge-pending">Negada</span>
                      )}
                      {l.observacao && (
                        <div className="store-sub" style={{ fontSize: 12 }}>{l.observacao}</div>
                      )}
                    </td>
                    <td className="store-sub" style={{ fontSize: 13 }}>
                      {/* Três destinos possíveis: usada na venda, ainda válida,
                          ou expirada sem uso. Sem isso, o gestor não sabe se
                          precisa aprovar de novo. */}
                      {l.usadaEm
                        ? `Usada em ${new Date(l.usadaEm).toLocaleDateString("pt-BR")}`
                        : l.status === "negada"
                        ? "—"
                        : expirada
                        ? "Expirou sem uso"
                        : `Válida até ${new Date(
                            new Date(l.decididoEm!).getTime() + 24 * 36e5
                          ).toLocaleString("pt-BR")}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
