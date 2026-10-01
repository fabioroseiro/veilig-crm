"use client";

import { useActionState, useState } from "react";
import { pedirRecuperacaoCliente, type PedidoCliente } from "./actions";
import { mascaraCpf } from "@/lib/mascaras";

const inicial: PedidoCliente = { ok: false, message: "" };

export function EsqueciClienteForm() {
  const [cpf, setCpf] = useState("");
  const [state, action, pending] = useActionState(
    async (_: PedidoCliente, fd: FormData) => pedirRecuperacaoCliente(fd),
    inicial
  );

  if (state.ok) {
    return (
      <>
        <div className="banner banner-success" style={{ marginBottom: 14 }}>{state.message}</div>
        <a href="/portal/login" className="btn-link-primary">Voltar para o login</a>
      </>
    );
  }

  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="cpf">Seu CPF</label>
        <input
          id="cpf"
          name="cpf"
          inputMode="numeric"
          value={cpf}
          onChange={(e) => setCpf(mascaraCpf(e.target.value))}
          placeholder="000.000.000-00"
          required
        />
        <span className="hint">O mesmo que você usa para entrar.</span>
      </div>
      {state.message && <div className="banner banner-error" style={{ marginBottom: 12 }}>{state.message}</div>}
      <button type="submit" className="btn-primary" style={{ width: "100%", padding: "12px" }} disabled={pending}>
        {pending ? "Enviando…" : "Enviar link para meu e-mail"}
      </button>
      <p style={{ marginTop: 14, textAlign: "center" }}>
        <a href="/portal/login">Voltar para o login</a>
      </p>
    </form>
  );
}
