import { LoginForm } from "./LoginForm";
import { IconeVeilig } from "@/components/IconeVeilig";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <IconeVeilig tamanho={44} className="login-logo" />
          <span className="login-wordmark">VEILIG</span>
        </div>
        <h1 className="login-title">Entrar no painel</h1>
        <p className="login-sub">Acesse com seu e-mail e senha.</p>
        <LoginForm />
      </div>
    </div>
  );
}
