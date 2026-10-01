import Link from "next/link";
import { redirect } from "next/navigation";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { eq, sql } from "drizzle-orm";
import { ClienteForm } from "./ClienteForm";

export const dynamic = "force-dynamic";

// A tela de venda foi INVERTIDA. Antes o vendedor escolhia um "modelo com plano"
// que já trazia o ano embutido — e o ano do veículo do cliente acabava sendo o
// que o catálogo dizia, não o que estava no documento.
//
// Agora: o vendedor descreve o veículo (fabricante → modelo/versão → ano) e o
// sistema mostra quais planos servem para AQUELE veículo, com o preço já
// ajustado pela faixa de idade e a carência calculada.
//
// Isso também corrige um problema silencioso: se dois planos da loja cobrissem
// o mesmo modelo, o código antigo pegava um deles arbitrariamente. Agora quem
// escolhe é o vendedor.
async function getDados() {
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) => {
    let lojasAlvo: { id: string; nome: string }[] = [];
    if (ctx.role === "store_admin") {
      if (ctx.storeId) {
        lojasAlvo = await tx
          .select({ id: schema.stores.id, nome: schema.stores.nomeFantasia })
          .from(schema.stores)
          .where(eq(schema.stores.id, ctx.storeId))
          .limit(1);
      }
    } else {
      lojasAlvo = await tx
        .select({ id: schema.stores.id, nome: schema.stores.nomeFantasia })
        .from(schema.stores);
    }

    // Ofertas: cada combinação (loja, modelo, plano) que tem preço cadastrado.
    // Traz junto a política do plano, para a tela calcular carência e preço sem
    // uma segunda ida ao servidor a cada tecla.
    const ofertas = await tx
      .select({
        storeId: schema.storePlans.storeId,
        modelId: schema.vehicleModels.id,
        fabricante: schema.vehicleModels.fabricante,
        modelo: schema.vehicleModels.modelo,
        versao: schema.vehicleModels.versao,
        categoria: schema.vehicleModels.categoria,
        preco: schema.storePlanPrices.preco,
        planId: schema.storePlans.planId,
        planoNome: schema.plans.nome,
        planoDescricao: schema.plans.descricao,
        aceitaZeroKm: schema.plans.aceitaZeroKm,
        idadeMaximaAnos: schema.plans.idadeMaximaAnos,
        carenciaZeroKm: schema.plans.carenciaZeroKm,
        carenciaAte2Anos: schema.plans.carenciaAte2Anos,
        carencia3a5Anos: schema.plans.carencia3a5Anos,
        carencia6Mais: schema.plans.carencia6Mais,
        acrescimoAte2Anos: schema.plans.acrescimoAte2Anos,
        acrescimo3a5Anos: schema.plans.acrescimo3a5Anos,
        acrescimo6Mais: schema.plans.acrescimo6Mais,
      })
      .from(schema.storePlanPrices)
      .innerJoin(
        schema.storePlans,
        eq(schema.storePlanPrices.storePlanId, schema.storePlans.id)
      )
      .innerJoin(
        schema.vehicleModels,
        eq(schema.storePlanPrices.vehicleModelId, schema.vehicleModels.id)
      )
      .innerJoin(schema.plans, eq(schema.storePlans.planId, schema.plans.id))
      // Plano inativado pelo grupo não pode mais ser VENDIDO. Quem já assinou
      // continua normalmente — o cliente contratou aquele plano.
      .where(eq(schema.plans.status, "ativo"));

    const porLoja: Record<string, any[]> = {};
    for (const o of ofertas) {
      (porLoja[o.storeId] ||= []).push({
        modelId: o.modelId,
        fabricante: o.fabricante,
        modeloLabel: `${o.modelo}${o.versao ? " " + o.versao : ""}`,
        categoria: o.categoria,
        precoBase: Number(o.preco),
        planId: o.planId,
        planoNome: o.planoNome,
        planoDescricao: o.planoDescricao,
        politica: {
          aceitaZeroKm: o.aceitaZeroKm,
          idadeMaximaAnos: o.idadeMaximaAnos,
          carenciaZeroKm: o.carenciaZeroKm,
          carenciaAte2Anos: o.carenciaAte2Anos,
          carencia3a5Anos: o.carencia3a5Anos,
          carencia6Mais: o.carencia6Mais,
          acrescimoAte2Anos: Number(o.acrescimoAte2Anos),
          acrescimo3a5Anos: Number(o.acrescimo3a5Anos),
          acrescimo6Mais: Number(o.acrescimo6Mais),
        },
      });
    }

    return {
      lojas: lojasAlvo,
      porLoja,
      isVendedor: ctx.role === "store_admin",
      storeIdVendedor: ctx.storeId ?? null,
    };
  });
}

export default async function NovoClientePage() {
  const ctx = await getSessionContext();
  if (!["veilig_admin", "group_admin", "store_manager", "store_admin"].includes(ctx.role))
    redirect("/");

  const { lojas, porLoja, isVendedor, storeIdVendedor } = await getDados();
  const temAlgum = Object.values(porLoja).some((arr) => arr.length > 0);

  // Vendedores por loja, para a migração indicar quem vendeu. Só a Veilig usa,
  // então nem carregamos para os demais.
  const vendedoresPorLoja: Record<string, { id: string; nome: string }[]> = {};
  if (ctx.role === "veilig_admin") {
    try {
      const rv = await withTenant(ctx, async (tx) =>
        tx.execute(sql`
          SELECT u.id, u.nome, u.store_id
          FROM app_user u
          WHERE u.role = 'store_admin' AND u.status = 'ativo'
          ORDER BY u.nome
        `)
      );
      for (const v of (Array.isArray(rv) ? rv : (rv as any).rows) as any[]) {
        (vendedoresPorLoja[v.store_id] ??= []).push({ id: v.id, nome: v.nome });
      }
    } catch (e: any) {
      console.error("[VENDA] falha ao carregar vendedores:", e?.message);
    }
  }

  return (
    <main className="content">
      <p className="crumb" style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 6 }}>
        <Link href="/clientes">Clientes</Link> / Novo cliente
      </p>
      <h1>Cadastrar cliente</h1>
      <p className="subtitle">
        Descreva o veículo do cliente e o sistema mostra os planos disponíveis,
        com preço e carência já calculados.
      </p>

      {!temAlgum ? (
        <div className="card">
          <div className="banner banner-error" style={{ marginBottom: 0 }}>
            Nenhum modelo tem plano precificado {isVendedor ? "nesta loja" : "nas lojas"}{" "}
            ainda. Defina preços em Lojas → Planos antes de vender.
          </div>
        </div>
      ) : (
        <div className="card">
          <ClienteForm
            lojas={lojas}
            porLoja={porLoja}
            isVendedor={isVendedor}
            storeIdVendedor={storeIdVendedor}
            isVeilig={ctx.role === "veilig_admin"}
            vendedoresPorLoja={vendedoresPorLoja}
          />
        </div>
      )}
    </main>
  );
}
