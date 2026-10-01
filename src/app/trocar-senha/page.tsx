import { TrocarSenhaForm } from "./TrocarSenhaForm";
import { IconeVeilig } from "@/components/IconeVeilig";

export const dynamic = "force-dynamic";

export default function TrocarSenhaPage() {
  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <IconeVeilig tamanho={44} className="login-logo" />
          <span className="login-wordmark">VEILIG</span>
        </div>
        <h1 className="login-title">Defina sua nova senha</h1>
        <p className="login-sub">
          Este é seu primeiro acesso. Por segurança, escolha uma nova senha para
          continuar.
        </p>
        <TrocarSenhaForm />
      </div>
    </div>
  );
}
