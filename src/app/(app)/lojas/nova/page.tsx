import { LojaForm } from "./LojaForm";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Fabricantes vêm do catálogo de modelos (distintos). Grupos, só para a Veilig.
async function getDados() {
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) => {
    const modelos = await tx
      .select({ fabricante: schema.vehicleModels.fabricante })
      .from(schema.vehicleModels)
      .where(eq(schema.vehicleModels.status, "ativo"));

    const fabricantes = Array.from(
      new Set(modelos.map((m) => m.fabricante))
    ).sort();

    let grupos: { id: string; nome: string }[] = [];
    if (ctx.role === "veilig_admin") {
      const gs = await tx
        .select({
          id: schema.groups.id,
          razaoSocial: schema.groups.razaoSocial,
          nomeFantasia: schema.groups.nomeFantasia,
        })
        .from(schema.groups)
        .where(eq(schema.groups.status, "ativo"));
      grupos = gs.map((g) => ({ id: g.id, nome: g.nomeFantasia || g.razaoSocial }));
    }

    return { fabricantes, grupos, isVeilig: ctx.role === "veilig_admin" };
  });
}

export default async function NovaLojaPage() {
  const { fabricantes, grupos, isVeilig } = await getDados();

  return (
      <main className="content">
        <p className="crumb" style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 6 }}>
          <a href="/lojas">Lojas</a> / Nova loja
        </p>
        <h1>Cadastrar loja</h1>
        <p className="subtitle">
          Uma loja pertence a um grupo e representa um fabricante. Informe os dados
          e o walletId da conta Asaas dela.
        </p>

        {fabricantes.length === 0 ? (
          <div className="card">
            <div className="banner banner-error" style={{ marginBottom: 0 }}>
              Não há fabricantes disponíveis. Cadastre modelos no catálogo primeiro
              (o fabricante da loja vem de lá).
            </div>
          </div>
        ) : isVeilig && grupos.length === 0 ? (
          <div className="card">
            <div className="banner banner-error" style={{ marginBottom: 0 }}>
              Nenhum grupo cadastrado. Cadastre um grupo antes de criar lojas.
            </div>
          </div>
        ) : (
          <div className="card">
            <LojaForm
              fabricantes={fabricantes}
              grupos={isVeilig ? grupos : null}
            />
          </div>
        )}
      </main>

  );
}
