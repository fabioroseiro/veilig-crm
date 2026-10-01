"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Barra de progresso no topo, mostrada durante a navegação entre telas.
// Aparece assim que o usuário clica num link e some quando a nova tela chega.
// Cobre o sistema inteiro de uma vez (não precisa mexer tela a tela).
export function NavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visivel, setVisivel] = useState(false);
  const [largura, setLargura] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const primeira = useRef(true);

  // dispara a barra quando um link é clicado (captura no documento)
  useEffect(() => {
    function aoClicar(e: MouseEvent) {
      // só cliques simples com botão esquerdo, sem modificadores
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const alvo = (e.target as HTMLElement)?.closest("a");
      if (!alvo) return;
      const href = alvo.getAttribute("href");
      // ignora âncoras, externos, novas abas, downloads
      if (!href || href.startsWith("#") || alvo.target === "_blank" || alvo.hasAttribute("download")) return;
      if (alvo.origin !== window.location.origin) return;
      // mesma URL exata → não navega
      if (alvo.pathname === window.location.pathname && alvo.search === window.location.search) return;
      iniciar();
    }
    document.addEventListener("click", aoClicar, { capture: true });
    return () => document.removeEventListener("click", aoClicar, { capture: true } as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function limparTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function iniciar() {
    limparTimers();
    setVisivel(true);
    setLargura(8);
    // sobe rápido até ~80% e "segura" (simula progresso enquanto carrega)
    timers.current.push(setTimeout(() => setLargura(45), 100));
    timers.current.push(setTimeout(() => setLargura(70), 300));
    timers.current.push(setTimeout(() => setLargura(85), 700));
  }

  // quando a rota (path ou query) muda, a navegação terminou → completa e some
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    limparTimers();
    setLargura(100);
    const t1 = setTimeout(() => setVisivel(false), 250);
    const t2 = setTimeout(() => setLargura(0), 500);
    timers.current.push(t1, t2);
    return limparTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        height: 3,
        width: `${largura}%`,
        background: "var(--accent-ink, #4ec3e0)",
        boxShadow: "0 0 8px var(--accent-ink, #4ec3e0)",
        opacity: visivel ? 1 : 0,
        transition: "width 0.3s ease, opacity 0.3s ease",
        zIndex: 9999,
        pointerEvents: "none",
      }}
    />
  );
}
