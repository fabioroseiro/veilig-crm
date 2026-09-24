"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

export type Cartao = {
  id: string; nome: string; etapa: number; temperatura: string; porte: string; numLojas: number;
  responsavel: string | null; dias: number | null; potencial: number | null; ponderado: number | null;
  estrategico: boolean; origem: string | null; segmento: string | null; tarefas: number;
};
type Temps = Record<string, { nome: string; cor: string }>;

const brl = (v: number | null) => (v == null ? "—" : "R$ " + Math.round(v).toLocaleString("pt-BR"));

export function Kanban({ cartoes, etapas, temps, responsaveis, mover }: {
  cartoes: Cartao[]; etapas: { n: number; nome: string }[]; temps: Temps; responsaveis: string[];
  mover: (id: string, etapa: number) => Promise<void>;
}) {
  const [busca, setBusca] = useState("");
  const [porte, setPorte] = useState("");
  const [temp, setTemp] = useState("");
  const [resp, setResp] = useState("");
  const [origem, setOrigem] = useState("");
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<number | null>(null);
  const [local, setLocal] = useState<Record<string, number>>({});
  const [, iniciar] = useTransition();

  const origens = useMemo(() => [...new Set(cartoes.map((c) => c.origem).filter(Boolean))] as string[], [cartoes]);
  const filtrados = cartoes
    .map((c) => (local[c.id] ? { ...c, etapa: local[c.id] } : c))
    .filter((c) =>
      (!busca || c.nome.toLowerCase().includes(busca.toLowerCase())) && (!porte || c.porte === porte) &&
      (!temp || c.temperatura === temp) && (!resp || c.responsavel === resp) && (!origem || c.origem === origem));

  function soltar(etapa: number) {
    const id = arrastando;
    setAlvo(null); setArrastando(null);
    if (!id) return;
    const atual = filtrados.find((c) => c.id === id);
    if (!atual || atual.etapa === etapa) return;
    setLocal((l) => ({ ...l, [id]: etapa }));
    iniciar(() => mover(id, etapa));
  }

  const total = filtrados.reduce((s, c) => s + (c.ponderado ?? 0), 0);

  return (
    <>
      <div className="filtros">
        <input placeholder="Buscar grupo" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select value={porte} onChange={(e) => setPorte(e.target.value)}><option value="">Todos os portes</option><option value="A">A — 10+ lojas</option><option value="B">B — 4 a 9</option><option value="C">C — 1 a 3</option></select>
        <select value={temp} onChange={(e) => setTemp(e.target.value)}><option value="">Todas as temperaturas</option>{Object.entries(temps).map(([k, t]) => <option key={k} value={k}>{t.nome}</option>)}</select>
        <select value={resp} onChange={(e) => setResp(e.target.value)}><option value="">Todos os responsáveis</option>{responsaveis.map((r) => <option key={r}>{r}</option>)}</select>
        {origens.length > 1 && <select value={origem} onChange={(e) => setOrigem(e.target.value)}><option value="">Todas as origens</option>{origens.map((o) => <option key={o}>{o}</option>)}</select>}
        <span className="muted" style={{ alignSelf: "center" }}>{filtrados.length} leads · previsão ponderada {brl(total)}/mês</span>
      </div>
      <div className="kanban">
        {etapas.map((e) => {
          const lista = filtrados.filter((c) => c.etapa === e.n);
          const soma = lista.reduce((s, c) => s + (c.ponderado ?? 0), 0);
          return (
            <section key={e.n} className={`coluna ${alvo === e.n ? "alvo" : ""}`}
              onDragOver={(ev) => { ev.preventDefault(); setAlvo(e.n); }} onDragLeave={() => setAlvo(null)} onDrop={() => soltar(e.n)}>
              <h3>{e.n}. {e.nome} <span className="muted">({lista.length})</span></h3>
              <div className="soma">{brl(soma)}/mês ponderado</div>
              {lista.slice(0, 150).map((c) => {
                const t = temps[c.temperatura];
                return (
                  <Link key={c.id} href={`/grupos/${c.id}`} className="cartao" draggable
                    onDragStart={() => setArrastando(c.id)} onDragEnd={() => { setArrastando(null); setAlvo(null); }}>
                    <div className="nome">{c.nome}</div>
                    <div className="info">
                      <span className="tag porte">{c.porte}</span>
                      <span className="temp"><i style={{ background: t.cor }} />{t.nome}</span>
                      {c.estrategico && <span className="tag estr">Estratégico</span>}
                    </div>
                    <div className="info" style={{ marginTop: 6 }}>
                      <span>{c.numLojas} loja{c.numLojas > 1 ? "s" : ""}</span>
                      {c.potencial != null && <span>· {brl(c.potencial)}/mês</span>}
                      {c.responsavel && <span>· {c.responsavel.split(" ")[0]}</span>}
                    </div>
                    <div className="info" style={{ marginTop: 4 }}>
                      {c.dias != null && c.dias > 7 ? <span className="alerta">{c.dias} dias sem sinal</span> : c.dias != null ? <span>sinal há {c.dias} d</span> : <span>sem resposta ainda</span>}
                      {c.tarefas === 0 && c.etapa >= 2 && <span className="alerta">· sem próxima ação</span>}
                    </div>
                  </Link>
                );
              })}
              {lista.length > 150 && <p className="muted" style={{ fontSize: 12 }}>+ {lista.length - 150} leads. Use os filtros.</p>}
            </section>
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: 13 }}>Arraste um cartão para mudar a etapa. Ao chegar em Agenda marcada, o lead vira Quente; em Proposta enviada, passa para o closer.</p>
    </>
  );
}
