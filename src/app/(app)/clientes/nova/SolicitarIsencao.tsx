"use client";

import { useState } from "react";
import { solicitarIsencao } from "../../isencoes/actions";
import { temIsencaoValida } from "./isencao-check";

/**
 * O vendedor pede a isenção de carência, com o cliente no balcão.
 *
 * Aparece só quando o plano escolhido TEM carência — pedir isenção de algo que
 * não existe seria ruído.
 *
 * O vendedor espera a decisão: vai até o gestor, ele aprova na tela de
 * isenções, e aqui é só recarregar. Sem notificação por enquanto.
 */
export function SolicitarIsencao({
  cpf,
  vehicleModelId,
  planId,
  storeId,
  mesesCarencia,
}: {
  cpf: string;
  vehicleModelId: string;
  planId: string;
  storeId: string;
  mesesCarencia: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [jaAprovada, setJaAprovada] = useState<{ motivo?: string } | null>(null);
  const [checando, setChecando] = useState(false);

  const cpfLimpo = (cpf ?? "").replace(/\D/g, "");
  if (mesesCarencia <= 0) return null;

  // Verifica se o gestor já aprovou. O vendedor volta do gestor e precisa VER
  // que pode fechar sem carência — senão fecharia com, sem querer.
  const conferir = async () => {
    setChecando(true);
    const r = await temIsencaoValida(cpfLimpo, storeId, vehicleModelId);
    setJaAprovada(r.valida ? { motivo: r.motivo } : null);
    setChecando(false);
  };

  if (jaAprovada) {
    return (
      <div className="banner banner-success" style={{ marginTop: 10 }}>
        <strong>Isenção aprovada.</strong> Esta venda sairá{" "}
        <strong>sem carência</strong>. Motivo registrado: {jaAprovada.motivo}
      </div>
    );
  }

  if (enviado) {
    return (
      <div className="banner banner-success" style={{ marginTop: 10 }}>
        <strong>Pedido enviado.</strong> Procure o gestor da loja ou do grupo
        para aprovar. Quando ele decidir, confira aqui antes de fechar a venda.
        {/* O botão precisa existir NESTE estado: é exatamente quando o vendedor
            volta do gestor e quer saber se já pode fechar. */}
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            className="btn-primary"
            style={{ padding: "6px 14px", fontSize: 13 }}
            onClick={conferir}
            disabled={checando}
          >
            {checando ? "Verificando…" : "Já foi aprovado?"}
          </button>
        </div>
      </div>
    );
  }

  if (!aberto) {
    return (
      <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn-ghost"
          style={{ padding: "6px 14px", fontSize: 13 }}
          onClick={() => setAberto(true)}
          disabled={cpfLimpo.length !== 11}
          title={cpfLimpo.length !== 11 ? "Preencha o CPF primeiro" : undefined}
        >
          Negociar carência
        </button>
        <button
          type="button"
          className="btn-ghost"
          style={{ padding: "6px 14px", fontSize: 13 }}
          onClick={conferir}
          disabled={cpfLimpo.length !== 11 || checando}
        >
          {checando ? "Verificando…" : "Já foi aprovado?"}
        </button>
      </div>
    );
  }

  const enviar = async () => {
    setEnviando(true);
    setErro(null);
    const fd = new FormData();
    fd.set("cpf", cpfLimpo);
    fd.set("motivo", motivo);
    fd.set("vehicleModelId", vehicleModelId);
    fd.set("planId", planId);
    fd.set("storeId", storeId);
    const r = await solicitarIsencao(fd);
    if (r.ok) setEnviado(true);
    else setErro(r.message ?? "Não foi possível solicitar.");
    setEnviando(false);
  };

  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: "12px 14px",
        marginTop: 10,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Pedir isenção de carência</div>
      <p className="hint" style={{ marginTop: 0 }}>
        Explique por que este cliente deve entrar sem carência. O gestor vê este
        texto ao decidir, e ele fica registrado no contrato.
      </p>
      <textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        rows={3}
        placeholder="Ex.: cliente fez a revisão dos 10.000 km na loja em 28/08, com nota fiscal."
        aria-label="Motivo do pedido"
      />
      <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn-primary"
          style={{ padding: "8px 16px" }}
          onClick={enviar}
          disabled={enviando || motivo.trim().length < 10}
        >
          {enviando ? "Enviando…" : "Enviar pedido"}
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
      {erro && <div className="banner banner-error" style={{ marginTop: 10 }}>{erro}</div>}
    </div>
  );
}
