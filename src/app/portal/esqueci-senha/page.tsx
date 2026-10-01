import { IconeVeilig } from "@/components/IconeVeilig";
import { EsqueciClienteForm } from "./EsqueciClienteForm";

export const dynamic = "force-dynamic";

export default function PortalEsqueciSenhaPage() {
  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <IconeVeilig tamanho={44} className="login-logo" />
          <span className="login-wordmark">VEILIG</span>
        </div>
        <h1 className="login-title">Esqueci minha senha</h1>
        {/* O cliente entra por CPF, então pede por CPF — e a tela diz para
            qual e-mail o link foi, mascarado. */}
        <p className="login-sub">Informe seu CPF e enviaremos um link para o e-mail do seu cadastro.</p>
        <EsqueciClienteForm />
      </div>
    </div>
  );
}
