import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { eq } from "drizzle-orm";
import { PlanoForm } from "../../nova/PlanoForm";
import { getModelosDoGrupo } from "@/lib/modelos-do-grupo";
import { editarPlano } from "./actions";

export const dynamic = "force-dynamic";

export default async function EditarPlanoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin" && ctx.role !== "group_admin") redirect("/planos");

  const dados = await withTenant(ctx, async (tx) => {
    const rows = await tx
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.id, id))
      .limit(1);
    if (!rows[0]) return null;

    const vinculos = await tx
      .select({
        vehicleModelId: schema.planModels.vehicleModelId,
        precoMinimo: schema.planModels.precoMinimo,
        fatorCusto: schema.planModels.fatorCusto,
      })
      .from(schema.planModels)
      .where(eq(schema.planModels.planId, id));

    const revs = await tx
      .select()
      .from(schema.planRevisoes)
      .where(eq(schema.planRevisoes.planId, id))
      .orderBy(schema.planRevisoes.ordem);

    const bens = await tx
      .select()
      .from(schema.planBeneficios)
      .where(eq(schema.planBeneficios.planId, id))
      .orderBy(schema.planBeneficios.ordem);

    const args = await tx
      .select()
      .from(schema.planArgumentos)
      .where(eq(schema.planArgumentos.planId, id))
      .orderBy(schema.planArgumentos.ordem);

    return {
      plano: rows[0],
      modelos: vinculos.map((v) => ({
        id: v.vehicleModelId,
        precoMinimo: Number(v.precoMinimo).toFixed(2).replace(".", ","),
        fatorCusto: Number(v.fatorCusto).toFixed(2).replace(".", ","),
      })),
      argumentos: args.map((a) => ({ titulo: a.titulo, texto: a.texto })),
      beneficios: bens.map((b) => ({
        nome: b.nome,
        descricao: b.descricao,
        horasAno: b.horasAno === null ? "" : String(Number(b.horasAno)).replace(".", ","),
        custoHora: b.custoHora === null ? "" : Number(b.custoHora).toFixed(2).replace(".", ","),
        custoAnoEstimado:
          b.custoAnoEstimado === null ? "" : Number(b.custoAnoEstimado).toFixed(2).replace(".", ","),
      })),
      revisoes: revs.map((r) => ({
        nome: r.nome,
        km: r.km === null ? "" : String(r.km),
        meses: r.meses === null ? "" : String(r.meses),
        recorrente: r.recorrente,
        incluiPecas: r.incluiPecas,
        incluiMaoObra: r.incluiMaoObra,
        custoPecas: Number(r.custoPecas).toFixed(2).replace(".", ","),
        custoMaoObra: Number(r.custoMaoObra).toFixed(2).replace(".", ","),
      })),
    };
  });

  if (!dados) notFound();
  const p = dados.plano;
  // O formulário espera o label já montado, como na tela de criação.
  const modelos = (await getModelosDoGrupo()).map((m) => ({
    ...m,
    label: `${m.fabricante} ${m.modelo}${m.versao ? " " + m.versao : ""}`,
  }));

  const valoresIniciais: Record<string, string> = {
    nome: p.nome,
    descricao: p.descricao ?? "",
    aceitaZeroKm: p.aceitaZeroKm ? "on" : "",
    idadeMaximaAnos: String(p.idadeMaximaAnos),
    carenciaZeroKm: String(p.carenciaZeroKm),
    carenciaAte2Anos: String(p.carenciaAte2Anos),
    carencia3a5Anos: String(p.carencia3a5Anos),
    carencia6Mais: String(p.carencia6Mais),
    acrescimoAte2Anos: String(Number(p.acrescimoAte2Anos)).replace(".", ","),
    acrescimo3a5Anos: String(Number(p.acrescimo3a5Anos)).replace(".", ","),
    acrescimo6Mais: String(Number(p.acrescimo6Mais)).replace(".", ","),
    limiteRevisoesAno: p.limiteRevisoesAno === null ? "" : String(p.limiteRevisoesAno),
    limiteKmAno: p.limiteKmAno === null ? "" : String(p.limiteKmAno),
    limiteValorPecasAno: p.limiteValorPecasAno === null ? "" : Number(p.limiteValorPecasAno).toFixed(2).replace(".", ","),
    limiteValorMaoObraAno: p.limiteValorMaoObraAno === null ? "" : Number(p.limiteValorMaoObraAno).toFixed(2).replace(".", ","),
    limiteValorTotalAno: p.limiteValorTotalAno === null ? "" : Number(p.limiteValorTotalAno).toFixed(2).replace(".", ","),
    exclusoes: p.exclusoes ?? "",
    condicoes: p.condicoes ?? "",
    precoPeloGrupo: p.precoPeloGrupo ? "on" : "",
  };


  const action = editarPlano.bind(null, id);

  return (
    <main className="content">
      <p className="crumb" style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 6 }}>
        <Link href="/planos">Planos</Link> / {p.nome}
      </p>
      <h1>Editar plano</h1>
      <p className="subtitle">
        Alterações valem para vendas <strong>novas</strong>. Quem já assinou mantém
        o preço e a carência que foram congelados na venda dele.
      </p>

      <div className="card">
        <PlanoForm
          modelos={modelos}
          grupos={null}
          action={action}
          valoresIniciais={valoresIniciais}
          modelosIniciais={dados.modelos}
          revisoesIniciais={dados.revisoes}
          beneficiosIniciais={dados.beneficios}
          argumentosIniciais={dados.argumentos}
          rotuloBotao="Salvar alterações"
         
        />
      </div>
    </main>
  );
}
