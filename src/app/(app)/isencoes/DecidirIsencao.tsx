"use client";

import { useState } from "react";
import { decidirIsencao } from "./actions";

export function DecidirIsencao({ id }: { id: string }) {
  const [obs, setObs] = useState("");
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const decidir = async (aprovar: boolean) => {
    setProcessando(true);
    setErro(null);
    const r = await decidirIsencao(id, aprovar, obs);
    if (!r.ok) setErro(r.message ?? "Não foi possível registrar.");
    setProcessando(false);
  };

  return (
    <div>
      <input
        value={obs}
        onChange={(e) => setObs(e.target.value)}
        placeholder="Observação (opcional)"
        aria-label="Observação da decisão"
        style={{ marginBottom: 8 }}
      />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn-primary"
          style={{ padding: "8px 16px" }}
          onClick={() => decidir(true)}
          disabled={processando}
        >
          {processando ? "Registrando…" : "Aprovar isenção"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          style={{ padding: "8px 16px" }}
          onClick={() => decidir(false)}
          disabled={processando}
        >
          Negar
        </button>
      </div>
      {erro && (
        <div className="banner banner-error" style={{ marginTop: 10 }}>{erro}</div>
      )}
    </div>
  );
}
