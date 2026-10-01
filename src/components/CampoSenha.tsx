"use client";

import { useState } from "react";

/**
 * Campo de senha com o "olhinho" para revelar o que foi digitado.
 *
 * Existe porque errar senha às cegas é comum — principalmente com as
 * provisórias que o sistema gera, do tipo H7K2-M9PX, digitadas a partir de
 * uma mensagem no celular.
 *
 * Começa SEMPRE oculto: revelar é uma escolha de quem está digitando, e a tela
 * pode estar sendo vista por outra pessoa no balcão.
 */
export function CampoSenha({
  id,
  name,
  label,
  hint,
  autoComplete = "current-password",
  required = true,
  minLength,
  placeholder,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
}) {
  const [visivel, setVisivel] = useState(false);

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          id={id}
          name={name}
          type={visivel ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          placeholder={placeholder}
          // Espaço à direita para o botão não cobrir o que foi digitado.
          style={{ paddingRight: 44, width: "100%" }}
        />
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
          title={visivel ? "Ocultar senha" : "Mostrar senha"}
          style={{
            position: "absolute",
            right: 6,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 6,
            lineHeight: 0,
            color: "var(--ink-soft, #6b7d82)",
          }}
        >
          {visivel ? (
            // Olho cortado: senha visível, clique para ocultar.
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 3l18 18" />
              <path d="M10.6 10.6a2 2 0 002.8 2.8" />
              <path d="M9.4 5.2A9.5 9.5 0 0112 5c5 0 9 4.5 9 7a11 11 0 01-2.6 3.5" />
              <path d="M6.2 6.6C3.9 8 2.3 10.2 2.3 12c0 2.5 4 7 9.7 7a9.8 9.8 0 003.6-.7" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M2.3 12S6 5 12 5s9.7 7 9.7 7-3.7 7-9.7 7-9.7-7-9.7-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
