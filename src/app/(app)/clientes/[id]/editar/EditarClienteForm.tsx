"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { editarCliente, type EditState } from "./actions";
import { mascaraTelefone, mascaraPlaca } from "@/lib/mascaras";

const initial: EditState = { ok: false };

export function EditarClienteForm({
  customerId,
  personId,
  vehicleId,
  valoresIniciais,
}: {
  customerId: string;
  personId: string;
  vehicleId: string | null;
  valoresIniciais: { nome: string; email: string; telefone: string; placa: string };
}) {
  const acao = editarCliente.bind(null, customerId, personId, vehicleId);
  const [state, action, pending] = useActionState(acao, initial);
  const err = state.errors || {};
  const val = { ...valoresIniciais, ...(state.values || {}) };
  const [nome, setNome] = useState(val.nome ?? "");
  const [email, setEmail] = useState(val.email ?? "");

  const [telefone, setTelefone] = useState(mascaraTelefone(val.telefone ?? ""));
  const [placa, setPlaca] = useState(mascaraPlaca(val.placa ?? ""));

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

        <div className={field("email")}>
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {err.email && <span className="err">{err.email}</span>}
        </div>

        <div className={field("telefone")}>
          <label htmlFor="telefone">Telefone</label>
          <input id="telefone" name="telefone" value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} inputMode="numeric" required />
          {err.telefone && <span className="err">{err.telefone}</span>}
        </div>

        {vehicleId && (
          <div className={field("placa")}>
            <label htmlFor="placa">Placa do veículo</label>
            <input id="placa" name="placa" value={placa} onChange={(e) => setPlaca(mascaraPlaca(e.target.value))} style={{ textTransform: "uppercase" }} />
            {err.placa && <span className="err">{err.placa}</span>}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Salvando…" : "Salvar alterações"}
        </button>
        <Link href="/clientes" className="btn-ghost" style={{ padding: "11px 20px" }}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
