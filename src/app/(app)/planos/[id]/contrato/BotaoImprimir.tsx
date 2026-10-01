"use client";

import { useState } from "react";

/**
 * Impressão pelo próprio navegador.
 *
 * Não geramos PDF no servidor de propósito: "Salvar como PDF" já existe na
 * caixa de impressão de qualquer navegador, e uma biblioteca de PDF traria
 * dependência, fontes e problemas de layout para resolver um problema que o
 * sistema operacional já resolve.
 */
export function BotaoImprimir({ compartilhar }: { compartilhar?: boolean } = {}) {
  const [copiado, setCopiado] = useState(false);

  /**
   * Copia o link da minuta para o vendedor mandar ao cliente.
   *
   * O pedido "me manda o contrato para eu ler antes" é comum, e até agora o
   * vendedor não tinha resposta. Salvar em PDF resolve por anexo; o link
   * resolve por mensagem.
   */
  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href.split("?")[0]);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // sem permissão de área de transferência: o botão de imprimir continua
    }
  };

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button
        type="button"
        className="btn-primary"
        style={{ padding: "10px 18px" }}
        onClick={() => window.print()}
      >
        Imprimir ou salvar em PDF
      </button>

      {compartilhar && (
        <button
          type="button"
          className="btn-ghost"
          style={{ padding: "10px 18px" }}
          onClick={copiarLink}
        >
          {copiado ? "Link copiado!" : "Copiar link"}
        </button>
      )}
    </div>
  );
}
