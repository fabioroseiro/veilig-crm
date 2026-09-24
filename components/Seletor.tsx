"use client";
import { useState, useTransition } from "react";

/** Select que chama uma ação do servidor ao mudar. */
export function Seletor({ valor, opcoes, acao, rotulo }: {
  valor: string; opcoes: { v: string; nome: string }[]; acao: (v: string) => Promise<void>; rotulo: string;
}) {
  const [atual, setAtual] = useState(valor);
  const [pendente, iniciar] = useTransition();
  return (
    <label className="campo"><span>{rotulo}{pendente ? " …" : ""}</span>
      <select value={atual} disabled={pendente} onChange={(e) => { const v = e.target.value; setAtual(v); iniciar(() => acao(v)); }}>
        {opcoes.map((o) => <option key={o.v} value={o.v}>{o.nome}</option>)}
      </select>
    </label>
  );
}

export function BotaoAcao({ acao, children, className = "btn btn-mini", confirmar }: {
  acao: () => Promise<void>; children: React.ReactNode; className?: string; confirmar?: string;
}) {
  const [pendente, iniciar] = useTransition();
  return (
    <button type="button" className={className} disabled={pendente}
      onClick={() => { if (!confirmar || confirm(confirmar)) iniciar(() => acao()); }}>{children}</button>
  );
}
