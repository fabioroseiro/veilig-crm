"use client";

import { useState } from "react";
import { CredenciaisCliente } from "@/components/CredenciaisCliente";
import { gerarNovaSenhaCliente } from "./actions";

/**
 * Regera o acesso do cliente ao portal.
 *
 * Sem isto, um cliente cuja senha se perdeu (o vendedor fechou a aba antes de
 * anotar) ficaria trancado para fora do portal para sempre — a senha é
 * aleatória e não fica guardada em lugar nenhum, só o hash.
 */
export function BotaoNovaSenha({ cpf, nome }: { cpf: string; nome?: string }) {
  const [estado, setEstado] = useState<{ senha?: string; erro?: string }>({});
  const [carregando, setCarregando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  if (estado.senha) {
    return <CredenciaisCliente cpf={cpf} senha={estado.senha} nome={nome} titulo="Nova senha gerada" />;
  }

  const gerar = async () => {
    setCarregando(true);
    const r = await gerarNovaSenhaCliente(cpf);
    setCarregando(false);
    setConfirmando(false);
    if (r.ok && r.senha) setEstado({ senha: r.senha });
    else setEstado({ erro: r.message ?? "Não foi possível gerar a senha." });
  };

  return (
    <div>
      {estado.erro && <div className="banner banner-error">{estado.erro}</div>}

      {/* Confirmação em dois passos: gerar uma nova senha invalida a atual, e
          o cliente pode estar usando a que já tem. */}
      {confirmando ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 14 }}>
            A senha atual deixará de funcionar. Confirma?
          </span>
          <button type="button" className="btn-primary" style={{ padding: "8px 16px" }} onClick={gerar} disabled={carregando}>
            {carregando ? "Gerando…" : "Sim, gerar nova"}
          </button>
          <button type="button" className="btn-ghost" style={{ padding: "8px 16px" }} onClick={() => setConfirmando(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <button type="button" className="btn-ghost" style={{ padding: "10px 18px" }} onClick={() => setConfirmando(true)}>
          Gerar nova senha do portal
        </button>
      )}
    </div>
  );
}
