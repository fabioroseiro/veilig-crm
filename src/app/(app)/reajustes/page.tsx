import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { ReajusteForm, type LinhaReajuste } from "./ReajusteForm";

export const dynamic = "force-dynamic";

/**
 * Reajuste anual (cláusula 8).
 *
 * Lista com um mês de antecedência: reajuste esquecido NÃO pode ser cobrado
 * retroativamente, então quem passar do mês perdeu aquele aumento.
 */
export default async function ReajustesPage({
  searchParams,
}: {
  searchParams: Promise<{ grupo?: string }>;
}) {
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin" && ctx.role !== "group_admin") redirect("/");
  const sp = await searchParams;

  const dados = await withTenant(ctx, async (tx) => {
    let grupos: { id: string; nome: string | null }[] = [];
    let grupoId = ctx.groupId ?? null;

    if (ctx.role === "veilig_admin") {
      grupos = await tx
        .select({ id: schema.groups.id, nome: schema.groups.nomeFantasia })
        .from(schema.groups)
        .where(eq(schema.groups.status, "ativo"))
        .orderBy(schema.groups.nomeFantasia);
      const escolhido = String(sp?.grupo ?? "");
      grupoId = grupos.find((g) => g.id === escolhido)?.id ?? grupos[0]?.id ?? null;
    }
    if (!grupoId) return null;

    const [grupo] = await tx
      .select({
        indice: schema.groups.indiceReajuste,
        teto: schema.groups.tetoReajustePercent,
      })
      .from(schema.groups)
      .where(eq(schema.groups.id, grupoId))
      .limit(1);

    const r = await tx.execute(sql`SELECT * FROM assinaturas_para_reajuste(${grupoId}::uuid, 1)`);
    const linhas = ((Array.isArray(r) ? r : (r as any).rows) as any[]).map(
      (l): LinhaReajuste => ({
        id: l.id,
        contrato: l.contrato,
        cliente: l.cliente,
        email: l.email,
        veiculo: l.veiculo,
        plano: l.plano,
        loja: l.loja,
        precoAtual: Number(l.preco_atual),
        aniversario: String(l.aniversario),
        jaVenceu: l.ja_venceu === true,
      })
    );

    return { grupoId, grupos, indice: grupo?.indice ?? null, teto: grupo?.teto != null ? Number(grupo.teto) : null, linhas };
  });

  if (!dados) {
    return (
      <main className="content">
        <h1>Reajuste anual</h1>
        <p className="hint">Nenhum grupo disponível.</p>
      </main>
    );
  }

  return (
    <main className="content">
      <h1>Reajuste anual</h1>
      <p className="subtitle">
        Contratos que completam 12 meses. O reajuste vale do aniversário em diante e
        não pode ser cobrado retroativamente — por isso a lista mostra também os do
        próximo mês.
      </p>

      {dados.grupos.length > 0 && (
        <form method="get" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <label htmlFor="grupo" style={{ fontSize: 14 }}>Grupo:</label>
          <select id="grupo" name="grupo" defaultValue={dados.grupoId} style={{ width: "auto" }}>
            {dados.grupos.map((g) => (
              <option key={g.id} value={g.id}>{g.nome ?? "Grupo"}</option>
            ))}
          </select>
          <button type="submit" className="btn-ghost" style={{ padding: "8px 14px" }}>Ver</button>
        </form>
      )}

      {dados.linhas.length === 0 ? (
        <p className="hint">Nenhum contrato completa 12 meses neste período.</p>
      ) : (
        <ReajusteForm
          linhas={dados.linhas}
          grupoId={dados.grupoId}
          indice={dados.indice}
          teto={dados.teto}
        />
      )}
    </main>
  );
}
