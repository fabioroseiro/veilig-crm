"use client";

import { useState } from "react";
import { registrarPassagem } from "./actions";

type Passagem = {
  id: string;
  observacao: string;
  createdAt: Date | string;
  registradoPor: string | null;
};

function fmt(d: Date | string) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Contador de passagens do cliente pela loja.
 *
 * Fica na ficha do cliente porque é onde o consultor já está: ele consulta o
 * status antes de atender. Um formulário em outro lugar não seria preenchido.
 *
 * A observação é opcional e livre de propósito — o consultor vai querer anotar
 * "veio trocar óleo", e sem um campo para isso a informação se perde. Quando o
 * pós-venda for estruturado, esses textos mostram quais motivos realmente
 * aparecem, em vez de a gente adivinhar a lista agora.
 */
export function PassagemLoja({
  subscriptionId,
  passagensIniciais,
}: {
  subscriptionId: string;
  passagensIniciais: Passagem[];
}) {
  const [passagens, setPassagens] = useState<Passagem[]>(passagensIniciais);
  const [aberto, setAberto] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const registrar = async () => {
    setSalvando(true);
    setErro(null);
    const r = await registrarPassagem(subscriptionId, observacao);
    setSalvando(false);
    if (!r.ok) {
      setErro(r.message ?? "Não foi possível registrar.");
      return;
    }
    // Otimista: a lista completa vem do servidor no próximo carregamento.
    setPassagens((p) => [
      { id: crypto.randomUUID(), observacao, createdAt: new Date(), registradoPor: "você" },
      ...p,
    ]);
    setObservacao("");
    setAberto(false);
  };

  const ultima = passagens[0];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <strong style={{ fontSize: 20 }}>{passagens.length}</strong>
        <span>
          {passagens.length === 1 ? "passagem registrada" : "passagens registradas"}
        </span>
        {ultima && (
          <span className="store-sub" style={{ fontSize: 13 }}>
            · última em {fmt(ultima.createdAt)}
          </span>
        )}
      </div>

      {erro && <div className="banner banner-error">{erro}</div>}

      {aberto ? (
        <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px" }}>
          <div className="field" style={{ marginBottom: 10 }}>
            <label htmlFor="obsPassagem">Observação (opcional)</label>
            <input
              id="obsPassagem"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value.slice(0, 500))}
              placeholder="Ex.: veio para revisão de 10.000 km"
              autoFocus
            />
            <span className="hint">Anote o motivo, se achar útil. Não é obrigatório.</span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="btn-primary"
              style={{ padding: "8px 16px" }}
              onClick={registrar}
              disabled={salvando}
            >
              {salvando ? "Registrando…" : "Confirmar passagem"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: "8px 16px" }}
              onClick={() => setAberto(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn-primary"
          style={{ padding: "10px 18px" }}
          onClick={() => setAberto(true)}
        >
          + Registrar passagem na loja
        </button>
      )}

      {passagens.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <table className="list">
            <thead>
              <tr>
                <th>Data</th>
                <th>Observação</th>
                <th className="col-hide-sm">Registrado por</th>
              </tr>
            </thead>
            <tbody>
              {passagens.slice(0, 10).map((p) => (
                <tr key={p.id}>
                  <td>{fmt(p.createdAt)}</td>
                  <td className="store-sub">{p.observacao || "—"}</td>
                  <td className="col-hide-sm store-sub">{p.registradoPor ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {passagens.length > 10 && (
            <p className="hint" style={{ marginTop: 6 }}>
              Mostrando as 10 mais recentes de {passagens.length}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
