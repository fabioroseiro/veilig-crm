import { LoginClienteForm } from "./LoginClienteForm";
import { IconeVeilig } from "@/components/IconeVeilig";

export const dynamic = "force-dynamic";

export default function PortalLoginPage() {
  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <IconeVeilig tamanho={44} className="login-logo" />
          <span className="login-wordmark">VEILIG</span>
        </div>
        <h1 className="login-title">Área do cliente</h1>
        <p className="login-sub">
          Acompanhe seu plano de manutenção. Entre com seu CPF e senha.
        </p>
        <LoginClienteForm />
      </div>
    </div>
  );
}
