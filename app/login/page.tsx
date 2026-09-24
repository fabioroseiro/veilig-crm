import { FormAcao, Enviar } from "@/components/FormAcao";
import { entrar } from "@/lib/acesso";

export default function Login() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--ink)", padding: 20 }}>
      <div className="caixa" style={{ width: "100%", maxWidth: 380, padding: 28 }}>
        <div className="marca" style={{ margin: "0 0 20px" }}>
          <img src="/logo.png" alt="" /><span style={{ color: "var(--ink)" }}>VEILIG</span>
        </div>
        <h1>CRM</h1>
        <p className="muted" style={{ marginTop: 0 }}>Acesso restrito à equipe Veilig.</p>
        <FormAcao acao={entrar}>
          <label className="campo"><span>E-mail</span><input name="email" type="email" autoComplete="username" required /></label>
          <label className="campo"><span>Senha</span><input name="senha" type="password" autoComplete="current-password" required /></label>
          <Enviar>Entrar</Enviar>
        </FormAcao>
      </div>
    </main>
  );
}
