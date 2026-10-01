"use client";

import { useActionState } from "react";
import { fazerLogin, type LoginState } from "./actions";
import { CampoSenha } from "@/components/CampoSenha";

const initial: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(fazerLogin, initial);

  return (
    <form action={action} className="login-form">
      {state.error && <div className="banner banner-error">{state.error}</div>}

      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="voce@empresa.com"
          required
        />
      </div>

      <CampoSenha id="senha" name="senha" label="Senha" placeholder="••••••••" />

      <button type="submit" className="btn-primary" disabled={pending} style={{ width: "100%", marginTop: 8 }}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
      <p style={{ marginTop: 14, textAlign: "center", fontSize: 14 }}>
        <a href="/esqueci-senha">Esqueci minha senha</a>
      </p>
    </form>
  );
}
