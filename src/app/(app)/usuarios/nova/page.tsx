import Link from "next/link";
import { redirect } from "next/navigation";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { eq } from "drizzle-orm";
import { UsuarioForm } from "./UsuarioForm";

export const dynamic = "force-dynamic";

async function getDados() {
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) => {
    const grupos = await tx
      .select({
        id: schema.groups.id,
        razaoSocial: schema.groups.razaoSocial,
        nomeFantasia: schema.groups.nomeFantasia,
      })
      .from(schema.groups)
      .where(eq(schema.groups.status, "ativo"));

    const lojas = await tx
      .select({
        id: schema.stores.id,
        nomeFantasia: schema.stores.nomeFantasia,
        groupId: schema.stores.groupId,
      })
      .from(schema.stores);

    return {
      grupos: grupos.map((g) => ({ id: g.id, nome: g.nomeFantasia || g.razaoSocial })),
      lojas: lojas.map((l) => ({ id: l.id, nome: l.nomeFantasia, groupId: l.groupId })),
    };
  });
}

export default async function NovoUsuarioPage() {
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin" && ctx.role !== "group_admin" && ctx.role !== "store_manager") redirect("/");

  const { grupos, lojas } = await getDados();

  return (
      <main className="content">
        <p className="crumb" style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 6 }}>
          <Link href="/usuarios">Usuários</Link> / Novo usuário
        </p>
        <h1>Criar usuário</h1>
        <p className="subtitle">
          Uma senha provisória aleatória será gerada e exibida uma única vez. No primeiro acesso,
          o usuário é obrigado a trocá-la.
        </p>

        <div className="card">
          <UsuarioForm
            isVeilig={ctx.role === "veilig_admin"}
            papel={ctx.role}
            grupos={grupos}
            lojas={lojas}
          />
        </div>
      </main>

  );
}
