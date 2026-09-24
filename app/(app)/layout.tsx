import Link from "next/link";
import { exigirUsuario } from "@/lib/auth";
import { sair } from "@/lib/acoes";
import { Menu } from "@/components/Menu";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const u = await exigirUsuario();
  return (
    <div className="app">
      <nav className="lateral" aria-label="Menu">
        <Link href="/hoje" className="marca"><img src="/logo.png" alt="" /><span>VEILIG<small>CRM</small></span></Link>
        <Menu />
        <div className="rodape">
          <div>{u.nome}</div>
          <form action={sair}><button type="submit">Sair</button></form>
        </div>
      </nav>
      <main className="principal">{children}</main>
    </div>
  );
}
