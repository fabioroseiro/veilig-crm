import { auth, signOut } from "@/lib/auth";
import { SidebarNav } from "@/components/SidebarNav";
import { getSessionContext } from "@/lib/session";

// Server component: lê a sessão e delega a navegação ao SidebarNav (client),
// que destaca o item ativo pela URL e não remonta a cada clique.
//
// O PAPEL vem do contexto efetivo, não do login: no modo "ver como", o menu
// precisa ser o do papel visualizado — senão a Veilig veria itens que aquele
// usuário não vê. O NOME continua sendo o de quem está logado.
export async function Sidebar() {
  const session = await auth();
  const user = session?.user as { name?: string | null; role?: string } | undefined;
  const ctx = await getSessionContext().catch(() => null);

  async function sair() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <SidebarNav
      role={ctx?.role || user?.role || ""}
      nome={user?.name || "Usuário"}
      sair={sair}
      verComo={ctx?.verComo ?? null}
    />
  );
}
