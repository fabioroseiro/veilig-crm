"use client";

import { useId, type ReactNode } from "react";

/**
 * Bloco recolhível para formulários longos.
 *
 * Duas decisões que evitam armadilhas conhecidas de acordeão:
 *
 * 1) O estado de aberto/fechado é CONTROLADO pelo pai. Isso permite abrir
 *    automaticamente um bloco que contém erro — sem isso, a pessoa recebe
 *    "Verifique os campos" e não encontra onde, porque o campo com erro está
 *    escondido dentro de um bloco fechado.
 *
 * 2) O cabeçalho carrega um RESUMO do conteúdo. Fechado não pode significar
 *    invisível: quem está criando um plano precisa saber, sem abrir, que já
 *    cadastrou 4 revisões e nenhum teto.
 *
 * O visual é discreto de propósito. Borda marcante em todos os blocos faz o
 * destaque se anular; aqui a cor da marca marca só o bloco ABERTO, e o vermelho
 * marca só o bloco com erro.
 */
export function BlocoForm({
  titulo,
  resumo,
  aberto,
  onToggle,
  temErro = false,
  opcional = false,
  children,
}: {
  titulo: string;
  resumo?: ReactNode;
  aberto: boolean;
  onToggle: () => void;
  temErro?: boolean;
  opcional?: boolean;
  children: ReactNode;
}) {
  const id = useId();

  return (
    <section
      style={{
        border: `1px solid ${temErro ? "var(--danger)" : "var(--line)"}`,
        borderLeft: `3px solid ${
          temErro ? "var(--danger)" : aberto ? "var(--accent)" : "var(--line)"
        }`,
        borderRadius: "var(--radius-sm, 8px)",
        marginBottom: 14,
        overflow: "hidden",
        background: "var(--surface)",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={aberto}
        aria-controls={id}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "14px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          font: "inherit",
          color: "inherit",
        }}
      >
        <span style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>{titulo}</span>
          {opcional && (
            <span
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: ".06em",
                color: "var(--ink-soft)",
              }}
            >
              opcional
            </span>
          )}
        </span>

        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {resumo && (
            <span
              style={{
                fontSize: 13,
                color: temErro ? "var(--danger)" : "var(--ink-soft)",
                textAlign: "right",
              }}
            >
              {resumo}
            </span>
          )}
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              transition: "transform .15s ease",
              transform: aberto ? "rotate(90deg)" : "none",
              color: "var(--ink-soft)",
              fontSize: 12,
            }}
          >
            ▶
          </span>
        </span>
      </button>

      {/* Fica no DOM mesmo fechado: os campos precisam ser enviados no submit
          e o estado do React precisa sobreviver ao abre-e-fecha. */}
      <div id={id} hidden={!aberto} style={{ padding: "0 16px 16px" }}>
        {children}
      </div>
    </section>
  );
}
