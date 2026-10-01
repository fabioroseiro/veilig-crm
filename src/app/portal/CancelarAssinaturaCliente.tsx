"use client";

import { useState } from "react";
import { useActionState } from "react";
import { cancelarAssinaturaCliente, type CancelState } from "./cancelar-actions";

const initial: CancelState = { ok: false, message: "" };

export function CancelarAssinaturaCliente({ subscriptionId }: { subscriptionId: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const acao = cancelarAssinaturaCliente.bind(null, subscriptionId);
  const [state, action, pending] = useActionState(acao, initial);

  if (state.message) {
    return (
      <div className={`banner ${state.ok ? "banner-success" : "banner-error"}`} style={{ marginTop: 12 }}>
        {state.message}
      </div>
    );
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        className="portal-cancelar-link"
        onClick={() => setConfirmando(true)}
      >
        Cancelar assinatura
      </button>
    );
  }

  return (
    <div style={{ marginTop: 12, border: "1px solid var(--line)", borderRadius: 8, padding: 14 }}>
      <p style={{ margin: "0 0 8px", fontWeight: 600 }}>Deseja cancelar sua assinatura?</p>
      <p className="hint" style={{ marginTop: 0 }}>
        A cobrança dos próximos meses será interrompida. O período que você já pagou
        continua válido. Você pode assinar novamente no futuro pela loja.
      </p>
      <form action={action} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Cancelando…" : "Sim, cancelar"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setConfirmando(false)} disabled={pending}>
          Voltar
        </button>
      </form>
    </div>
  );
}
