"use client";

import { useActionState } from "react";
import { redefinirSenhaCliente, type RedefinirCliente } from "./actions";
import { CampoSenha } from "@/components/CampoSenha";

const inicial: RedefinirCliente = { ok: false, message: "" };

export function RedefinirClienteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(
    async (_: RedefinirCliente, fd: FormData) => redefinirSenhaCliente(fd),
    inicial
  );

  if (state.ok) {
    return (
      <>
        <div className="banner banner-success" style={{ marginBottom: 14 }}>{state.message}</div>
        <a href="/portal/login" className="btn-link-primary">Ir para o login</a>
      </>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <CampoSenha
        id="senha"
        name="senha"
        label="Nova senha"
        autoComplete="new-password"
        minLength={8}
        hint="Pelo menos 8 caracteres."
      />
      <CampoSenha
        id="repetir"
        name="repetir"
        label="Repita a nova senha"
        autoComplete="new-password"
        minLength={8}
      />
      {state.message && <div className="banner banner-error" style={{ marginBottom: 12 }}>{state.message}</div>}
      <button type="submit" className="btn-primary" style={{ width: "100%", padding: "12px" }} disabled={pending}>
        {pending ? "Salvando…" : "Salvar nova senha"}
      </button>
    </form>
  );
}
