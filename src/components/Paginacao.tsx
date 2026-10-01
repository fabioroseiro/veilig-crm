"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

/**
 * Navegação entre páginas. Preserva todos os outros parâmetros da URL —
 * principalmente o ?q= da busca, para não perder o filtro ao virar a página.
 */
export function Paginacao({
  pagina,
  totalPaginas,
  total,
  rotulo = "registros",
}: {
  pagina: number;
  totalPaginas: number;
  total: number;
  rotulo?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPaginas <= 1) {
    return (
      <div className="store-sub" style={{ padding: "10px 4px", fontSize: 13 }}>
        {total} {rotulo}
      </div>
    );
  }

  const irPara = (n: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (n <= 1) params.delete("p");
    else params.set("p", String(n));
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 4px",
        flexWrap: "wrap",
      }}
    >
      <div className="store-sub" style={{ fontSize: 13 }}>
        {total} {rotulo} · página {pagina} de {totalPaginas}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn-ghost"
          style={{ padding: "6px 14px", fontSize: 13 }}
          onClick={() => irPara(pagina - 1)}
          disabled={pagina <= 1}
        >
          ← Anterior
        </button>
        <button
          type="button"
          className="btn-ghost"
          style={{ padding: "6px 14px", fontSize: 13 }}
          onClick={() => irPara(pagina + 1)}
          disabled={pagina >= totalPaginas}
        >
          Próxima →
        </button>
      </div>
    </div>
  );
}
