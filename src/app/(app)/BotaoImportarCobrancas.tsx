"use client";

import { useActionState } from "react";
import { importarCobrancas, type ImportResult } from "./importar-cobrancas-actions";

const initial: ImportResult = { ok: false, message: "" };

/**
 * Carga inicial do espelho de cobranças.
 *
 * Roda uma vez. É idempotente — a gravação é por id da Asaas, então repetir
 * não duplica, só atualiza. Por isso o botão fica, em vez de sumir depois.
 */
export function BotaoImportarCobrancas() {
  const [state, action, pending] = useActionState(async () => importarCobrancas(), initial);

  return (
    <div>
      <form action={action}>
        <button
          type="submit"
          className="btn-ghost"
          style={{ padding: "10px 18px" }}
          disabled={pending}
        >
          {pending ? "Importando da Asaas…" : "Importar histórico de cobranças"}
        </button>
      </form>
      <span className="hint">
        Traz as cobranças já existentes para o banco. Necessário uma vez; depois
        o webhook mantém atualizado.
      </span>
      {state.message && (
        <div
          className={`banner ${state.ok ? "banner-success" : "banner-error"}`}
          style={{ marginTop: 12 }}
        >
          {state.message}
        </div>
      )}
    </div>
  );
}
