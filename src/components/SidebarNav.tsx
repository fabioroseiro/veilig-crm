"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IconeVeilig } from "@/components/IconeVeilig";

const roleLabel: Record<string, string> = {
  veilig_admin: "Administração Veilig",
  group_admin: "Administração do grupo",
  store_manager: "Gestor da loja",
  store_admin: "Vendedor",
};

// Navegação da sidebar. Client component: destaca o item ativo pela URL atual
// (usePathname), então NÃO remonta a cada navegação — vive no layout compartilhado.
export function SidebarNav({
  role,
  nome,
  sair,
  verComo = null,
}: {
  role: string;
  nome: string;
  sair: () => Promise<void>;
  /** Modo "ver como" ativo: o menu é o do papel visualizado. */
  verComo?: { papel: string; nome: string } | null;
}) {
  const pathname = usePathname() || "/";

  const [aberto, setAberto] = useState(false);
  const [ehCelular, setEhCelular] = useState(false);

  // Descobre o tamanho no CLIENTE. No servidor não existe janela, e assumir um
  // dos dois casos faria o menu piscar na primeira renderização.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const aplicar = () => setEhCelular(mq.matches);
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);

  // Fecha ao navegar: sem isto, o menu ficaria aberto por cima da tela nova e
  // a pessoa teria que fechá-lo a cada clique.
  useEffect(() => {
    setAberto(false);
  }, [pathname]);

  const isVeilig = role === "veilig_admin";
  const isGestor = role === "veilig_admin" || role === "group_admin";
  const isGestorLoja = role === "store_manager";

  // Marca ativo: home só na raiz exata; demais por prefixo da rota.
  //
  // Exceção: a tela de precificação mora em /lojas/[id]/planos, então pelo
  // prefixo ela acenderia "Lojas" — mas o usuário chegou ali por "Preços" e é
  // isso que ele espera ver marcado.
  const precificando = /^\/lojas\/[^/]+\/planos/.test(pathname);

  const ativo = (href: string) => {
    if (precificando) return href === "/precos" ? "nav-item active" : "nav-item";
    const aqui = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
    return aqui ? "nav-item active" : "nav-item";
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-topo">
        <div className="sidebar-brand">
          <IconeVeilig tamanho={34} className="sidebar-logo" />
          <span className="sidebar-wordmark">VEILIG</span>
        </div>

        {/* Só aparece no celular (CSS). aria-expanded e aria-controls fazem o
            leitor de tela anunciar o estado — sem eles, o botão seria só três
            barras sem significado. */}
        <button
          type="button"
          className="botao-menu"
          aria-label={aberto ? "Fechar menu" : "Abrir menu"}
          aria-expanded={aberto}
          aria-controls="menu-lateral"
          onClick={() => setAberto((a) => !a)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {/* No desktop o hidden nunca vale: o CSS só o aplica abaixo de 720px. */}
      <div className="sidebar-itens" id="menu-lateral" hidden={!aberto && ehCelular}>
      <Link href="/" className={ativo("/")}>
        Painel
      </Link>
      {isVeilig && (
        <Link href="/grupos" className={ativo("/grupos")}>
          Grupos
        </Link>
      )}
      {isGestor && (
        <Link href="/lojas" className={ativo("/lojas")}>
          Lojas
        </Link>
      )}
      {role === "group_admin" && (
        <Link href="/desempenho" className={ativo("/desempenho")} data-tour="menu-desempenho">
          Desempenho
        </Link>
      )}
      {isGestor && (
        <Link href="/reajustes" className={ativo("/reajustes")}>
          Reajustes
        </Link>
      )}
      {isGestor && (
        <Link href="/comissoes" className={ativo("/comissoes")} data-tour="menu-comissoes">
          Comissões
        </Link>
      )}
      {isVeilig && (
        <Link href="/ver-como" className={ativo("/ver-como")}>
          Ver como
        </Link>
      )}

      {isGestor && (
        <Link href="/integracoes" className={ativo("/integracoes")} data-tour="menu-integracoes">
          Integrações
        </Link>
      )}
      {isVeilig && (
        <Link href="/modelos" className={ativo("/modelos")}>
          Modelos
        </Link>
      )}
      {/* Planos visível para TODOS os papéis, inclusive o vendedor.
          Quem vende precisa consultar o que está vendendo — e, principalmente,
          mostrar a minuta do contrato quando o cliente pede para ler antes de
          fechar. Sem isto, o vendedor não tinha caminho nenhum até o documento.
          A edição continua restrita a Veilig e grupo. */}
      <Link href="/planos" className={ativo("/planos")} data-tour="menu-planos">
        Planos
      </Link>
      {(isGestor || isGestorLoja) && (
        <Link href="/precos" className={ativo("/precos")} data-tour="menu-precos">
          Preços
        </Link>
      )}
      {/* Só quem decide. O vendedor pede pela tela de venda. */}
      {(isGestor || isGestorLoja) && (
        <Link href="/isencoes" className={ativo("/isencoes")} data-tour="menu-isencoes">
          Isenções
        </Link>
      )}
      <Link href="/clientes" className={ativo("/clientes")} data-tour="menu-clientes">
        Clientes
      </Link>
      {isGestorLoja && (
        <Link href="/vendas" className={ativo("/vendas")} data-tour="menu-vendas">
          Vendas por vendedor
        </Link>
      )}
      {(isGestor || isGestorLoja) && (
        <Link href="/usuarios" className={ativo("/usuarios")} data-tour="menu-usuarios">
          Usuários
        </Link>
      )}

      <div className="nav-spacer" />

      <div className="nav-user">
        <div className="name">{nome || "Usuário"}</div>
        <div className="role">
          {verComo ? `vendo como ${verComo.papel}` : roleLabel[role] || ""}
        </div>
        <ThemeToggle />
        {/* No modo "ver como", ações de servidor são recusadas — inclusive o
            logout. Então o botão vira a saída do modo, que é um link comum. */}
        {verComo ? (
          <a href="/api/ver-como/sair" className="nav-signout" style={{ display: "block", textAlign: "center" }}>
            Sair do modo ver como
          </a>
        ) : (
          <form action={sair}>
            <button type="submit" className="nav-signout">
              Sair
            </button>
          </form>
        )}
      </div>
      </div>
    </aside>
  );
}
