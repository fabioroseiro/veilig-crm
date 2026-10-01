"use client";

import { useActionState, useMemo, useState } from "react";
import { salvarPrecos, type PrecoState } from "./actions";

const initial: PrecoState = {};

type Modelo = {
  id: string;
  fabricante: string;
  label: string;
  /** Piso definido pelo grupo PARA ESTE MODELO — varia de modelo para modelo. */
  minimo: string;
  categoria: string;
  precoAtual: string;
};

export function PrecificarForm({
  storeId,
  planId,
  modelos,
  fabricantes,
}: {
  storeId: string;
  planId: string;
  modelos: Modelo[];
  fabricantes: string[];
}) {
  const action = salvarPrecos.bind(null, storeId, planId);
  const [state, formAction, pending] = useActionState(action, initial);
  const erros = state.erros || {};

  const [fabFiltro, setFabFiltro] = useState("");

  const visiveis = useMemo(() => {
    return new Set(
      modelos
        .filter((m) => !fabFiltro || m.fabricante === fabFiltro)
        .map((m) => m.id)
    );
  }, [fabFiltro, modelos]);

  return (
    <form action={formAction}>
      {state.message && (
        <div className={state.ok ? "banner banner-success" : "banner banner-error"}>
          {state.message}
        </div>
      )}

      <div className="model-picker-toolbar" style={{ borderRadius: "var(--radius-sm)", border: "1px solid var(--line)", marginBottom: 14 }}>
        <select value={fabFiltro} onChange={(e) => setFabFiltro(e.target.value)} className="model-fab-filter">
          <option value="">Todos os fabricantes</option>
          {fabricantes.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <span className="model-count">{visiveis.size} de {modelos.length} modelo(s)</span>
      </div>

      <div className="price-list">
        {/* Todos os modelos são renderizados; filtro só esconde via CSS, para os
            inputs preenchidos continuarem sendo enviados. */}
        {modelos.map((m) => {
          const vis = visiveis.has(m.id);
          const temErro = Boolean(erros[m.id]);
          return (
            <div
              key={m.id}
              className={temErro ? "price-row has-error" : "price-row"}
              style={vis ? undefined : { display: "none" }}
            >
              <div className="price-model">
                <span className="price-model-name">{m.label}</span>
                <span className="model-tag">{m.categoria}</span>
              </div>
              <div className="price-input-wrap">
                <span className="price-prefix">R$</span>
                <input
                  type="text"
                  name={`preco_${m.id}`}
                  defaultValue={m.precoAtual}
                  placeholder={`≥ ${m.minimo}`}
                  className="price-input"
                  inputMode="decimal"
                />
                {temErro && <span className="error price-error">{erros[m.id]}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="actions">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Salvando…" : "Salvar preços"}
        </button>
        <a href={`/lojas/${storeId}`} className="btn-ghost" style={{ padding: "11px 20px" }}>
          Voltar à loja
        </a>
      </div>
    </form>
  );
}
