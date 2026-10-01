"use client";

import { useActionState, useState } from "react";
import { criarModelo, type FormState } from "./actions";
import { CATEGORIAS } from "@/lib/vehicle-model-validation";

const initial: FormState = { ok: false };

export function ModeloForm({
  valoresIniciais,
  acaoCustomizada,
  textoBotao = "Adicionar modelo",
  titulo = "Adicionar modelo",
}: {
  valoresIniciais?: Record<string, string>;
  acaoCustomizada?: (prev: FormState, fd: FormData) => Promise<FormState>;
  textoBotao?: string;
  titulo?: string;
} = {}) {
  const [state, action, pending] = useActionState(acaoCustomizada ?? criarModelo, initial);
  const err = state.errors || {};

  const val = { ...(valoresIniciais || {}), ...(state.values || {}) };
  // Controlados: com defaultValue, um erro do servidor devolveria o
  // formulário com os campos vazios e a pessoa reescreveria tudo.
  const [categoria, setCategoria] = useState(val.categoria ?? "");
  const [fabricante, setFabricante] = useState(val.fabricante ?? "");
  const [modelo, setModelo] = useState(val.modelo ?? "");
  const [versao, setVersao] = useState(val.versao ?? "");

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="section-label">{titulo}</div>
      <form action={action}>
        {state.message && !state.ok && (
          <div className="banner banner-error">{state.message}</div>
        )}
        <div className="grid">
          <div className={err.fabricante ? "field has-error col-1" : "field col-1"}>
            <label htmlFor="fabricante">Fabricante</label>
            <input id="fabricante" name="fabricante" value={fabricante} onChange={(e) => setFabricante(e.target.value)} placeholder="Fiat, Honda…" />
            {err.fabricante && <span className="error">{err.fabricante}</span>}
          </div>
          <div className={err.modelo ? "field has-error col-1" : "field col-1"}>
            <label htmlFor="modelo">Modelo</label>
            <input id="modelo" name="modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Uno, Jetta…" />
            {err.modelo && <span className="error">{err.modelo}</span>}
          </div>
          <div className="field col-1">
            <label htmlFor="versao">
              Versão <span className="opt">(opcional)</span>
            </label>
            <input id="versao" name="versao" value={versao} onChange={(e) => setVersao(e.target.value)} placeholder="TSI, GLI…" />
          </div>
          <div className={err.categoria ? "field has-error col-1" : "field col-1"}>
            <label htmlFor="categoria">Categoria</label>
            <select id="categoria" name="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="" disabled>
                Selecione…
              </option>
              {CATEGORIAS.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.rotulo}
                </option>
              ))}
            </select>
            {err.categoria && <span className="error">{err.categoria}</span>}
          </div>
          <div className="field col-2" style={{ alignItems: "flex-start" }}>
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "Salvando…" : textoBotao}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
