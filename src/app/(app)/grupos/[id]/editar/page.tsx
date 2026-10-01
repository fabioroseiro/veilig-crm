import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { GrupoForm } from "../../nova/GrupoForm";
import { editarGrupo, resumoDoGrupo } from "./actions";
import { BotaoStatusGrupo } from "./BotaoStatusGrupo";

export const dynamic = "force-dynamic";

export default async function EditarGrupoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin") redirect("/grupos");

  const grupo = await withTenant(ctx, async (tx) => {
    const rows = await tx
      .select()
      .from(schema.groups)
      .where(eq(schema.groups.id, id))
      .limit(1);
    return rows[0] ?? null;
  });

  if (!grupo) notFound();

  const resumo = await resumoDoGrupo(id);
  const inativo = grupo.status === "inativo";

  const valoresIniciais: Record<string, string> = {
    razaoSocial: grupo.razaoSocial,
    nomeFantasia: grupo.nomeFantasia ?? "",
    cnpj: grupo.cnpj ?? "",
    responsavelNome: grupo.responsavelNome,
    responsavelEmail: grupo.responsavelEmail,
    telefone: grupo.telefone ?? "",
    feePercent: Number(grupo.feePercentPadrao).toFixed(2).replace(".", ","),
    multaPercent: Number(grupo.multaPercent).toFixed(2).replace(".", ","),
    jurosMesPercent: Number(grupo.jurosMesPercent).toFixed(2).replace(".", ","),
    diasCancelamento: String(grupo.diasCancelamento),
    apuracaoDiaInicio: String(grupo.apuracaoDiaInicio ?? 1),
    apuracaoDiaFim: String(grupo.apuracaoDiaFim ?? 31),
    indiceReajuste: grupo.indiceReajuste,
    tetoReajustePercent:
      grupo.tetoReajustePercent === null
        ? ""
        : Number(grupo.tetoReajustePercent).toFixed(2).replace(".", ","),
  };

  return (
    <main className="content">
      <p className="crumb" style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 6 }}>
        <Link href="/grupos">Grupos</Link> / {grupo.nomeFantasia || grupo.razaoSocial}
      </p>
      <h1>
        Editar grupo
        {inativo && (
          <span className="badge badge-pending" style={{ marginLeft: 10, fontSize: 13 }}>
            Inativo
          </span>
        )}
      </h1>
      <p className="subtitle">
        O <strong>fee padrão</strong> vale para as lojas do grupo que não tenham
        percentual próprio. Alterá-lo não muda as assinaturas já vendidas.
      </p>

      {resumo && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="section-label">O grupo hoje</div>
          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-num">{resumo.lojas}</div>
              <div className="stat-label">Lojas ativas</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{resumo.usuarios}</div>
              <div className="stat-label">Usuários ativos</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{resumo.assinaturas}</div>
              <div className="stat-label">Assinaturas vigentes</div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <GrupoForm
          action={editarGrupo.bind(null, id)}
          valoresIniciais={valoresIniciais}
          rotuloBotao="Salvar alterações"
        />
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="section-label">Acesso do grupo</div>
        <BotaoStatusGrupo
          groupId={id}
          inativo={inativo}
          usuarios={resumo?.usuarios ?? 0}
          assinaturas={resumo?.assinaturas ?? 0}
        />
      </div>
    </main>
  );
}
