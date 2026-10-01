"use client";

import { useState } from "react";
import { verificarEstorno, estornarAssinatura, type EstornoInfo } from "./estorno-actions";

const brl = (n: number) =>
  `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

/**
 * Estorno por arrependimento (Cláusula 13 / art. 49 do CDC).
 *
 * NUNCA aparece no portal do cliente: se ele vê o botão, ele pede — e a
 * devolução deixa de ser exceção.
 *
 * Quando não cabe, mostra POR QUÊ em vez de sumir. O vendedor precisa saber o
 * que responder ao cliente, e um botão ausente não explica nada.
 */
export function BotaoEstorno({ subscriptionId }: { subscriptionId: string }) {
  const [info, setInfo] = useState<EstornoInfo | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const verificar = async () => {
    setVerificando(true);
    setInfo(await verificarEstorno(subscriptionId));
    setVerificando(false);
  };

  if (resultado) {
    return (
      <div className={`banner ${ok ? "banner-success" : "banner-error"}`} style={{ marginTop: 12 }}>
        {resultado}
      </div>
    );
  }

  if (!info) {
    return (
      <button
        type="button"
        className="btn-ghost"
        style={{ padding: "6px 14px", fontSize: 13 }}
        onClick={verificar}
        disabled={verificando}
      >
        {verificando ? "Verificando…" : "Estornar (arrependimento)"}
      </button>
    );
  }

  if (!info.pode) {
    return (
      <div className="banner" style={{ background: "rgba(184,134,11,.10)", borderLeft: "3px solid #b8860b", marginTop: 12 }}>
        <strong>Estorno não disponível.</strong> {info.motivo}
      </div>
    );
  }

  if (!info.meioPermite) {
    return (
      <div className="banner" style={{ background: "rgba(184,134,11,.10)", borderLeft: "3px solid #b8860b", marginTop: 12 }}>
        <strong>Pagamento por boleto.</strong> A devolução precisa ser feita no
        painel da Asaas — o cliente informa os dados bancários num link. Depois
        que ela confirmar, o sistema registra sozinho.
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid var(--danger)", borderRadius: 8, padding: "12px 14px", marginTop: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        Estornar {info.valor ? brl(info.valor) : "o pagamento"}
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        O dinheiro volta ao cliente e a assinatura é cancelada. O valor que foi
        para a loja também é revertido, na proporção do split. Prazo de
        arrependimento até{" "}
        {info.prazoAte ? info.prazoAte.split("-").reverse().join("/") : "—"}.
      </p>
      <textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        rows={2}
        placeholder="Ex.: cliente não foi informado da carência na venda."
        aria-label="Motivo do estorno"
      />
      <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn-primary"
          style={{ padding: "8px 16px", background: "var(--danger)" }}
          onClick={async () => {
            setProcessando(true);
            const r = await estornarAssinatura(subscriptionId, motivo);
            setOk(r.ok);
            setResultado(r.message);
            setProcessando(false);
          }}
          disabled={processando || motivo.trim().length < 10}
        >
          {processando ? "Estornando…" : "Confirmar estorno"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          style={{ padding: "8px 16px" }}
          onClick={() => setInfo(null)}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
