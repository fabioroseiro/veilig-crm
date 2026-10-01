import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { eq } from "drizzle-orm";
import { EditarUsuarioForm } from "./EditarUsuarioForm";
import { alternarStatusUsuario } from "./actions";
import { BotaoResetSenha } from "./BotaoResetSenha";
import { BotaoAcao } from "@/components/BotaoAcao";

export const dynamic = "force-dynamic";

const NIVEL: Record<string, number> = {
  veilig_admin: 4,
  group_admin: 3,
  store_manager: 2,
  store_admin: 1,
};

function podeGerenciar(ator: any, alvo: any): boolean {
  if (ator.userId && ator.userId === alvo.id) return false;
  if ((NIVEL[ator.role] ?? 0) <= (NIVEL[alvo.role] ?? 0)) return false;
  if (ator.role === "veilig_admin") return true;
  if (ator.role === "group_admin") return alvo.groupId === ator.groupId;
  if (ator.role === "store_manager") return alvo.storeId === ator.storeId;
  return false;
}

async function getDados(id: string) {
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: schema.appUsers.id,
        nome: schema.appUsers.nome,
        email: schema.appUsers.email,
        role: schema.appUsers.role,
        groupId: schema.appUsers.groupId,
        storeId: schema.appUsers.storeId,
        status: schema.appUsers.status,
      })
      .from(schema.appUsers)
      .where(eq(schema.appUsers.id, id))
      .limit(1);
    const alvo = rows[0];
    if (!alvo) return null;

    const lojas = await tx
      .select({
        id: schema.stores.id,
        nomeFantasia: schema.stores.nomeFantasia,
        groupId: schema.stores.groupId,
      })
      .from(schema.stores);

    return { alvo, lojas: lojas.map((l) => ({ id: l.id, nome: l.nomeFantasia, groupId: l.groupId })) };
  });
}

// papéis que o ator pode atribuir = os estritamente abaixo dele
const TODOS_PAPEIS = [
  { valor: "group_admin", rotulo: "Admin do grupo" },
  { valor: "store_manager", rotulo: "Gestor da loja" },
  { valor: "store_admin", rotulo: "Vendedor" },
];

export default async function EditarUsuarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin" && ctx.role !== "group_admin" && ctx.role !== "store_manager") redirect("/");

  const dados = await getDados(id);
  if (!dados) notFound();

  const { alvo, lojas } = dados;
  if (!podeGerenciar(ctx, alvo)) redirect("/usuarios");

  const inativo = alvo.status === "inativo";
  const nivelAtor = NIVEL[ctx.role] ?? 0;
  const papeisDisponiveis = TODOS_PAPEIS.filter((p) => (NIVEL[p.valor] ?? 0) < nivelAtor);

  return (
      <main className="content">
        <p className="crumb" style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 6 }}>
          <Link href="/usuarios">Usuários</Link> / Editar
        </p>
        <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
          Editar usuário
          {inativo && <span className="badge badge-pending">Inativo</span>}
        </h1>
        <p className="subtitle">{alvo.email} — o e-mail não é alterado aqui.</p>

        <div className="card">
          <EditarUsuarioForm
            userId={alvo.id}
            papeisDisponiveis={papeisDisponiveis}
            lojas={lojas}
            valoresIniciais={{
              nome: alvo.nome,
              role: alvo.role,
              storeId: alvo.storeId ?? "",
            }}
          />
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-label">Ações</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <form
              action={async () => {
                "use server";
                await alternarStatusUsuario(id, inativo ? "ativo" : "inativo");
                redirect("/usuarios?editado=1");
              }}
            >
              <BotaoAcao className="btn-ghost" style={{ padding: "10px 18px" }}>
                {inativo ? "Reativar acesso" : "Inativar acesso"}
              </BotaoAcao>
            </form>
            <BotaoResetSenha userId={id} email={alvo.email} />
          </div>
          <p className="hint" style={{ marginBottom: 0 }}>
            Inativar bloqueia o login imediatamente. Resetar gera uma senha
            aleatória, exibida uma única vez — anote antes de sair da tela. O
            usuário troca no próximo acesso.
          </p>
        </div>
      </main>

  );
}
