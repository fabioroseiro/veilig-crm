"use client";

import { useState } from "react";
import { analisarModelos, importarModelos } from "./importar-actions";
import { CATEGORIAS } from "@/lib/vehicle-model-validation";
import type { ResultadoLeitura } from "@/lib/importar-modelos";

/**
 * Importação de modelos em massa.
 *
 * Colar em vez de anexar arquivo: copiando colunas do Excel, o texto vem
 * separado por tabulação — o mesmo formato serve para quem digita à mão. Evita
 * upload, encoding e formato de planilha para resolver um problema que é, no
 * fundo, texto.
 *
 * Fabricante e categoria ficam FORA da lista porque cada leva é de uma
 * montadora só. Repetir "Kawasaki" em 40 linhas seria digitação inútil.
 */
export function ImportarModelos({ fabricantes }: { fabricantes: string[] }) {
  const [aberto, setAberto] = useState(false);
  const [fabricante, setFabricante] = useState("");
  const [novoFabricante, setNovoFabricante] = useState("");
  const [categoria, setCategoria] = useState("moto");
  const [texto, setTexto] = useState("");
  const [analise, setAnalise] = useState<(ResultadoLeitura & { erro?: string }) | null>(null);
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const fabricanteFinal = (fabricante === "__novo__" ? novoFabricante : fabricante).trim();

  const analisar = async () => {
    setProcessando(true);
    setResultado(null);
    try {
      setAnalise(await analisarModelos(texto, fabricanteFinal));
    } finally {
      setProcessando(false);
    }
  };

  const confirmar = async () => {
    setProcessando(true);
    try {
      const r = await importarModelos(texto, fabricanteFinal, categoria);
      if (r.ok) {
        setResultado(`${r.inseridos} modelo(s) importado(s).`);
        setTexto("");
        setAnalise(null);
      } else {
        setResultado(r.message ?? "Não foi possível importar.");
      }
    } finally {
      setProcessando(false);
    }
  };

  if (!aberto) {
    return (
      <button
        type="button"
        className="btn-ghost"
        style={{ padding: "10px 18px", marginBottom: 16 }}
        onClick={() => setAberto(true)}
      >
        Importar vários modelos
      </button>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="section-label">Importar vários modelos</div>
      <p className="hint" style={{ marginTop: 0 }}>
        Cole a lista de modelos, um por linha. Copiando do Excel, as colunas já
        vêm separadas — a primeira é o modelo, a segunda (opcional) é a versão.
      </p>

      <div className="grid">
        <div className="field col-1">
          <label htmlFor="fabImport">Fabricante</label>
          <select
            id="fabImport"
            value={fabricante}
            onChange={(e) => { setFabricante(e.target.value); setAnalise(null); }}
          >
            <option value="" disabled>Selecione…</option>
            {fabricantes.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
            <option value="__novo__">+ Outro fabricante…</option>
          </select>
        </div>

        {fabricante === "__novo__" && (
          <div className="field col-1">
            <label htmlFor="novoFab">Nome do fabricante</label>
            <input
              id="novoFab"
              value={novoFabricante}
              onChange={(e) => { setNovoFabricante(e.target.value); setAnalise(null); }}
              placeholder="Ex.: Kawasaki"
            />
          </div>
        )}

        <div className="field col-1">
          <label htmlFor="catImport">Categoria</label>
          <select id="catImport" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIAS.map((c) => (
              <option key={c.valor} value={c.valor}>{c.rotulo}</option>
            ))}
          </select>
          <span className="hint">Vale para todos os modelos desta lista.</span>
        </div>
      </div>

      <div className="field">
        <label htmlFor="textoImport">Modelos</label>
        <textarea
          id="textoImport"
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setAnalise(null); }}
          rows={10}
          placeholder={"Ninja 400\nNinja 500\tABS\nZ900\nVersys 650"}
          style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}
        />
      </div>

      {analise?.erro && <div className="banner banner-error">{analise.erro}</div>}
      {resultado && (
        <div className={resultado.includes("importado") ? "banner banner-success" : "banner banner-error"}>
          {resultado}
        </div>
      )}

      {/* Pré-visualização: mostra o que o sistema entendeu ANTES de gravar. */}
      {analise && !analise.erro && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
            <span><strong>{analise.novos.length}</strong> a importar</span>
            {analise.duplicados.length > 0 && (
              <span className="store-sub">{analise.duplicados.length} já existem</span>
            )}
            {analise.invalidos.length > 0 && (
              <span style={{ color: "var(--danger)" }}>{analise.invalidos.length} com erro</span>
            )}
          </div>

          {analise.novos.length > 0 && (
            <div className="table-wrap" style={{ maxHeight: 260, overflowY: "auto" }}>
              <table className="list">
                <thead>
                  <tr><th>Modelo</th><th>Versão</th></tr>
                </thead>
                <tbody>
                  {analise.novos.map((m) => (
                    <tr key={m.linha}>
                      <td>{m.modelo}</td>
                      <td className="store-sub">{m.versao || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {[...analise.duplicados, ...analise.invalidos].length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", fontSize: 14 }}>
                Ver as {analise.duplicados.length + analise.invalidos.length} linhas que
                não serão importadas
              </summary>
              <ul style={{ marginTop: 8, paddingLeft: 20, fontSize: 13 }}>
                {[...analise.duplicados, ...analise.invalidos].map((m) => (
                  <li key={`${m.linha}-${m.modelo}`} className="store-sub">
                    Linha {m.linha}: {m.modelo || "(vazio)"}
                    {m.versao ? ` ${m.versao}` : ""} — {m.erro}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {!analise || analise.erro ? (
          <button
            type="button"
            className="btn-primary"
            style={{ padding: "10px 18px" }}
            onClick={analisar}
            disabled={processando || !texto.trim() || !fabricanteFinal}
          >
            {processando ? "Analisando…" : "Analisar lista"}
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary"
            style={{ padding: "10px 18px" }}
            onClick={confirmar}
            disabled={processando || analise.novos.length === 0}
          >
            {processando ? "Importando…" : `Importar ${analise.novos.length} modelo(s)`}
          </button>
        )}
        <button
          type="button"
          className="btn-ghost"
          style={{ padding: "10px 18px" }}
          onClick={() => { setAberto(false); setAnalise(null); setResultado(null); }}
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
