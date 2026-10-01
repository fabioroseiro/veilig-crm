"use client";

import { useActionState, useState } from "react";
import { aplicarReajustes, type ResultadoReajuste } from "./actions";

const inicial: ResultadoReajuste = { ok: false, message: "" };

export type LinhaReajuste = {
  id: string;
  contrato: string | null;
  cliente: string;
  email: string | null;
  veiculo: string;
  plano: string | null;
  loja: string | null;
  precoAtual: number;
  aniversario: string;
  jaVenceu: boolean;
};

const brl = (n: number) => "R$ " + n.toFixed(2).replace(".", ",");
const data = (d: string) => String(d).slice(0, 10).split("-").reverse().join("/");

export function ReajusteForm({
  linhas,
  grupoId,
  indice,
  teto,
}: {
  linhas: LinhaReajuste[];
  grupoId: string;
  indice: string | null;
  teto: number | null;
}) {
  const [percentual, setPercentual] = useState("");
  const [marcados, setMarcados] = useState<string[]>(linhas.map((l) => l.id));
  const [state, action, pending] = useActionState(
    async (_: ResultadoReajuste, fd: FormData) => aplicarReajustes(fd),
    inicial
  );

  const pct = Number(percentual.replace(/\./g, "").replace(",", ".")) || 0;
  const efetivo = teto != null ? Math.min(pct, teto) : pct;
  const novo = (v: number) => Math.round(v * (1 + efetivo / 100) * 100) / 100;

  if (state.message && state.ok) {
    return (
      <>
        <div className="banner banner-success" style={{ marginBottom: 12 }}>{state.message}</div>
        {state.detalhes && state.detalhes.length > 0 && (
          <div className="banner banner-error">
            <strong>Pontos de atenção:</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
              {state.detalhes.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          </div>
        )}
      </>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="grupoId" value={grupoId} />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="field" style={{ maxWidth: 260 }}>
          <label htmlFor="percentual">
            Percentual acumulado {indice ? `(${indice})` : ""}
          </label>
          <input
            id="percentual"
            name="percentual"
            inputMode="decimal"
            value={percentual}
            onChange={(e) => setPercentual(e.target.value)}
            placeholder="4,50"
          />
          <span className="hint">
            {teto != null
              ? `O contrato limita a ${teto.toFixed(2).replace(".", ",")}% ao ano. Acima disso, aplicamos o teto.`
              : "Informe o acumulado dos últimos 12 meses."}
          </span>
        </div>
        {teto != null && pct > teto && (
          <div className="banner" style={{ background: "rgba(184,134,11,.10)", borderLeft: "3px solid #b8860b" }}>
            Acima do teto do contrato: será aplicado <strong>{teto.toFixed(2).replace(".", ",")}%</strong>.
          </div>
        )}
      </div>

      {state.message && !state.ok && (
        <div className="banner banner-error" style={{ marginBottom: 12 }}>{state.message}</div>
      )}

      <div className="table-wrap">
        <table className="list">
          <thead>
            <tr>
              <th style={{ width: 36 }}></th>
              <th>Cliente</th>
              <th className="col-hide-sm">Veículo</th>
              <th className="col-hide-sm">Aniversário</th>
              <th>Hoje</th>
              <th>Novo valor</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <td>
                  <input
                    type="checkbox"
                    name="assinatura"
                    value={l.id}
                    checked={marcados.includes(l.id)}
                    onChange={(e) =>
                      setMarcados((m) =>
                        e.target.checked ? [...m, l.id] : m.filter((x) => x !== l.id)
                      )
                    }
                    aria-label={`Reajustar ${l.cliente}`}
                  />
                </td>
                <td>
                  {l.cliente}
                  <div className="store-sub" style={{ fontSize: 12 }}>
                    {l.contrato ?? ""} · {l.plano ?? ""}
                    {!l.email && " · sem e-mail no cadastro"}
                  </div>
                </td>
                <td className="col-hide-sm store-sub">{l.veiculo}</td>
                <td className="col-hide-sm">
                  {data(l.aniversario)}
                  {l.jaVenceu && (
                    <div style={{ color: "var(--danger)", fontSize: 12 }}>já venceu</div>
                  )}
                </td>
                <td>{brl(l.precoAtual)}</td>
                <td>
                  {efetivo > 0 ? (
                    <strong>{brl(novo(l.precoAtual))}</strong>
                  ) : (
                    <span className="store-sub">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="submit"
          className="btn-primary"
          style={{ padding: "10px 20px" }}
          disabled={pending || efetivo <= 0 || marcados.length === 0}
        >
          {pending ? "Aplicando…" : `Aplicar a ${marcados.length} assinatura(s)`}
        </button>
        <span className="hint" style={{ margin: 0 }}>
          O cliente recebe um e-mail com o valor novo. O reajuste vale da próxima
          cobrança em diante.
        </span>
      </div>
    </form>
  );
}
