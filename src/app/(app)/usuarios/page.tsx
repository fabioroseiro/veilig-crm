import Link from "next/link";
import { redirect } from "next/navigation";
import { BuscaInline } from "@/components/BuscaInline";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { desc, eq, and, sql, count } from "drizzle-orm";
import { Paginacao } from "@/components/Paginacao";
import { lerPaginacao, condicaoBusca, totalPaginas, POR_PAGINA } from "@/lib/paginacao";

export const dynamic = "force-dynamic";

const roleLabel: Record<string, string> = {
  veilig_admin: "Admin Veilig",
  group_admin: "Admin do grupo",
  store_manager: "Gestor da loja",
  store_admin: "Vendedor",
};

async function getUsuarios(q: string | undefined, offset: number) {
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) => {
    // IMPORTANTE: a policy app_user_login_read deixa app_user legível para o
    // login, então o RLS NÃO isola esta tabela — o filtro de tenant é nosso.
    //
    // Antes ele era feito em JavaScript, depois de carregar todos os usuários.
    // Com paginação isso viraria um vazamento: o LIMIT cortaria a lista ANTES
    // do filtro e a página poderia trazer usuários de outro grupo. Por isso o
    // filtro de tenant agora é parte do WHERE, junto com a busca.
    const tenant =
      ctx.role === "veilig_admin"
        ? undefined
        : ctx.role === "store_manager"
        ? eq(schema.appUsers.storeId, ctx.storeId!)
        : eq(schema.appUsers.groupId, ctx.groupId!);

    const busca = condicaoBusca(q, [
      sql`${schema.appUsers.nome}`,
      sql`${schema.appUsers.email}`,
      sql`${schema.appUsers.role}`,
    ]);

    const onde = tenant && busca ? and(tenant, busca) : tenant ?? busca ?? undefined;

    const totalRows = await tx.select({ n: count() }).from(schema.appUsers).where(onde);

    const linhas = await tx
      .select({
        id: schema.appUsers.id,
        nome: schema.appUsers.nome,
        email: schema.appUsers.email,
        role: schema.appUsers.role,
        groupId: schema.appUsers.groupId,
        storeId: schema.appUsers.storeId,
        precisaTrocarSenha: schema.appUsers.precisaTrocarSenha,
        status: schema.appUsers.status,
        // Um usuário de grupo ou loja inativa não consegue entrar, ainda que o
        // status dele seja 'ativo' — quem bloqueia é tenant_ativo(), no login.
        grupoStatus: sql<string | null>`(SELECT g.status FROM "group" g WHERE g.id = "app_user"."group_id")`,
        lojaStatus: sql<string | null>`(SELECT st.status FROM store st WHERE st.id = "app_user"."store_id")`,
        // Bloqueio temporário por tentativas erradas. NÃO é o status do
        // usuário: ele continua ativo, só não consegue entrar agora. Sem
        // mostrar isso, o administrador vê "ativo" enquanto a pessoa jura que
        // não consegue acessar — e não há como os dois se entenderem.
        bloqueadoAte: sql<string | null>`(
          SELECT max(la.created_at) + interval '15 minutes'
          FROM login_attempt la
          WHERE la.identificador = lower("app_user"."email")
            AND la.sucesso = false
            AND la.created_at > now() - interval '15 minutes'
          HAVING count(*) >= 5
        )`,
      })
      .from(schema.appUsers)
      .where(onde)
      .orderBy(desc(schema.appUsers.createdAt))
      .limit(POR_PAGINA)
      .offset(offset);

    return { linhas, total: Number(totalRows[0]?.n ?? 0) };
  });
}

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

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ criado?: string; editado?: string; senha_resetada?: string; q?: string; p?: string }>;
}) {
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin" && ctx.role !== "group_admin" && ctx.role !== "store_manager") redirect("/");

  const { criado, editado, senha_resetada, q, p } = await searchParams;
  const { pagina, offset } = lerPaginacao(p);
  const { linhas: usuarios, total } = await getUsuarios(q, offset);
  const paginas = totalPaginas(total);

  return (
      <main className="content">
        {criado && (
          <div className="banner banner-success">
            Usuário criado. A senha provisória foi exibida na tela de cadastro; ele
            deverá trocá-la no primeiro acesso.
          </div>
        )}
        {editado && <div className="banner banner-success">Alterações salvas.</div>}
        {senha_resetada && (
          <div className="banner banner-success">
            Senha redefinida. O usuário deverá trocá-la no próximo acesso.
          </div>
        )}

        <div className="page-head">
          <div>
            <h1>Usuários</h1>
            <p className="subtitle" style={{ margin: "6px 0 0" }}>
              Acessos ao sistema. Vendedores vendem planos; admins gerenciam.
            </p>
          </div>
          <Link href="/usuarios/nova" className="btn-link-primary">
            + Novo usuário
          </Link>
        </div>

        {(total > 0 || q) && <BuscaInline placeholder="Buscar por nome, e-mail ou papel…" />}

        {q && total === 0 ? (
          <div className="busca-vazio">Nenhum usuário encontrado para “{q}”.</div>
        ) : usuarios.length === 0 ? (
          <div className="table-wrap">
            <div className="empty">
              <h2>Nenhum usuário ainda</h2>
              <p>Crie o primeiro acesso.</p>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Papel</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => {
                  const gerenciavel = podeGerenciar(ctx, u);
                  const inativo = u.status === "inativo";
                  return (
                    <tr key={u.id} style={inativo ? { opacity: 0.55 } : undefined}>
                      <td className="store-name">
                        {u.nome}
                        {inativo && (
                          <span className="badge badge-pending" style={{ marginLeft: 8 }}>Inativo</span>
                        )}
                      </td>
                      <td>{u.email}</td>
                      <td>{roleLabel[u.role] || u.role}</td>
                      <td>
                        {inativo ? (
                          <span className="badge badge-pending">Inativo</span>
                        ) : u.grupoStatus === "inativo" || u.lojaStatus === "inativo" ? (
                          <span
                            className="badge badge-pending"
                            title="O usuário está ativo, mas o grupo ou a loja dele não. O login é bloqueado enquanto isso durar."
                          >
                            Sem acesso ({u.grupoStatus === "inativo" ? "grupo" : "loja"} inativo)
                          </span>
                        ) : (
                          <>
                            {/* Bloqueio vem primeiro: é a informação acionável
                                quando alguém liga dizendo que não entra. */}
                            {u.bloqueadoAte && (
                              <span
                                className="badge badge-error"
                                title="Bloqueio temporário por tentativas incorretas. Libera sozinho, ou resete a senha."
                              >
                                Bloqueado até{" "}
                                {new Date(u.bloqueadoAte).toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            )}
                            {!u.bloqueadoAte && u.precisaTrocarSenha && (
                              <span className="badge badge-pending">Senha provisória</span>
                            )}
                            {!u.bloqueadoAte && !u.precisaTrocarSenha && (
                              <span className="badge badge-ok">Ativo</span>
                            )}
                          </>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {gerenciavel && (
                          <Link href={`/usuarios/${u.id}/editar`} className="btn-ghost btn-sm">
                            Editar
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Paginacao pagina={pagina} totalPaginas={paginas} total={total} rotulo="usuários" />
          </div>
        )}
      </main>

  );
}
