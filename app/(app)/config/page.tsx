import { lerConfig } from "@/lib/config";
import { salvarConfig, trocarSenha } from "@/lib/acoes";
import { FormAcao, Enviar } from "@/components/FormAcao";

export const dynamic = "force-dynamic";

export default async function Config() {
  const cfg = await lerConfig();
  return (
    <>
      <div className="topo"><div><h1>Configurações</h1></div></div>
      <div className="grade g2" style={{ alignItems: "start" }}>
        <div className="caixa">
          <h2>Pacotes e regras</h2>
          <FormAcao acao={salvarConfig}>
            <p className="muted" style={{ marginTop: 0 }}>Preço recorrente por loja/mês. É a base do potencial e da previsão do funil. Deixe em branco o pacote sem preço definido.</p>
            <div className="grade g3">
              <label className="campo"><span>Essencial (R$)</span><input name="essencial" type="number" min={0} defaultValue={cfg.precos.essencial ?? ""} required /></label>
              <label className="campo"><span>Performance (R$)</span><input name="performance" type="number" min={0} defaultValue={cfg.precos.performance ?? ""} /></label>
              <label className="campo"><span>Completo (R$)</span><input name="completo" type="number" min={0} defaultValue={cfg.precos.completo ?? ""} /></label>
            </div>
            <label className="campo"><span>Lojas do piloto (porte A)</span><input name="lojas_piloto" type="number" min={1} defaultValue={cfg.lojas_piloto} /></label>
            <label className="campo"><span>E-mail do closer (recebe os leads a partir de Proposta enviada)</span><input name="closer_email" type="email" defaultValue={cfg.closer_email} /></label>
            <label className="campo"><span>Domínios de e-mail excluídos da importação</span><input name="dominios_excluidos" defaultValue={cfg.dominios_excluidos.join(", ")} /></label>
            <Enviar>Salvar</Enviar>
          </FormAcao>
        </div>
        <div className="caixa">
          <h2>Minha senha</h2>
          <FormAcao acao={trocarSenha} limpar>
            <label className="campo"><span>Senha atual</span><input name="atual" type="password" autoComplete="current-password" required /></label>
            <label className="campo"><span>Nova senha (mínimo 10 caracteres)</span><input name="nova" type="password" minLength={10} autoComplete="new-password" required /></label>
            <Enviar>Trocar senha</Enviar>
          </FormAcao>
        </div>
      </div>
    </>
  );
}
