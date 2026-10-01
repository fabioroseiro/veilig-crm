import { encerrarSessaoCliente } from "@/lib/cliente-session";
import { redirect } from "next/navigation";
import { IconeVeilig } from "@/components/IconeVeilig";

async function sair() {
  "use server";
  await encerrarSessaoCliente();
  redirect("/portal/login");
}

export function PortalHeader({ nome }: { nome: string }) {
  return (
    <header className="portal-header">
      <div className="portal-brand">
        <IconeVeilig tamanho={34} className="login-logo" />
        <span className="login-wordmark">VEILIG</span>
      </div>
      <div className="portal-user">
        <span className="portal-hello">Olá, {nome.split(" ")[0]}</span>
        {/* A tela de troca de senha existia mas só era alcançada por
            redirecionamento forçado no primeiro acesso. Quem quisesse trocar
            depois — por suspeitar que alguém viu a senha, por exemplo — não
            tinha caminho. */}
        <a href="/portal/bem-vindo" className="nav-signout" style={{ marginRight: 10 }}>
          Como funciona
        </a>
        <a href="/portal/trocar-senha" className="nav-signout" style={{ marginRight: 10 }}>
          Trocar senha
        </a>

        <form action={sair}>
          <button type="submit" className="nav-signout">Sair</button>
        </form>
      </div>
    </header>
  );
}
