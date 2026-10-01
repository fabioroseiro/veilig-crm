import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ModeloForm } from "../../ModeloForm";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { eq } from "drizzle-orm";
import { editarModelo, alternarStatusModelo, type FormState } from "../../actions";
import { BotaoAcao } from "@/components/BotaoAcao";

export const dynamic = "force-dynamic";

async function getModelo(id: string) {
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) => {
    const rows = await tx.select().from(schema.vehicleModels).where(eq(schema.vehicleModels.id, id)).limit(1);
    return rows[0] ?? null;
  });
}

export default async function EditarModeloPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin") redirect("/");

  const m = await getModelo(id);
  if (!m) notFound();

  const inativo = m.status === "inativo";

  const acao = editarModelo.bind(null, id) as (prev: FormState, fd: FormData) => Promise<FormState>;

  return (
      <main className="content">
        <p className="crumb" style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 6 }}>
          <Link href="/modelos">Modelos</Link> / Editar
        </p>
        <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
          Editar modelo
          {inativo && <span className="badge badge-pending">Inativo</span>}
        </h1>
        <p className="subtitle">Corrija os dados do modelo. A combinação fabricante + modelo + versão deve ser única.</p>

        <ModeloForm
          valoresIniciais={{
            fabricante: m.fabricante,
            modelo: m.modelo,
            versao: m.versao ?? "",
            categoria: m.categoria,
          }}
          acaoCustomizada={acao}
          textoBotao="Salvar alterações"
          titulo="Dados do modelo"
        />

        <div className="card">
          <div className="section-label">Situação do modelo</div>
          <p className="hint" style={{ marginTop: 0 }}>
            {inativo
              ? "Este modelo está inativo e não aparece para novos cadastros. Reative para voltar a usá-lo."
              : "Inativar oculta o modelo dos novos cadastros sem apagar o histórico. Precificações e assinaturas existentes não são afetadas."}
          </p>
          <form
            action={async () => {
              "use server";
              await alternarStatusModelo(id, inativo ? "ativo" : "inativo");
              redirect("/modelos");
            }}
          >
            <BotaoAcao className="btn-ghost" style={{ padding: "10px 18px" }}>
              {inativo ? "Reativar modelo" : "Inativar modelo"}
            </BotaoAcao>
          </form>
        </div>
      </main>

  );
}
