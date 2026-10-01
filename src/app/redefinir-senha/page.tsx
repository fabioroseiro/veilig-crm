import { IconeVeilig } from "@/components/IconeVeilig";
import { conferirToken } from "./actions";
import { RedefinirForm } from "./RedefinirForm";

export const dynamic = "force-dynamic";

export default async function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const { valido } = token ? await conferirToken(token) : { valido: false };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <IconeVeilig tamanho={44} className="login-logo" />
          <span className="login-wordmark">VEILIG</span>
        </div>

        {valido ? (
          <>
            <h1 className="login-title">Criar nova senha</h1>
            <p className="login-sub">Escolha uma senha que só você saiba.</p>
            <RedefinirForm token={token!} />
          </>
        ) : (
          <>
            <h1 className="login-title">Link inválido</h1>
            {/* Mesma mensagem para link expirado, já usado ou inexistente: o
                motivo exato não ajuda quem tem direito, e ajuda quem não tem. */}
            <p className="login-sub">
              Este link expirou ou já foi usado. Peça um novo para redefinir sua senha.
            </p>
            <a href="/esqueci-senha" className="btn-link-primary">Pedir novo link</a>
          </>
        )}
      </div>
    </div>
  );
}
