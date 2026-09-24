"use client";
import Link from "next/link";
import { useState, useTransition } from "react";

type L = { id: string; nome: string; porte: string; lojas: number; contato: string | null; email: string | null; whatsapp?: string | null; origem: string | null };

export function Elegiveis({ leads, iniciar, nome = "Frio" }: { leads: L[]; iniciar: (ids: string[]) => Promise<{ ok: string }>; nome?: string }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [porte, setPorte] = useState("");
  const [msg, setMsg] = useState("");
  const [pendente, iniciarT] = useTransition();
  const lista = leads.filter((l) => !porte || l.porte === porte);
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const primeiros = (n: number) => setSel(new Set(lista.slice(0, n).map((l) => l.id)));

  return (
    <>
      <div className="filtros">
        <select value={porte} onChange={(e) => { setPorte(e.target.value); setSel(new Set()); }}>
          <option value="">Todos os portes</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>
        </select>
        <button className="btn btn-mini" type="button" onClick={() => primeiros(10)}>Selecionar 10</button>
        <button className="btn btn-mini" type="button" onClick={() => primeiros(30)}>Selecionar 30</button>
        <button className="btn btn-mini" type="button" onClick={() => setSel(new Set())}>Limpar</button>
        <button className="btn btn-ink" type="button" disabled={pendente || sel.size === 0}
          onClick={() => { if (confirm(`Iniciar a cadência ${nome} para ${sel.size} lead(s)? O primeiro toque acontece na próxima rodada, se o envio automático estiver ligado.`)) iniciarT(async () => { const r = await iniciar([...sel]); setMsg(r.ok); setSel(new Set()); }); }}>
          {pendente ? "Iniciando…" : `Iniciar cadência para ${sel.size}`}
        </button>
      </div>
      {msg && <div className="aviso ok">{msg}</div>}
      <div className="rolagem" style={{ maxHeight: 480, overflowY: "auto" }}>
        <table>
          <thead><tr><th></th><th>Grupo</th><th>Porte</th><th>Contato</th><th>E-mail / WhatsApp</th><th>Origem</th></tr></thead>
          <tbody>{lista.map((l) => (
            <tr key={l.id}>
              <td><input type="checkbox" checked={sel.has(l.id)} onChange={() => alternar(l.id)} /></td>
              <td><Link href={`/grupos/${l.id}`}>{l.nome}</Link></td>
              <td>{l.porte} · {l.lojas}</td><td>{l.contato ?? "—"}</td><td style={{ fontSize: 13 }}>{l.email ?? (l.whatsapp ? `WhatsApp +${l.whatsapp}` : "—")}</td>
              <td>{l.origem ?? <span className="alerta">sem origem</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}
