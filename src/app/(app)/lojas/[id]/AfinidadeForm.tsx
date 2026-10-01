"use client";

import { useActionState } from "react";
import { salvarAfinidades, type AffinityState } from "./actions";

const initial: AffinityState = {};

export function AfinidadeForm({
  storeId,
  fabricantes,
  categorias,
  fabSelecionados,
  catSelecionadas,
}: {
  storeId: string;
  fabricantes: string[];
  categorias: { valor: string; rotulo: string }[];
  fabSelecionados: string[];
  catSelecionadas: string[];
}) {
  const action = salvarAfinidades.bind(null, storeId);
  const [state, formAction, pending] = useActionState(action, initial);

  const fabSet = new Set(fabSelecionados);
  const catSet = new Set(catSelecionadas);

  return (
    <form action={formAction}>
      {state.message && (
        <div className={state.ok ? "banner banner-success" : "banner banner-error"}>
          {state.message}
        </div>
      )}

      <div className="grid">
        <div className="field col-1">
          <label>Fabricantes que a loja atende</label>
          <div className="check-list">
            {fabricantes.map((f) => (
              <label key={f} className="check-item">
                <input
                  type="checkbox"
                  name="fabricante"
                  value={f}
                  defaultChecked={fabSet.has(f)}
                />
                {f}
              </label>
            ))}
          </div>
        </div>

        <div className="field col-1">
          <label>Categorias que a loja atende</label>
          <div className="check-list">
            {categorias.map((c) => (
              <label key={c.valor} className="check-item">
                <input
                  type="checkbox"
                  name="categoria"
                  value={c.valor}
                  defaultChecked={catSet.has(c.valor)}
                />
                {c.rotulo}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="actions">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Salvando…" : "Salvar afinidades"}
        </button>
      </div>
    </form>
  );
}
