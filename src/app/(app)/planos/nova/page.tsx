import Link from "next/link";
import { withTenant, schema } from "@/db";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/session";
import { eq } from "drizzle-orm";
import { CATEGORIAS } from "@/lib/vehicle-model-validation";
import { PlanoForm } from "./PlanoForm";
import { getModelosDoGrupo } from "@/lib/modelos-do-grupo";

export const dynamic = "force-dynamic";

// Modelos disponíveis para o grupo = os que casam com a afinidade de alguma
// loja do grupo (união das afinidades). Sem afinidade → lista vazia.
// Para a Veilig (sem grupo), mostramos todos os modelos ativos do catálogo.
async function getGruposParaVeilig() {
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin") return [];
  return withTenant(ctx, async (tx) => {
    return tx
      .select({
        id: schema.groups.id,
        razaoSocial: schema.groups.razaoSocial,
        nomeFantasia: schema.groups.nomeFantasia,
      })
      .from(schema.groups)
      .where(eq(schema.groups.status, "ativo"));
  });
}

export default async function NovoPlanoPage() {
  // Terceiro nível: a action já recusa, mas deixar a tela abrir dá a impressão
  // de que a operação é possível — e a pessoa preenche tudo para receber um
  // erro no fim.
  const ctxPagina = await getSessionContext();
  if (ctxPagina.role !== "veilig_admin" && ctxPagina.role !== "group_admin") {
    redirect("/planos");
  }

  const ctx = await getSessionContext();
  const modelos = await getModelosDoGrupo();

  const grupos = await getGruposParaVeilig();
  const isVeilig = ctx.role === "veilig_admin";

  const rotuloCat = (v: string) =>
    CATEGORIAS.find((c) => c.valor === v)?.rotulo ?? v;

  const modelosFmt = modelos.map((m) => ({
    id: m.id,
    label: `${m.fabricante} ${m.modelo}${m.versao ? " " + m.versao : ""}`,
    fabricante: m.fabricante,
    categoria: rotuloCat(m.categoria),
    // Valor bruto além do rótulo: é ele que escolhe o tom dos cenários de
    // venda sugeridos (moto, carro, frota).
    categoriaValor: m.categoria,
  }));

  const gruposFmt = grupos.map((g) => ({
    id: g.id,
    nome: g.nomeFantasia || g.razaoSocial,
  }));

  return (
      <main className="content">
        <p
          className="crumb"
          style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 6 }}
        >
          <Link href="/planos">Planos</Link> / Novo plano
        </p>
        <h1>Criar plano</h1>
        <p className="subtitle">
          Defina o plano, o preço padrão sugerido e quais modelos ele cobre.
        </p>

        {modelosFmt.length === 0 ? (
          <div className="card">
            <div className="banner banner-error" style={{ marginBottom: 0 }}>
              Nenhum modelo disponível. {isVeilig
                ? "Cadastre modelos no catálogo primeiro."
                : "Configure primeiro as afinidades das lojas (fabricantes e categorias que elas atendem) para que os modelos do catálogo fiquem disponíveis aqui."}
            </div>
          </div>
        ) : isVeilig && gruposFmt.length === 0 ? (
          <div className="card">
            <div className="banner banner-error" style={{ marginBottom: 0 }}>
              Nenhum grupo cadastrado. Cadastre um grupo antes de criar planos.
            </div>
          </div>
        ) : (
          <div className="card">
            <PlanoForm modelos={modelosFmt} grupos={isVeilig ? gruposFmt : null} />
          </div>
        )}
      </main>

  );
}
