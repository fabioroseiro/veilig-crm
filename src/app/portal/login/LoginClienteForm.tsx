"use client";

import { useActionState, useState } from "react";
import { loginCliente, type LoginState } from "./actions";
import { mascaraCpf } from "@/lib/mascaras";
import { CampoSenha } from "@/components/CampoSenha";

const initial: LoginState = {};

export function LoginClienteForm() {
  const [state, action, pending] = useActionState(loginCliente, initial);
  const [cpf, setCpf] = useState("");

  return (
    <form action={action} className="login-form">
      {state.message && <div className="banner banner-error">{state.message}</div>}

      <div className="field">
        <label htmlFor="cpf">CPF</label>
        <input
          id="cpf"
          name="cpf"
          value={cpf}
          onChange={(e) => setCpf(mascaraCpf(e.target.value))}
          inputMode="numeric"
          placeholder="000.000.000-00"
          autoComplete="username"
          required
        />
      </div>

      <CampoSenha id="senha" name="senha" label="Senha" />

      <button type="submit" className="btn-primary" disabled={pending} style={{ width: "100%", marginTop: 8 }}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
      <p style={{ marginTop: 14, textAlign: "center", fontSize: 14 }}>
        <a href="/portal/esqueci-senha">Esqueci minha senha</a>
      </p>
    </form>
  );
}
