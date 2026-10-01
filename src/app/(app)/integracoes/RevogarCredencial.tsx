"use client";

import { useState } from "react";
import { revogarCredencial } from "./actions";

/** Confirmação em dois passos: revogar derruba a integração na hora. */
export function RevogarCredencial({ id, nome }: { id: string; nome: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [processando, setProcessando] = useState(false);

  if (!confirmando) {
    return (
      <button
        type="button"
        className="btn-ghost"
        style={{ padding: "4px 10px", fontSize: 13 }}
        onClick={() => setConfirmando(true)}
      >
        Revogar
      </button>
    );
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <span className="store-sub" style={{ fontSize: 12 }}>
        {nome} para de funcionar na hora.
      </span>
      <button
        type="button"
        className="btn-ghost"
        style={{ padding: "4px 10px", fontSize: 13, color: "var(--danger)" }}
        onClick={async () => {
          setProcessando(true);
          await revogarCredencial(id);
          setProcessando(false);
        }}
        disabled={processando}
      >
        {processando ? "Revogando…" : "Confirmar"}
      </button>
      <button
        type="button"
        className="btn-ghost"
        style={{ padding: "4px 10px", fontSize: 13 }}
        onClick={() => setConfirmando(false)}
      >
        Cancelar
      </button>
    </div>
  );
}
