import { getSessionContext } from "@/lib/session";

/**
 * Faixa fixa no topo enquanto o modo "ver como" estiver ativo.
 *
 * Sem ela é fácil esquecer em que modo se está — e estranhar por que os botões
 * não funcionam, ou achar que um número é o da plataforma inteira.
 */
export async function FaixaVerComo() {
  const ctx = await getSessionContext().catch(() => null);
  if (!ctx?.verComo) return null;

  return (
    <div
      role="status"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "#b8860b",
        color: "#fff",
        padding: "8px 16px",
        fontSize: 14,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span>
        Vendo como <strong>{ctx.verComo.nome}</strong> ({ctx.verComo.papel}) — somente
        leitura. Botões de ação não funcionam neste modo.
      </span>
      <a href="/api/ver-como/sair" style={{ color: "#fff", fontWeight: 600, textDecoration: "underline" }}>
        Sair do modo
      </a>
    </div>
  );
}
