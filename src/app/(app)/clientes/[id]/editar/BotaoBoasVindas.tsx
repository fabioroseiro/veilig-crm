"use client";

import { useState } from "react";
import { reenviarBoasVindas } from "./actions";

/**
 * Situação do e-mail do cliente e reenvio das boas-vindas.
 *
 * O e-mail verificado importa porque a recuperação de senha depende dele: com
 * endereço errado, o cliente não tem caminho de volta e liga para a loja.
 */
export function BotaoBoasVindas({
  customerId,
  email,
  verificadoEm,
}: {
  customerId: string;
  email: string | null;
  verificadoEm: string | null;
}) {
  const [estado, setEstado] = useState<{ ok: boolean; message: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  return (
    <div style={{ marginTop: 6 }}>
      {verificadoEm ? (
        <span className="badge badge-ok" style={{ fontSize: 12 }}>
          e-mail verificado em {new Date(verificadoEm).toLocaleDateString("pt-BR")}
        </span>
      ) : (
        <span className="badge badge-pending" style={{ fontSize: 12 }}>
          e-mail ainda não verificado
        </span>
      )}

      {email && (
        <button
          type="button"
          className="btn-ghost"
          style={{ padding: "4px 10px", fontSize: 12, marginLeft: 8 }}
          disabled={enviando}
          onClick={async () => {
            setEnviando(true);
            setEstado(await reenviarBoasVindas(customerId));
            setEnviando(false);
          }}
        >
          {enviando ? "Enviando…" : verificadoEm ? "Reenviar acesso" : "Enviar acesso por e-mail"}
        </button>
      )}

      {estado && (
        <div
          className={`banner ${estado.ok ? "banner-success" : "banner-error"}`}
          style={{ marginTop: 8 }}
        >
          {estado.message}
        </div>
      )}
    </div>
  );
}
