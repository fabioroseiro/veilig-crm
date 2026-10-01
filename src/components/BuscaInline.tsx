"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";

// Campo de busca reutilizável. Atualiza o parâmetro ?q= na URL (com debounce),
// e a página (server component) refiltra os dados. Simples e consistente.
export function BuscaInline({ placeholder = "Buscar…" }: { placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [valor, setValor] = useState(searchParams.get("q") ?? "");
  const primeiraRenderizacao = useRef(true);

  useEffect(() => {
    // não dispara na montagem (evita refresh desnecessário)
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false;
      return;
    }
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (valor.trim()) params.set("q", valor.trim());
      else params.delete("q");
      // Nova busca sempre volta à primeira página. Sem isto, quem está na
      // página 4 e digita algo cai numa página vazia e acha que não achou nada.
      params.delete("p");
      router.replace(`${pathname}?${params.toString()}`);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  return (
    <div className="busca-wrap">
      <svg className="busca-icone" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        className="busca-input"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder={placeholder}
        aria-label="Buscar"
      />
      {valor && (
        <button className="busca-limpar" onClick={() => setValor("")} aria-label="Limpar busca">
          ×
        </button>
      )}
    </div>
  );
}
