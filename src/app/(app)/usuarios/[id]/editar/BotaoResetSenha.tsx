"use client";

import { useActionState } from "react";
import { CredenciaisUsuario } from "@/components/CredenciaisUsuario";
import { BotaoAcao } from "@/components/BotaoAcao";
import { resetarSenhaUsuario } from "./actions";

type Estado = { ok?: boolean; senhaProvisoria?: string; nome?: string };

/**
 * Reset de senha com exibição do resultado.
 *
 * Precisa ser componente cliente porque a senha nova é ALEATÓRIA e só existe
 * neste instante: a página de servidor não conseguiria mostrar o valor
 * devolvido pela action, e mandar por query string deixaria a credencial no
 * histórico do navegador e nos logs.
 */
export function BotaoResetSenha({ userId, email }: { userId: string; email: string }) {
  const [estado, formAction] = useActionState(
    async (): Promise<Estado> => (await resetarSenhaUsuario(userId)) ?? {},
    {}
  );

  if (estado.ok && estado.senhaProvisoria) {
    return (
      <CredenciaisUsuario
        nome={estado.nome}
        email={email}
        senha={estado.senhaProvisoria}
        titulo="Senha redefinida"
      />
    );
  }

  return (
    <form action={formAction}>
      <BotaoAcao className="btn-ghost" style={{ padding: "10px 18px" }} textoProcessando="Resetando…">
        Resetar senha
      </BotaoAcao>
    </form>
  );
}
