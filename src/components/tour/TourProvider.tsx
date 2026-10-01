"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * Tour guiado dentro das próprias telas: escurece a tela, destaca o elemento
 * real e explica o que ele faz.
 *
 * Feito à mão, sem biblioteca: o deploy copia só `src/`, e uma dependência
 * nova no package.json não iria junto.
 *
 * ── Como uma tela usa ───────────────────────────────────────────────────
 *
 * O elemento recebe `data-tour="nome"`, e a tela monta <Tour id passos />.
 * Na primeira vez que a pessoa abre a tela, o tour começa sozinho. Depois,
 * o botão "?" no canto refaz os tours da tela atual.
 *
 * Passo cujo elemento não está visível (por exemplo, menu recolhido no
 * celular) é pulado — melhor que um balão apontando para o nada.
 */

export type PassoTour = { alvo: string; titulo: string; texto: string };
type TourDef = { id: string; passos: PassoTour[] };

type Ctx = {
  registrar: (t: TourDef) => () => void;
  pedirInicio: (id: string) => void;
};

const TourCtx = createContext<Ctx | null>(null);
export const useTour = () => useContext(TourCtx);

function visivel(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const r = (el as HTMLElement).getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function TourProvider({
  vistos,
  autoIniciar,
  children,
}: {
  vistos: string[];
  /** Falso no modo "ver como" e para a Veilig: o "?" funciona, o automático não. */
  autoIniciar: boolean;
  children: React.ReactNode;
}) {
  const [registrados, setRegistrados] = useState<TourDef[]>([]);
  const [ativo, setAtivo] = useState<{ passos: PassoTour[]; ids: string[] } | null>(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const vistosRef = useRef(new Set(vistos));
  const fila = useRef<string[]>([]);

  const registrar = useCallback((t: TourDef) => {
    setRegistrados((rs) => [...rs.filter((r) => r.id !== t.id), t]);
    return () => setRegistrados((rs) => rs.filter((r) => r.id !== t.id));
  }, []);

  const montar = useCallback((defs: TourDef[]) => {
    // Só os passos cujo elemento está na tela AGORA.
    const passos = defs.flatMap((d) =>
      d.passos.filter((p) => visivel(document.querySelector(`[data-tour="${p.alvo}"]`)))
    );
    if (passos.length === 0) return false;
    setI(0);
    setAtivo({ passos, ids: defs.map((d) => d.id) });
    return true;
  }, []);

  const pedirInicio = useCallback(
    (id: string) => {
      if (!autoIniciar || vistosRef.current.has(id)) return;
      if (!fila.current.includes(id)) fila.current.push(id);
    },
    [autoIniciar]
  );

  // Consome a fila quando nada está rodando. O atraso dá tempo à tela de
  // terminar de desenhar — senão o elemento ainda não existe.
  useEffect(() => {
    if (ativo || fila.current.length === 0) return;
    const t = setTimeout(() => {
      const ids = fila.current.splice(0);
      const defs = registrados.filter((r) => ids.includes(r.id));
      montar(defs);
    }, 600);
    return () => clearTimeout(t);
  });

  const marcar = (ids: string[]) => {
    for (const id of ids) {
      if (vistosRef.current.has(id)) continue;
      vistosRef.current.add(id);
      if (!autoIniciar) continue; // "ver como": não marca no nome de outra pessoa
      fetch("/api/tour/visto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      }).catch(() => {});
    }
  };

  const encerrar = () => {
    if (ativo) marcar(ativo.ids);
    setAtivo(null);
    setRect(null);
  };

  // Posição do elemento atual, acompanhando rolagem e redimensionamento.
  const passo = ativo?.passos[i];
  useEffect(() => {
    if (!passo) return;
    const el = document.querySelector(`[data-tour="${passo.alvo}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const medir = () => setRect(el.getBoundingClientRect());
    const t = setTimeout(medir, 350);
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [passo]);

  const total = ativo?.passos.length ?? 0;
  const ultimo = i === total - 1;

  // Balão abaixo do elemento; acima se não couber.
  let balao: React.CSSProperties = { display: "none" };
  if (rect && typeof window !== "undefined") {
    const largura = Math.min(340, window.innerWidth - 24);
    const esquerda = Math.max(12, Math.min(rect.left, window.innerWidth - largura - 12));
    const abaixo = rect.bottom + 200 < window.innerHeight;
    balao = {
      position: "fixed",
      zIndex: 10002,
      width: largura,
      left: esquerda,
      ...(abaixo ? { top: rect.bottom + 12 } : { bottom: window.innerHeight - rect.top + 12 }),
    };
  }

  return (
    <TourCtx.Provider value={{ registrar, pedirInicio }}>
      {children}

      {/* "?" só aparece se a tela atual tiver tour. */}
      {registrados.length > 0 && !ativo && (
        <button
          type="button"
          onClick={() => montar(registrados)}
          aria-label="Como usar esta tela"
          title="Como usar esta tela"
          style={{
            position: "fixed",
            right: 20,
            bottom: 20,
            zIndex: 9000,
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: "none",
            background: "var(--accent, #4ec3e0)",
            color: "#fff",
            fontSize: 20,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(0,0,0,.2)",
            // Os botões herdam espaçamento e altura de linha do estilo global,
            // o que deslocava o "?" dentro do círculo.
            padding: 0,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ?
        </button>
      )}

      {ativo && passo && (
        <>
          {/* Bloqueia cliques na tela enquanto o tour roda. */}
          <div style={{ position: "fixed", inset: 0, zIndex: 10000 }} />
          {rect && (
            <div
              style={{
                position: "fixed",
                zIndex: 10001,
                top: rect.top - 6,
                left: rect.left - 6,
                width: rect.width + 12,
                height: rect.height + 12,
                borderRadius: 8,
                boxShadow: "0 0 0 9999px rgba(0,0,0,.55)",
                pointerEvents: "none",
                transition: "all .2s",
              }}
            />
          )}
          <div
            role="dialog"
            aria-label={passo.titulo}
            style={{
              ...balao,
              background: "var(--surface, #fff)",
              color: "var(--ink, #173b43)",
              borderRadius: 10,
              padding: "14px 16px",
              boxShadow: "0 8px 30px rgba(0,0,0,.25)",
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
              {i + 1} de {total}
            </div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{passo.titulo}</div>
            <div style={{ fontSize: 14, lineHeight: 1.45 }}>{passo.texto}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" className="btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }} onClick={encerrar}>
                {ultimo ? "Fechar" : "Pular"}
              </button>
              {i > 0 && (
                <button type="button" className="btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => setI(i - 1)}>
                  Voltar
                </button>
              )}
              <button
                type="button"
                className="btn-primary"
                style={{ padding: "6px 14px", fontSize: 13 }}
                onClick={() => (ultimo ? encerrar() : setI(i + 1))}
              >
                {ultimo ? "Entendi" : "Próximo"}
              </button>
            </div>
          </div>
        </>
      )}
    </TourCtx.Provider>
  );
}
