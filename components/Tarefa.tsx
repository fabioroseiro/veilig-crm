"use client";
import Link from "next/link";
import { FormAcao, Enviar } from "./FormAcao";

type Props = {
  id: string; titulo: string; tipo: string; tipoNome: string; vence: string; vencida: boolean;
  grupoId: string; grupo: string; contato: string | null; zap: string | null; texto: string | null;
  responsavel?: string | null;
  concluir: (e: unknown, f: FormData) => Promise<{ ok?: string; erro?: string }>;
  emailStatus?: string | null;
  salvarEmail?: (e: unknown, f: FormData) => Promise<{ ok?: string; erro?: string }>;
  adiar1: () => Promise<void>; adiar3: () => Promise<void>; excluir: () => Promise<void>;
};

const LEMBRETE: Record<string, string> = {
  ausente: "Este lead não tem e-mail cadastrado. Aproveite o contato para pedir o e-mail do responsável.",
  corrigir: "O e-mail cadastrado parece ter erro de digitação. Confirme o endereço com o lead.",
  devolvido: "O último e-mail para este lead voltou. Confirme o endereço correto com ele.",
};

export function Tarefa(p: Props) {
  const lembrete = p.emailStatus ? LEMBRETE[p.emailStatus] : null;
  return (
    <div className="tarefa">
      <div>
        <div className="tit">{p.titulo}</div>
        <div className="meta">
          <Link href={`/grupos/${p.grupoId}`}>{p.grupo}</Link>
          {p.contato ? ` · ${p.contato}` : ""} · {p.tipoNome} · <span className={p.vencida ? "vencida" : ""}>{p.vencida ? `venceu ${p.vence}` : `hoje`}</span>
          {p.responsavel ? ` · ${p.responsavel}` : ""}
        </div>
        {p.texto && <div className="msg">{p.texto}</div>}
        {lembrete && p.salvarEmail && (
          <div className="aviso atencao" style={{ marginTop: 8 }}>
            <strong>Peça o e-mail.</strong> {lembrete} Sem e-mail, este lead só recebe os toques de WhatsApp e ligação da cadência.
            <FormAcao acao={p.salvarEmail} className="linha" limpar>
              <input name="email" type="email" placeholder="email@concessionaria.com.br" style={{ flex: "1 1 240px", marginTop: 8 }} />
              <div style={{ marginTop: 8 }}><Enviar className="btn btn-mini btn-ink">Salvar e-mail</Enviar></div>
            </FormAcao>
          </div>
        )}
      </div>
      <div className="linha" style={{ alignItems: "flex-start" }}>
        {p.zap && <a className="btn btn-zap btn-mini" href={p.zap} target="_blank" rel="noopener">WhatsApp</a>}
        <form action={p.adiar1}><button className="btn btn-mini" type="submit">+1 dia</button></form>
        <form action={p.adiar3}><button className="btn btn-mini" type="submit">+3 dias</button></form>
      </div>
      <details>
        <summary>Concluir e registrar o resultado</summary>
        <FormAcao acao={p.concluir} className="caixa" >
          <label className="campo"><span>O que aconteceu?</span><textarea name="resultado" placeholder="Ex.: mandei a mensagem; atendeu e pediu retorno na sexta" /></label>
          <label className="check" style={{ marginBottom: 10 }}><input type="checkbox" name="respondeu" /> O lead respondeu (volta a ficar Quente)</label>
          <div className="linha" style={{ marginBottom: 10 }}>
            <input name="proxima" placeholder="Próxima ação (opcional)" style={{ flex: "1 1 240px" }} />
            <select name="proxima_tipo" defaultValue="whatsapp" style={{ width: 130 }}>
              <option value="whatsapp">WhatsApp</option><option value="ligacao">Ligação</option><option value="email">E-mail</option><option value="outro">Ação</option>
            </select>
            <select name="proxima_dias" defaultValue="3" style={{ width: 120 }}>
              <option value="1">em 1 dia</option><option value="2">em 2 dias</option><option value="3">em 3 dias</option>
              <option value="5">em 5 dias</option><option value="7">em 7 dias</option><option value="14">em 14 dias</option><option value="30">em 30 dias</option>
            </select>
          </div>
          <div className="linha">
            <Enviar>Concluir</Enviar>
            <button className="btn btn-perigo btn-mini" type="button" onClick={() => { if (confirm("Excluir esta ação sem registrar?")) p.excluir(); }}>Excluir ação</button>
          </div>
        </FormAcao>
      </details>
    </div>
  );
}
