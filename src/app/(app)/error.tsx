"use client";

import Link from "next/link";
import { useEffect } from "react";

// Página de erro para as telas autenticadas. Aparece quando algo inesperado
// quebra numa tela — em vez da tela de erro genérica do Next, o usuário vê
// uma mensagem amigável e um caminho de volta.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // registra o erro para diagnóstico (aparece nos logs do servidor)
    console.error("Erro na tela:", error);
  }, [error]);

  return (
    <div className="erro-page">
      <div className="erro-card">
        <div className="erro-code">Ops</div>
        <h1>Algo deu errado</h1>
        <p>
          Encontramos um problema ao carregar esta tela. Você pode tentar de novo;
          se persistir, avise o suporte.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
          <button onClick={() => reset()} className="btn-primary">
            Tentar novamente
          </button>
          <Link href="/" className="btn-ghost" style={{ padding: "11px 20px" }}>
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
