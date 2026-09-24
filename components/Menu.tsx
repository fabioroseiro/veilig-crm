"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  { href: "/hoje", nome: "Hoje" },
  { href: "/funil", nome: "Funil" },
  { href: "/grupos/novo", nome: "Novo lead" },
  { href: "/importar", nome: "Importar" },
  { href: "/config", nome: "Configurações" },
];

export function Menu() {
  const p = usePathname();
  return (
    <>
      {ITENS.map((i) => (
        <Link key={i.href} href={i.href} className="item" aria-current={p === i.href || (i.href === "/funil" && p.startsWith("/grupos/") && p !== "/grupos/novo") ? "page" : undefined}>{i.nome}</Link>
      ))}
    </>
  );
}
