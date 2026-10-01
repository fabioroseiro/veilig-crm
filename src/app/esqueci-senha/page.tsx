import { IconeVeilig } from "@/components/IconeVeilig";
import { EsqueciForm } from "./EsqueciForm";

export const dynamic = "force-dynamic";

export default function EsqueciSenhaPage() {
  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <IconeVeilig tamanho={44} className="login-logo" />
          <span className="login-wordmark">VEILIG</span>
        </div>
        <h1 className="login-title">Esqueci minha senha</h1>
        <p className="login-sub">Enviamos um link para você criar uma nova.</p>
        <EsqueciForm />
      </div>
    </div>
  );
}
