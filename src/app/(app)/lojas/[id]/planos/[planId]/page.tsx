import Link from "next/link";
import { notFound } from "next/navigation";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { and, eq } from "drizzle-orm";
import { CATEGORIAS } from "@/lib/vehicle-model-validation";
import { PrecificarForm } from "./PrecificarForm";

export const dynamic = "force-dynamic";

async function getDados(storeId: string, planId: string) {
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) => {
    const lojaRows = await tx
      .select({ id: schema.stores.id, nomeFantasia: schema.stores.nomeFantasia, fabricante: schema.stores.fabricante })
      .from(schema.stores)
      .where(eq(schema.stores.id, storeId))
      .limit(1);
    const loja = lojaRows[0];
    if (!loja) return null;

    const planoRows = await tx
      .select({ id: schema.plans.id, nome: schema.plans.nome })
      .from(schema.plans)
      .where(eq(schema.plans.id, planId))
      .limit(1);
    const plano = planoRows[0];
    if (!plano) return null;

    // afinidade da loja → pares fabricante|categoria
    const afinidades = await tx
      .select({
        fabricante: schema.storeAffinities.fabricante,
        categoria: schema.storeAffinities.categoria,
      })
      .from(schema.storeAffinities)
      .where(eq(schema.storeAffinities.storeId, storeId));
    const paresAfinidade = new Set(
      afinidades.map((a) => `${a.fabricante}|${a.categoria}`)
    );

    // modelos cobertos pelo plano (join plan_model → vehicle_model),
    // filtrados pela afinidade da loja (só o que ela atende)
    const modelosTodos = await tx
      .select({
        id: schema.vehicleModels.id,
        fabricante: schema.vehicleModels.fabricante,
        modelo: schema.vehicleModels.modelo,
        versao: schema.vehicleModels.versao,
        categoria: schema.vehicleModels.categoria,
        precoMinimo: schema.planModels.precoMinimo,
      })
      .from(schema.planModels)
      .innerJoin(schema.vehicleModels, eq(schema.planModels.vehicleModelId, schema.vehicleModels.id))
      .where(eq(schema.planModels.planId, planId));

    const modelos = modelosTodos.filter((m) =>
      paresAfinidade.has(`${m.fabricante}|${m.categoria}`)
    );

    // preços já definidos por esta loja para este plano
    const spRows = await tx
      .select({ id: schema.storePlans.id })
      .from(schema.storePlans)
      .where(and(eq(schema.storePlans.storeId, storeId), eq(schema.storePlans.planId, planId)))
      .limit(1);

    let precos: Record<string, string> = {};
    if (spRows[0]) {
      const pr = await tx
        .select({
          vehicleModelId: schema.storePlanPrices.vehicleModelId,
          preco: schema.storePlanPrices.preco,
        })
        .from(schema.storePlanPrices)
        .where(eq(schema.storePlanPrices.storePlanId, spRows[0].id));
      precos = Object.fromEntries(pr.map((r) => [r.vehicleModelId, Number(r.preco).toFixed(2).replace(".", ",")]));
    }

    return { loja, plano, modelos, precos };
  });
}

export default async function PrecificarPage({
  params,
}: {
  params: Promise<{ id: string; planId: string }>;
}) {
  const { id, planId } = await params;
  const dados = await getDados(id, planId);
  if (!dados) notFound();

  const { loja, plano, modelos, precos } = dados;
  const rotuloCat = (v: string) => CATEGORIAS.find((c) => c.valor === v)?.rotulo ?? v;

  const modelosFmt = modelos
    .map((m) => ({
      id: m.id,
      fabricante: m.fabricante,
      label: `${m.fabricante} ${m.modelo}${m.versao ? " " + m.versao : ""}`,
      categoria: rotuloCat(m.categoria),
      precoAtual: precos[m.id] ?? "",
      minimo: Number(m.precoMinimo).toFixed(2).replace(".", ","),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const fabricantes = Array.from(new Set(modelos.map((m) => m.fabricante))).sort();

  return (
      <main className="content">
        <p className="crumb" style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 6 }}>
          <Link href="/lojas">Lojas</Link> / <Link href={`/lojas/${loja.id}`}>{loja.nomeFantasia}</Link> / Precificar plano
        </p>
        <h1>{plano.nome}</h1>
        <p className="subtitle">
          Defina o preço de cada modelo que esta loja vai vender. Deixe em branco os
          que não vende. O <strong>mínimo do grupo aparece em cada modelo</strong> —
          ele varia conforme o custo de manutenção de cada veículo.
        </p>

        {modelosFmt.length === 0 ? (
          <div className="card">
            <div className="banner banner-error" style={{ marginBottom: 0 }}>
              Nenhum modelo deste plano é compatível com a afinidade desta loja.
              Ajuste a afinidade em <Link href={`/lojas/${loja.id}`}>Modelos</Link> ou
              revise os modelos do plano.
            </div>
          </div>
        ) : (
          <div className="card">
            <PrecificarForm
              storeId={loja.id}
              planId={plano.id}
              modelos={modelosFmt}
              fabricantes={fabricantes}
            />
          </div>
        )}
      </main>

  );
}
