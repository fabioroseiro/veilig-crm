"use client";
import { useState, useTransition } from "react";

/**
 * Etapa do funil com o portão de qualificação: ao avançar para Agenda marcada (ou além)
 * sem os critérios obrigatórios, pede uma justificativa curta antes de confirmar.
 */
export function SeletorEtapa({ valor, opcoes, faltando, portao, acao }: {
  valor: number; opcoes: { v: number; nome: string }[]; faltando: string[]; portao: number;
  acao: (etapa: number, justificativa?: string) => Promise<void>;
}) {
  const [atual, setAtual] = useState(valor);
  const [pedindo, setPedindo] = useState<number | null>(null);
  const [just, setJust] = useState("");
  const [pendente, iniciar] = useTransition();
  const mudar = (v: number, j?: string) => { setAtual(v); setPedindo(null); setJust(""); iniciar(() => acao(v, j)); };

  return (
    // Com o aviso aberto, ocupa a linha inteira da grade para o texto respirar.
    <div style={pedindo != null ? { gridColumn: "1 / -1" } : undefined}>
      <label className="campo"><span>Etapa{pendente ? " …" : ""}</span>
        <select value={pedindo ?? atual} disabled={pendente} onChange={(e) => {
          const v = Number(e.target.value);
          if (v >= portao && atual < portao && faltando.length) setPedindo(v); else mudar(v);
        }}>
          {opcoes.map((o) => <option key={o.v} value={o.v}>{o.nome}</option>)}
        </select>
      </label>
      {pedindo != null && (
        <div className="aviso atencao portao">
          <strong>Qualificação incompleta.</strong> Falta: {faltando.join(", ")}. Dá para seguir, mas registre o motivo.
          <textarea value={just} onChange={(e) => setJust(e.target.value)} placeholder="Ex.: diretor pediu a reunião direto; vamos qualificar nela" />
          <div className="linha">
            <button type="button" className="btn btn-mini btn-ink" disabled={just.trim().length < 5} onClick={() => mudar(pedindo, just)}>Avançar mesmo assim</button>
            <button type="button" className="btn btn-mini" onClick={() => { setPedindo(null); setJust(""); }}>Voltar e qualificar</button>
          </div>
        </div>
      )}
    </div>
  );
}
