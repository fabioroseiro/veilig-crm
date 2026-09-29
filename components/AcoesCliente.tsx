"use client";
import { useState } from "react";
import { FormAcao, Enviar } from "./FormAcao";
import { aceitarProposta, pedirPrazo } from "@/lib/acoes-proposta-cliente";

/** Aceitar a proposta ou pedir mais prazo, na página do cliente. */
export function AcoesCliente({ token, podeAceitar, contato, minData, sugestao, escolherOnboarding }: {
  token: string; podeAceitar: boolean; contato: { nome: string; cargo: string; email: string }; minData: string; sugestao: string;
  escolherOnboarding?: boolean;
}) {
  const [aba, setAba] = useState<"aceitar" | "prazo" | null>(null);
  return (
    <div className="caixa acoes-cliente">
      <h2>Como deseja seguir?</h2>
      <div className="linha">
        {podeAceitar && <button className={`btn ${aba === "aceitar" ? "btn-ink" : ""}`} onClick={() => setAba("aceitar")}>Aceitar proposta</button>}
        <button className={`btn ${aba === "prazo" ? "btn-ink" : ""}`} onClick={() => setAba("prazo")}>Preciso de mais prazo</button>
      </div>
      {aba === "aceitar" && (
        <FormAcao acao={aceitarProposta.bind(null, token)} className="grade" >
          <div className="grade g3" style={{ marginTop: 14 }}>
            <label className="campo"><span>Seu nome</span><input name="nome" required defaultValue={contato.nome} /></label>
            <label className="campo"><span>Cargo</span><input name="cargo" required defaultValue={contato.cargo} /></label>
            <label className="campo"><span>E-mail</span><input name="email" type="email" required defaultValue={contato.email} /></label>
          </div>
          {escolherOnboarding && (
            <fieldset className="escolha-onb">
              <legend>Formato de onboarding</legend>
              <label className="check"><input type="radio" name="onboarding" value="consultivo" required /> Consultivo: cerca de 6 semanas, com encontros presenciais nos marcos</label>
              <label className="check"><input type="radio" name="onboarding" value="online" /> Online: cerca de 3 semanas, por vídeo</label>
            </fieldset>
          )}
          <label className="check"><input type="checkbox" name="concordo" required /> Li e aceito as condições desta proposta, sujeitas à assinatura do contrato.</label>
          <div><Enviar>Confirmar aceite</Enviar></div>
        </FormAcao>
      )}
      {aba === "prazo" && (
        <FormAcao acao={pedirPrazo.bind(null, token)} className="grade">
          <div className="grade g2" style={{ marginTop: 14 }}>
            <label className="campo"><span>Seu nome</span><input name="nome" required defaultValue={contato.nome} /></label>
            <label className="campo"><span>Nova data sugerida</span><input name="data" type="date" required min={minData} defaultValue={sugestao} /></label>
          </div>
          <label className="campo"><span>Motivo (opcional)</span><textarea name="motivo" placeholder="Ex.: aguardando a reunião de diretoria" /></label>
          <div><Enviar>Enviar pedido</Enviar></div>
        </FormAcao>
      )}
    </div>
  );
}
