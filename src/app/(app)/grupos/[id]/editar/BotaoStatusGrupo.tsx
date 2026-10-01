"use client";

import { useState } from "react";
import { alternarStatusGrupo } from "./actions";

/**
 * Inativar/reativar o grupo, com confirmação que mostra o estrago.
 *
 * Inativar tem efeito REAL desde a função tenant_ativo(): derruba o acesso de
 * todos os usuários do grupo e das lojas dele. Por isso a confirmação diz
 * quantas pessoas ficarão de fora — e deixa explícito o que NÃO acontece.
 */
export function BotaoStatusGrupo({
  groupId,
  inativo,
  usuarios,
  assinaturas,
}: {
  groupId: string;
  inativo: boolean;
  usuarios: number;
  assinaturas: number;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [processando, setProcessando] = useState(false);

  const aplicar = async () => {
    setProcessando(true);
    await alternarStatusGrupo(groupId, inativo ? "ativo" : "inativo");
    setProcessando(false);
    setConfirmando(false);
  };

  if (inativo) {
    return (
      <div>
        <p style={{ marginTop: 0, fontSize: 14 }}>
          Este grupo está <strong>inativo</strong>. Os usuários dele não
          conseguem entrar no sistema.
        </p>
        <button
          type="button"
          className="btn-primary"
          style={{ padding: "10px 18px" }}
          onClick={aplicar}
          disabled={processando}
        >
          {processando ? "Reativando…" : "Reativar acesso do grupo"}
        </button>
      </div>
    );
  }

  if (confirmando) {
    return (
      <div
        style={{
          border: "1px solid var(--danger)",
          borderRadius: 8,
          padding: "14px 16px",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Confirma inativar o grupo?</div>
        <ul style={{ margin: "0 0 10px", paddingLeft: 20, fontSize: 14 }}>
          <li>
            <strong>
              {usuarios} usuário{usuarios === 1 ? "" : "s"}
            </strong>{" "}
            deixará de conseguir entrar — incluindo os das lojas do grupo.
          </li>
          <li>
            As <strong>{assinaturas} assinaturas vigentes continuam sendo cobradas</strong>{" "}
            normalmente pela Asaas. Inativar o grupo suspende o acesso ao painel,
            não a cobrança do cliente final.
          </li>
          <li>Nada é apagado, e dá para reativar a qualquer momento.</li>
        </ul>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="btn-primary"
            style={{ padding: "8px 16px" }}
            onClick={aplicar}
            disabled={processando}
          >
            {processando ? "Inativando…" : "Sim, inativar"}
          </button>
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: "8px 16px" }}
            onClick={() => setConfirmando(false)}
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p style={{ marginTop: 0, fontSize: 14 }}>
        Inativar bloqueia o login de todos os usuários do grupo e das lojas dele.
        As cobranças em curso não são afetadas.
      </p>
      <button
        type="button"
        className="btn-ghost"
        style={{ padding: "10px 18px" }}
        onClick={() => setConfirmando(true)}
      >
        Inativar grupo
      </button>
    </div>
  );
}
