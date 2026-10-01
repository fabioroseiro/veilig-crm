"use client";

import { useActionState } from "react";
import { pedirRecuperacao, type PedidoResult } from "./actions";

const inicial: PedidoResult = { enviado: false, message: "" };

export function EsqueciForm() {
  const [state, action, pending] = useActionState(
    async (_: PedidoResult, fd: FormData) => pedirRecuperacao(fd),
    inicial
  );

  if (state.enviado) {
    return (
      <>
        <div className="banner banner-success" style={{ marginBottom: 14 }}>{state.message}</div>
        <a href="/login" className="btn-link-primary">Voltar para o login</a>
      </>
    );
  }

  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="email">E-mail do seu acesso</label>
        <input id="email" name="email" type="email" autoComplete="email" required placeholder="voce@empresa.com.br" />
      </div>
      {state.message && <div className="banner banner-error" style={{ marginBottom: 12 }}>{state.message}</div>}
      <button type="submit" className="btn-primary" style={{ width: "100%", padding: "12px" }} disabled={pending}>
        {pending ? "Enviando…" : "Enviar link de redefinição"}
      </button>
      <p style={{ marginTop: 14, textAlign: "center" }}>
        <a href="/login">Voltar para o login</a>
      </p>
    </form>
  );
}
