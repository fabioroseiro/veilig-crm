"use client";

import { useState } from "react";
import { criarCredencial } from "./actions";

export function NovaCredencial({
  grupos = [],
}: {
  /** Só a Veilig recebe a lista: o gestor cria sempre no próprio grupo. */
  grupos?: { id: string; nome: string }[];
}) {
  const [nome, setNome] = useState("");
  const [chave, setChave] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  // Começa no primeiro grupo, nunca em "todos": o alcance maior precisa ser
  // escolhido de propósito.
  const [grupo, setGrupo] = useState("");
  const [copiado, setCopiado] = useState(false);

  const criar = async () => {
    setCriando(true);
    setErro(null);
    const fd = new FormData();
    fd.set("nome", nome);
    if (grupos.length > 0) fd.set("grupo", grupo);
    const r = await criarCredencial(fd);
    if (r.ok && r.chave) {
      setChave(r.chave);
      setNome("");
    } else {
      setErro(r.message ?? "Não foi possível criar.");
    }
    setCriando(false);
  };

  // A chave aparece UMA vez. Guardamos só o hash, então ela não pode ser
  // consultada depois — quem perder, gera outra.
  if (chave) {
    return (
      <div
        style={{
          border: "2px solid #4ec3e0",
          background: "rgba(78,195,224,0.10)",
          borderRadius: 8,
          padding: "16px 18px",
          marginBottom: 18,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Chave criada</div>
        <p className="hint" style={{ marginTop: 0 }}>
          Copie agora. Ela aparece <strong>uma única vez</strong> — guardamos
          apenas o hash, então não há como consultá-la depois.
        </p>
        <div
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 14,
            wordBreak: "break-all",
            background: "var(--surface)",
            padding: "10px 12px",
            borderRadius: 6,
            marginBottom: 10,
          }}
        >
          {chave}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-primary"
            style={{ padding: "8px 16px" }}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(chave);
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2500);
              } catch {}
            }}
          >
            {copiado ? "Copiada!" : "Copiar chave"}
          </button>
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: "8px 16px" }}
            onClick={() => setChave(null)}
          >
            Já guardei
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="section-label">Nova integração</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: Check-list Rota K"
          aria-label="Nome da integração"
          style={{ flex: 1, minWidth: 220 }}
        />
        {grupos.length > 0 && (
          <select
            value={grupo}
            onChange={(e) => setGrupo(e.target.value)}
            aria-label="Grupo desta integração"
            style={{ width: "auto", minWidth: 200 }}
          >
            <option value="">Escolha o grupo…</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>{g.nome}</option>
            ))}
            <option value="todos">Todos os grupos (uso da Veilig)</option>
          </select>
        )}
        <button
          type="button"
          className="btn-primary"
          style={{ padding: "8px 16px" }}
          onClick={criar}
          disabled={criando || nome.trim().length < 3 || (grupos.length > 0 && !grupo)}
        >
          {criando ? "Criando…" : "Gerar chave"}
        </button>
      </div>
      <span className="hint">
        Um nome por sistema que consome — assim dá para revogar um sem derrubar
        os outros. A chave enxerga apenas os veículos do grupo escolhido;
        "todos os grupos" é para uso interno da Veilig.
      </span>
      {erro && <div className="banner banner-error" style={{ marginTop: 10 }}>{erro}</div>}
    </div>
  );
}
