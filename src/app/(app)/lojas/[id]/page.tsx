import Link from "next/link";
import { notFound } from "next/navigation";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { eq } from "drizzle-orm";
import { CATEGORIAS } from "@/lib/vehicle-model-validation";
import { AfinidadeForm } from "./AfinidadeForm";
import { alternarStatusLoja } from "./editar/actions";
import { BotaoAcao } from "@/components/BotaoAcao";

export const dynamic = "force-dynamic";

async function getDados(storeId: string) {
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) => {
    const lojaRows = await tx
      .select({
        id: schema.stores.id,
        nomeFantasia: schema.stores.nomeFantasia,
        razaoSocial: schema.stores.razaoSocial,
        groupId: schema.stores.groupId,
        status: schema.stores.status,
        walletId: schema.stores.walletId,
      })
      .from(schema.stores)
      .where(eq(schema.stores.id, storeId))
      .limit(1);

    const loja = lojaRows[0];
    if (!loja) return null;

    // afinidades atuais
    const afinidades = await tx
      .select({
        fabricante: schema.storeAffinities.fabricante,
        categoria: schema.storeAffinities.categoria,
      })
      .from(schema.storeAffinities)
      .where(eq(schema.storeAffinities.storeId, storeId));

    // fabricantes distintos do catálogo (para oferecer como opções)
    const modelos = await tx
      .select({
        fabricante: schema.vehicleModels.fabricante,
        modelo: schema.vehicleModels.modelo,
        versao: schema.vehicleModels.versao,
        categoria: schema.vehicleModels.categoria,
      })
      .from(schema.vehicleModels)
      .where(eq(schema.vehicleModels.status, "ativo"));

    return { loja, afinidades, modelos };
  });
}

export default async function LojaDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salva?: string }>;
}) {
  const { id } = await params;
  const { salva } = await searchParams;
  const dados = await getDados(id);
  if (!dados) notFound();

  const { loja, afinidades, modelos } = dados;
  const ctx = await getSessionContext();
  const podeEditar = ctx.role === "veilig_admin" || ctx.role === "group_admin";
  const inativa = loja.status === "inativo";

  // fabricantes disponíveis no catálogo
  const fabricantesCatalogo = Array.from(
    new Set(modelos.map((m) => m.fabricante))
  ).sort();

  const fabSelecionados = new Set(afinidades.map((a) => a.fabricante));
  const catSelecionadas = new Set(afinidades.map((a) => a.categoria));

  // modelos que a loja enxerga hoje = os que casam com alguma afinidade
  const paresAfinidade = new Set(
    afinidades.map((a) => `${a.fabricante}|${a.categoria}`)
  );
  const modelosVisiveis = modelos.filter((m) =>
    paresAfinidade.has(`${m.fabricante}|${m.categoria}`)
  );

  const rotuloCat = (v: string) =>
    CATEGORIAS.find((c) => c.valor === v)?.rotulo ?? v;

  return (
      <main className="content">
        <p
          className="crumb"
          style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 6 }}
        >
          <Link href="/lojas">Lojas</Link> / {loja.nomeFantasia}
        </p>

        {salva && (
          <div className="banner banner-success">Alterações salvas com sucesso.</div>
        )}

        <div className="page-head">
          <div>
            <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {loja.nomeFantasia}
              {inativa && <span className="badge badge-pending">Inativa</span>}
            </h1>
            <p className="subtitle" style={{ margin: "6px 0 0" }}>{loja.razaoSocial}</p>
          </div>
          {podeEditar && (
            <div style={{ display: "flex", gap: 10 }}>
              <Link href={`/lojas/${id}/planos`} className="btn-link-primary">
                Planos e preços
              </Link>
              <Link href={`/lojas/${id}/editar`} className="btn-link-primary">
                Editar
              </Link>
              <form
                action={async () => {
                  "use server";
                  await alternarStatusLoja(id, inativa ? "ativo" : "inativo");
                }}
              >
                <BotaoAcao className="btn-ghost" style={{ padding: "10px 18px" }}>
                  {inativa ? "Reativar" : "Inativar"}
                </BotaoAcao>
              </form>
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="section-label">Afinidade com o catálogo</div>
          <p className="hint" style={{ marginTop: 0, marginBottom: 16 }}>
            Escolha os fabricantes e as categorias que esta loja atende. Ela
            passará a enxergar automaticamente os modelos correspondentes do
            catálogo central — inclusive novos lançamentos.
          </p>

          {fabricantesCatalogo.length === 0 ? (
            <div className="banner banner-error">
              O catálogo de modelos está vazio. A Veilig precisa cadastrar
              modelos antes de definir afinidades.
            </div>
          ) : (
            <AfinidadeForm
              storeId={loja.id}
              fabricantes={fabricantesCatalogo}
              categorias={CATEGORIAS.map((c) => ({ valor: c.valor, rotulo: c.rotulo }))}
              fabSelecionados={Array.from(fabSelecionados)}
              catSelecionadas={Array.from(catSelecionadas)}
            />
          )}
        </div>

        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th>Modelos que esta loja enxerga</th>
                <th>Categoria</th>
              </tr>
            </thead>
            <tbody>
              {modelosVisiveis.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ color: "var(--ink-soft)" }}>
                    Nenhum modelo ainda — defina as afinidades acima.
                  </td>
                </tr>
              ) : (
                modelosVisiveis.map((m, i) => (
                  <tr key={i}>
                    <td className="store-name">
                      {m.fabricante} {m.modelo}
                      {m.versao ? ` ${m.versao}` : ""}
                    </td>
                    <td>{rotuloCat(m.categoria)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

  );
}
