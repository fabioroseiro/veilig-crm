"use client";

import { useActionState } from "react";
import { ressincronizarStatus, type ResyncResult } from "./ressincronizar-actions";

const initial: ResyncResult = { ok: false, verificadas: 0, corrigidas: 0, falhas: 0, linksRepostos: 0, message: "" };

export function BotaoRessincronizar() {
  const [state, action, pending] = useActionState(async () => ressincronizarStatus(), initial);

  return (
    <div>
      <form action={action}>
        <button type="submit" className="btn-ghost" style={{ padding: "10px 18px" }} disabled={pending}>
          {pending ? "Consultando a Asaas…" : "Ressincronizar status com a Asaas"}
        </button>
      </form>
      {state.message && (
        <div className={`banner ${state.ok ? "banner-success" : "banner-error"}`} style={{ marginTop: 12 }}>
          {state.message}
        </div>
      )}
      <p className="hint" style={{ marginBottom: 0 }}>
        Consulta a Asaas e corrige o status das assinaturas aqui, caso algum aviso de
        pagamento (webhook) tenha se perdido.
      </p>
    </div>
  );
}
