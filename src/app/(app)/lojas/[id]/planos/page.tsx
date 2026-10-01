import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { and, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getDados(storeId: string) {
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) => {
    const lojaRows = await tx
      .select({
        id: schema.stores.id,
        nomeFantasia: schema.stores.nomeFantasia,
        groupId: schema.stores.groupId,
      })
      .from(schema.stores)
      .where(eq(schema.stores.id, storeId))
      .limit(1);
    const loja = lojaRows[0];
    if (!loja) return null;

    // afinidades da loja → pares fabricante|categoria
    const afinidades = await tx
      .select({
        fabricante: schema.storeAffinities.fabricante,
        categoria: schema.storeAffinities.categoria,
      })
      .from(schema.storeAffinities)
      .where(eq(schema.storeAffinities.storeId, storeId));
    const pares = new Set(afinidades.map((a) => `${a.fabricante}|${a.categoria}`));

    // planos do grupo
    const planos = await tx
      .select({
        id: schema.plans.id,
        nome: schema.plans.nome,
        minimoMin: sql<string>`(SELECT min(pm.preco_minimo) FROM plan_model pm WHERE pm.plan_id = "plan"."id")`,
        minimoMax: sql<string>`(SELECT max(pm.preco_minimo) FROM plan_model pm WHERE pm.plan_id = "plan"."id")`,
      })
      .from(schema.plans)
      .where(and(eq(schema.plans.groupId, loja.groupId), eq(schema.plans.status, "ativo")));

    const resultado = [];
    for (const p of planos) {
      // modelos do plano
      const modelosPlano = await tx
        .select({
          fabricante: schema.vehicleModels.fabricante,
          categoria: schema.vehicleModels.categoria,
        })
        .from(schema.planModels)
        .innerJoin(schema.vehicleModels, eq(schema.planModels.vehicleModelId, schema.vehicleModels.id))
        .where(eq(schema.planModels.planId, p.id));

      // quantos modelos do plano são compatíveis com a afinidade da loja
      const compativeis = modelosPlano.filter((m) =>
        pares.has(`${m.fabricante}|${m.categoria}`)
      ).length;

      // quantos esta loja já precificou
      const sp = await tx
        .select({ id: schema.storePlans.id })
        .from(schema.storePlans)
        .where(and(eq(schema.storePlans.storeId, storeId), eq(schema.storePlans.planId, p.id)))
        .limit(1);
      let precificados = 0;
      if (sp[0]) {
        const cnt = await tx
          .select({ id: schema.storePlanPrices.id })
          .from(schema.storePlanPrices)
          .where(eq(schema.storePlanPrices.storePlanId, sp[0].id));
        precificados = cnt.length;
      }

      resultado.push({
        id: p.id,
        nome: p.nome,
        minimo:
          p.minimoMin == null
            ? "—"
            : Number(p.minimoMin) === Number(p.minimoMax)
            ? Number(p.minimoMin).toFixed(2).replace(".", ",")
            : `${Number(p.minimoMin).toFixed(2).replace(".", ",")} a ${Number(p.minimoMax).toFixed(2).replace(".", ",")}`,
        compativeis,
        precificados,
      });
    }

    return { loja, planos: resultado, temAfinidade: pares.size > 0 };
  });
}

export default async function LojaPlanosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Gestor de loja só acessa a precificação da PRÓPRIA loja (trava de URL).
  const ctx = await getSessionContext();
  if (ctx.role === "store_manager" && ctx.storeId !== id) {
    redirect("/precos");
  }
  // Vendedor não precifica.
  if (ctx.role === "store_admin") {
    redirect("/");
  }

  const dados = await getDados(id);
  if (!dados) notFound();

  const { loja, planos, temAfinidade } = dados;

  return (
      <main className="content">
        <p className="crumb" style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 6 }}>
          <Link href="/lojas">Lojas</Link> / <Link href={`/lojas/${loja.id}`}>{loja.nomeFantasia}</Link> / Planos
        </p>
        <h1>Planos — {loja.nomeFantasia}</h1>
        <p className="subtitle">
          Planos do grupo. Precifique os modelos que esta loja vende; só aparecem os
          modelos compatíveis com a afinidade da loja.
        </p>

        {!temAfinidade && (
          <div className="banner banner-error">
            Esta loja ainda não tem afinidade definida. Defina em{" "}
            <Link href={`/lojas/${loja.id}`}>Modelos</Link> para que os planos possam ser precificados.
          </div>
        )}

        {planos.length === 0 ? (
          <div className="table-wrap">
            <div className="empty">
              <h2>O grupo ainda não tem planos</h2>
              <p>Crie um plano na aba Planos primeiro.</p>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th>Plano</th>
                  <th>Preço mínimo</th>
                  <th>Compatível com a loja</th>
                  <th>À venda</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {planos.map((p) => {
                  const aplicavel = p.compativeis > 0;
                  return (
                    <tr key={p.id}>
                      <td className="store-name">{p.nome}</td>
                      <td>R$ {p.minimo}/mês</td>
                      <td>
                        {aplicavel ? (
                          `${p.compativeis} modelo(s)`
                        ) : (
                          <span style={{ color: "var(--ink-soft)" }}>Nenhum</span>
                        )}
                      </td>
                      <td>
                        {p.precificados > 0 ? (
                          <span className="badge badge-ok">{p.precificados} à venda</span>
                        ) : (
                          <span className="badge badge-pending">—</span>
                        )}
                      </td>
                      <td>
                        {aplicavel ? (
                          <Link href={`/lojas/${loja.id}/planos/${p.id}`} className="btn-ghost btn-sm">
                            Precificar
                          </Link>
                        ) : (
                          <span style={{ color: "var(--ink-soft)", fontSize: 13 }}>
                            não aplicável
                          </span>
                        )}
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
