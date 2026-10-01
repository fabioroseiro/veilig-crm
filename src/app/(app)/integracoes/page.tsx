import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { NovaCredencial } from "./NovaCredencial";
import { RevogarCredencial } from "./RevogarCredencial";
import { DocumentacaoApi } from "./DocumentacaoApi";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function IntegracoesPage() {
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin" && ctx.role !== "group_admin") redirect("/");

  // Endereço tirado do próprio acesso: homologação mostra o de homologação e
  // produção o de produção, sem ninguém trocar à mão nos exemplos.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "app.veilig.com.br";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const baseUrl = `${proto}://${host}`;

  // Filtro explícito além do RLS: o gestor vê só as chaves do próprio grupo.
  // Chaves da Veilig (grupo nulo) enxergam todos os clientes e não aparecem
  // para ninguém além dela.
  // Lista de grupos só para a Veilig: é ela que escolhe o alcance da chave.
  const grupos =
    ctx.role === "veilig_admin"
      ? await withTenant(ctx, async (tx) =>
          tx
            .select({ id: schema.groups.id, nome: schema.groups.nomeFantasia })
            .from(schema.groups)
            .where(eq(schema.groups.status, "ativo"))
            .orderBy(schema.groups.nomeFantasia)
        )
      : [];

  const linhas = await withTenant(ctx, async (tx) =>
    tx
      .select()
      .from(schema.apiCredenciais)
      .where(
        ctx.role === "veilig_admin"
          ? undefined
          : eq(schema.apiCredenciais.groupId, ctx.groupId ?? "00000000-0000-0000-0000-000000000000")
      )
      .orderBy(desc(schema.apiCredenciais.criadaEm))
      .limit(50)
  );

  return (
    <main className="content">
      <h1>Integrações</h1>
      <p className="subtitle">
        Chaves para outros sistemas consultarem se um veículo tem plano ativo —
        o DMS da concessionária, o sistema de check-list, e o que vier depois.
      </p>

      <NovaCredencial grupos={grupos.map((g) => ({ id: g.id, nome: g.nome ?? "Grupo sem nome" }))} />

      <DocumentacaoApi baseUrl={baseUrl} />

      <div className="section-label">Chaves</div>
      {linhas.length === 0 ? (
        <p className="hint">Nenhuma credencial criada ainda.</p>
      ) : (
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th>Integração</th>
                <th className="col-hide-sm">Chave</th>
                <th>Situação</th>
                <th className="col-hide-sm">Último uso</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((c) => (
                <tr key={c.id} style={!c.ativa ? { opacity: 0.55 } : undefined}>
                  <td>{c.nome}</td>
                  <td className="col-hide-sm store-sub" style={{ fontFamily: "ui-monospace, monospace" }}>
                    {c.chavePrefixo}…
                  </td>
                  <td>
                    {c.ativa ? (
                      <span className="badge badge-ok">Ativa</span>
                    ) : (
                      <span className="badge badge-pending">Revogada</span>
                    )}
                  </td>
                  <td className="col-hide-sm store-sub">
                    {c.ultimoUso
                      ? new Date(c.ultimoUso).toLocaleString("pt-BR")
                      : "nunca usada"}
                  </td>
                  <td>{c.ativa && <RevogarCredencial id={c.id} nome={c.nome} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
