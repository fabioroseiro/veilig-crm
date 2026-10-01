"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { editarUsuario, type EditState } from "./actions";

const initial: EditState = { ok: false };

type Papel = { valor: string; rotulo: string };
type Loja = { id: string; nome: string; groupId: string };

export function EditarUsuarioForm({
  userId,
  papeisDisponiveis,
  lojas,
  valoresIniciais,
}: {
  userId: string;
  papeisDisponiveis: Papel[];
  lojas: Loja[];
  valoresIniciais: { nome: string; role: string; storeId: string };
}) {
  const acao = editarUsuario.bind(null, userId);
  const [state, action, pending] = useActionState(acao, initial);
  const err = state.errors || {};
  const val = { ...valoresIniciais, ...(state.values || {}) };
  const [nome, setNome] = useState(val.nome ?? "");
  const [storeId, setStoreId] = useState(val.storeId ?? "");

  const [role, setRole] = useState(val.role);
  const precisaLoja = role === "store_admin" || role === "store_manager";

  const field = (n: string) => (err[n] ? "field has-error" : "field");

  return (
    <form action={action}>
      {state.message && !state.ok && (
        <div className="banner banner-error">{state.message}</div>
      )}

      <div className="grid">
        <div className={`${field("nome")} col-2`}>
          <label htmlFor="nome">Nome completo</label>
          <input id="nome" name="nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
          {err.nome && <span className="err">{err.nome}</span>}
        </div>

        <div className={field("role")}>
          <label htmlFor="role">Papel</label>
          <select id="role" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            {/* mantém o papel atual como opção mesmo se não editável para baixo */}
            {!papeisDisponiveis.some((p) => p.valor === val.role) && (
              <option value={val.role}>{val.role}</option>
            )}
            {papeisDisponiveis.map((p) => (
              <option key={p.valor} value={p.valor}>{p.rotulo}</option>
            ))}
          </select>
          {err.role && <span className="err">{err.role}</span>}
        </div>

        {precisaLoja && (
          <div className={field("storeId")}>
            <label htmlFor="storeId">Loja</label>
            <select id="storeId" name="storeId" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">Selecione a loja…</option>
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>{l.nome}</option>
              ))}
            </select>
            {err.storeId && <span className="err">{err.storeId}</span>}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Salvando…" : "Salvar alterações"}
        </button>
        <Link href="/usuarios" className="btn-ghost" style={{ padding: "11px 20px" }}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
