"use client";

import { useState } from "react";

/**
 * Monta a mensagem pronta para o WhatsApp.
 *
 * O vendedor não vai reescrever o argumento na conversa — ou tem o texto
 * pronto, ou manda alguma coisa improvisada. E improviso por escrito é
 * exatamente o que vira promessa que o contrato não sustenta.
 */
export function CopiarArgumentos({
  nomePlano,
  revisoes,
  beneficios,
  argumentos,
}: {
  nomePlano: string;
  revisoes: string[];
  beneficios: string[];
  argumentos: { titulo: string; texto: string }[];
}) {
  const [copiado, setCopiado] = useState(false);

  const mensagem =
    `*${nomePlano}*\n\n` +
    (revisoes.length || beneficios.length
      ? "*O que está incluso:*\n" +
        [...revisoes, ...beneficios].map((l) => `• ${l}`).join("\n") +
        "\n\n"
      : "") +
    argumentos
      .map((a) => `*${a.titulo}*\n${a.texto}`)
      .join("\n\n") +
    "\n\n_Consulte as condições completas com a concessionária._";

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(mensagem);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // sem permissão: o conteúdo está visível na tela de qualquer forma
    }
  };

  const paraWhats = `https://wa.me/?text=${encodeURIComponent(mensagem)}`;

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button type="button" className="btn-primary" style={{ padding: "10px 18px" }} onClick={copiar}>
        {copiado ? "Copiado!" : "Copiar texto para o cliente"}
      </button>
      <a
        href={paraWhats}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-ghost"
        style={{ padding: "10px 18px" }}
      >
        Abrir no WhatsApp
      </a>
    </div>
  );
}
