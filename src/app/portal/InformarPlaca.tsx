"use client";

import { useState } from "react";
import { informarPlaca } from "./informar-placa-actions";
import { mascaraPlaca } from "@/lib/mascaras";

/**
 * Pede a placa quando o veículo foi contratado ainda sem emplacar.
 *
 * Aparece no portal porque é o CLIENTE quem tem o documento na mão no dia em
 * que a placa sai. Depender do vendedor significaria depender de alguém
 * lembrar de uma tarefa que não gera venda.
 */
export function InformarPlaca({
  subscriptionId,
  chassi,
}: {
  subscriptionId: string;
  chassi: string | null;
}) {
  const [placa, setPlaca] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  if (pronto) {
    return (
      <div className="banner banner-success" style={{ marginBottom: 12 }}>
        Placa registrada. Obrigado!
      </div>
    );
  }

  const enviar = async () => {
    setEnviando(true);
    setErro(null);
    const r = await informarPlaca(subscriptionId, placa);
    if (r.ok) setPronto(true);
    else setErro(r.message ?? "Não foi possível registrar.");
    setEnviando(false);
  };

  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: "12px 14px",
        marginBottom: 12,
        background: "rgba(78,195,224,.06)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Informe a placa</div>
      <p className="hint" style={{ marginTop: 0 }}>
        Seu veículo foi cadastrado pelo chassi
        {chassi ? ` (${chassi})` : ""}, antes do emplacamento. Assim que tiver a
        placa, registre aqui.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={placa}
          onChange={(e) => setPlaca(mascaraPlaca(e.target.value))}
          placeholder="ABC1D23"
          aria-label="Placa do veículo"
          style={{ textTransform: "uppercase", width: 140 }}
        />
        <button
          type="button"
          className="btn-primary"
          style={{ padding: "8px 16px" }}
          onClick={enviar}
          disabled={enviando || placa.replace(/[^A-Za-z0-9]/g, "").length < 7}
        >
          {enviando ? "Registrando…" : "Registrar placa"}
        </button>
      </div>

      {erro && (
        <div className="banner banner-error" style={{ marginTop: 10, marginBottom: 0 }}>
          {erro}
        </div>
      )}
    </div>
  );
}
