"use client";

// Rede de segurança para erros que acontecem no layout raiz (fora do alcance do
// error.tsx das telas). Precisa renderizar <html>/<body> próprios porque
// substitui o layout raiz quando dispara.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f4f7f8", margin: 0 }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ textAlign: "center", maxWidth: 420 }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: "#4ec3e0" }}>Ops</div>
            <h1 style={{ color: "#173b43", margin: "8px 0" }}>Algo deu errado</h1>
            <p style={{ color: "#5a6b70" }}>
              Encontramos um problema inesperado. Tente novamente em instantes.
            </p>
            <button
              onClick={() => reset()}
              style={{ background: "#173b43", color: "#fff", border: "none", padding: "11px 22px", borderRadius: 8, cursor: "pointer", marginTop: 8 }}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
