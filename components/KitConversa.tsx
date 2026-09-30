"use client";
import { useState } from "react";
import { EVITE, FONTE, INDICADORES, OBJECOES, PERGUNTAS, PITCH, PITCH_APOIO, PITCH_RESPOSTAS, PODE, WHATSAPP, type Segmento } from "@/lib/argumentos";

type Lead = { grupo: string; nome: string | null; whatsapp: string | null; segmento: string | null } | null;

const primeiroNome = (n: string | null) => {
  const p = (n || "").trim().split(/\s+/)[0] || "";
  return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : "";
};

/** Mostra os marcadores que faltam completar ([dia], [hora]…) em destaque. */
function ComMarcadores({ texto }: { texto: string }) {
  return <>{texto.split(/(\[[^\]]+\])/).map((t, i) => (/^\[.+\]$/.test(t) ? <mark key={i}>{t}</mark> : <span key={i}>{t}</span>))}</>;
}

function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="btn btn-mini" onClick={async () => {
      try { await navigator.clipboard.writeText(texto); } catch { /* navegador sem permissão: o texto continua na tela */ }
      setOk(true); setTimeout(() => setOk(false), 1500);
    }}>{ok ? "Copiado" : "Copiar"}</button>
  );
}

const SECOES = [
  ["pitch", "Pitch por telefone"], ["perguntas", "Perguntas"], ["dados", "Dados"], ["whatsapp", "WhatsApp"], ["objecoes", "Objeções"], ["regras", "Pode / evite"],
] as const;

export function KitConversa({ eu, lead }: { eu: string; lead: Lead }) {
  const [seg, setSeg] = useState<Segmento>(lead?.segmento && lead.segmento !== "motos" ? "outros" : "motos");
  const preencher = (t: string) => t
    .replace(/\[Nome\]/g, primeiroNome(lead?.nome ?? null) || "[Nome]")
    .replace(/\[Grupo\]/g, lead?.grupo || "[Grupo]")
    .replace(/\[Eu\]/g, eu);
  const zap = (t: string) => `https://wa.me/${lead?.whatsapp ?? ""}?text=${encodeURIComponent(t)}`;

  return (
    <div className="kit">
      <nav className="kit-nav" aria-label="Seções">
        {SECOES.map(([id, nome]) => <a key={id} href={`#${id}`}>{nome}</a>)}
      </nav>
      <p className="muted kit-fonte">Fonte dos dados: {FONTE}.</p>

      <section id="pitch" className="caixa">
        <div className="linha" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Pitch por telefone (30 segundos)</h2>
          <div className="abas-mini" role="tablist">
            <button type="button" role="tab" aria-selected={seg === "motos"} className={seg === "motos" ? "ativa" : ""} onClick={() => setSeg("motos")}>Motos</button>
            <button type="button" role="tab" aria-selected={seg === "outros"} className={seg === "outros" ? "ativa" : ""} onClick={() => setSeg("outros")}>Carros e outros</button>
          </div>
        </div>
        {seg === "outros" && <div className="aviso atencao">Os dados são de concessionárias de motos. Para carros e outros segmentos, apresente como caso de motos e não projete os percentuais.</div>}
        <ol className="kit-pitch">
          {PITCH[seg].map((e) => (
            <li key={e.rotulo}><strong>{e.rotulo}</strong><p><ComMarcadores texto={preencher(e.texto)} /></p>
              {e.rotulo === "Pergunta" && (
                <div className="kit-ramos">
                  {PITCH_RESPOSTAS.map((r) => <div key={r.rotulo}><strong>{r.rotulo}</strong><p>{r.texto}</p></div>)}
                </div>
              )}
            </li>
          ))}
        </ol>
        <div className="linha"><Copiar texto={PITCH[seg].map((e) => preencher(e.texto)).join("\n\n")} /></div>
        <div className="kit-apoio">
          {PITCH_APOIO.map((e) => <div key={e.rotulo}><strong>{e.rotulo}</strong><p>{e.texto}</p></div>)}
        </div>
      </section>

      <section id="perguntas" className="caixa">
        <h2>Perguntas de diagnóstico</h2>
        <p className="muted" style={{ marginTop: -6 }}>Pergunte o número do lead antes de mostrar o nosso. Anote as respostas no diagnóstico da ficha.</p>
        <ul className="kit-lista">{PERGUNTAS.map((p) => <li key={p}>{p}</li>)}</ul>
      </section>

      <section id="dados" className="caixa">
        <h2>Os dados</h2>
        <div className="kit-cartoes">
          {INDICADORES.map((i) => (
            <div key={i.n} className="kit-cartao">
              <div className="kit-num">{i.numero}</div>
              <div className="kit-tit">{i.titulo}</div>
              {i.comparacao && <div className="kit-comp">{i.comparacao}</div>}
              <p>{i.frase}</p>
              <div className="linha" style={{ justifyContent: "space-between" }}>
                <span className="muted" style={{ fontSize: 12 }}>{i.base}</span>
                <Copiar texto={i.frase} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="whatsapp" className="caixa">
        <h2>Mensagens de WhatsApp</h2>
        {!lead?.whatsapp && <p className="muted" style={{ marginTop: -6 }}>{lead ? "O contato principal não tem WhatsApp cadastrado: o botão abre o WhatsApp para você escolher o contato." : "Sem lead selecionado: o botão abre o WhatsApp para você escolher o contato."}</p>}
        <div className="kit-msgs">
          {WHATSAPP.map((m) => {
            const t = preencher(m.texto);
            return (
              <div key={m.id} className="kit-msg">
                <div><strong>{m.titulo}</strong><div className="muted" style={{ fontSize: 12 }}>{m.quando}</div></div>
                <div className="kit-texto"><ComMarcadores texto={t} /></div>
                <div className="linha">
                  <Copiar texto={t} />
                  <a className="btn btn-zap btn-mini" href={zap(t)} target="_blank" rel="noopener">Abrir no WhatsApp</a>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section id="objecoes" className="caixa">
        <h2>Objeções</h2>
        {OBJECOES.map((o) => (
          <details key={o.objecao} className="kit-obj">
            <summary><strong>{o.objecao}</strong>{o.dado && <span className="tag" style={{ marginLeft: 8 }}>{o.dado}</span>}</summary>
            <p>{o.resposta}</p>
            <Copiar texto={o.resposta} />
          </details>
        ))}
      </section>

      <section id="regras" className="caixa">
        <h2>Pode dizer / evite dizer</h2>
        <div className="grade g2">
          <div><h3 className="kit-pode">Pode dizer</h3><ul className="kit-lista">{PODE.map((p) => <li key={p}>{p}</li>)}</ul></div>
          <div><h3 className="kit-evite">Evite dizer</h3><ul className="kit-lista">{EVITE.map((p) => <li key={p}>{p}</li>)}</ul></div>
        </div>
      </section>
    </div>
  );
}
