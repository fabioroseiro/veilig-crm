"use client";

import { useActionState } from "react";
import { trocarSenhaCliente, type TrocaState } from "./actions";
import { CampoSenha } from "@/components/CampoSenha";

const initial: TrocaState = {};

export function TrocarSenhaClienteForm() {
  const [state, action, pending] = useActionState(trocarSenhaCliente, initial);

  return (
    <form action={action} className="login-form">
      {state.message && <div className="banner banner-error">{state.message}</div>}

      <CampoSenha id="nova" name="nova" label="Nova senha" autoComplete="new-password" placeholder="ao menos 8 caracteres, com letra e número" />

      <CampoSenha id="confirma" name="confirma" label="Confirmar nova senha" autoComplete="new-password" placeholder="repita a nova senha" />

      <button type="submit" className="btn-primary" disabled={pending} style={{ width: "100%", marginTop: 8 }}>
        {pending ? "Salvando…" : "Salvar e continuar"}
      </button>
    </form>
  );
}
