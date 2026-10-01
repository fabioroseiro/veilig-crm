"use client";

import { useState } from "react";
import { useActionState } from "react";
import { cancelarAssinaturaLoja, type CancelState } from "./actions";

const initial: CancelState = { ok: false, message: "" };

export function CancelarAssinaturaLoja({ subscriptionId }: { subscriptionId: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const acao = cancelarAssinaturaLoja.bind(null, subscriptionId);
  const [state, action, pending] = useActionState(acao, initial);

  if (state.message) {
    return (
      <div className={`banner ${state.ok ? "banner-success" : "banner-error"}`}>
        {state.message}
      </div>
    );
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        className="btn-ghost"
        style={{ padding: "10px 18px", color: "#d33", borderColor: "#d33" }}
        onClick={() => setConfirmando(true)}
      >
        Cancelar assinatura
      </button>
    );
  }

  return (
    <div style={{ border: "1px solid #d33", borderRadius: 8, padding: 14 }}>
      <p style={{ margin: "0 0 10px", fontWeight: 600 }}>
        Confirmar cancelamento?
      </p>
      <p className="hint" style={{ marginTop: 0 }}>
        A cobrança recorrente será interrompida na Asaas (não haverá renovação). O
        período já pago é preservado. Esta ação para os pagamentos futuros do
        cliente.
      </p>
      <form action={action} style={{ display: "flex", gap: 10 }}>
        <button type="submit" className="btn-primary" style={{ background: "#d33" }} disabled={pending}>
          {pending ? "Cancelando…" : "Sim, cancelar assinatura"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setConfirmando(false)} disabled={pending}>
          Voltar
        </button>
      </form>
    </div>
  );
}
