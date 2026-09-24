import { FormAcao, Enviar } from "@/components/FormAcao";
import { primeiroAcesso } from "@/lib/acesso";

export default function PrimeiroAcesso() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--ink)", padding: 20 }}>
      <div className="caixa" style={{ width: "100%", maxWidth: 420, padding: 28 }}>
        <h1>Primeiro acesso</h1>
        <p className="muted" style={{ marginTop: 0 }}>Cria o acesso de um usuário. Use o código de configuração definido na Vercel (SETUP_TOKEN). Cada pessoa escolhe a própria senha.</p>
        <FormAcao acao={primeiroAcesso} limpar>
          <label className="campo"><span>Código de configuração</span><input name="token" type="password" required /></label>
          <label className="campo"><span>Nome</span><input name="nome" required /></label>
          <label className="campo"><span>E-mail</span><input name="email" type="email" required /></label>
          <label className="campo"><span>Senha (mínimo 10 caracteres)</span><input name="senha" type="password" minLength={10} autoComplete="new-password" required /></label>
          <Enviar>Criar acesso</Enviar>
        </FormAcao>
        <p style={{ fontSize: 13 }}><a href="/login">Ir para o login</a></p>
      </div>
    </main>
  );
}
