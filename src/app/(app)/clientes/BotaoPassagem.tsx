"use client";

import { useState } from "react";
import { registrarPassagemRapida } from "./passagem-actions";

/**
 * Registro de passagem direto na LISTA de clientes.
 *
 * Ficava só na tela de editar cliente, e isso condenava a funcionalidade: o
 * consultor não vai navegar até uma tela de edição no meio do atendimento.
 * O lugar certo é onde ele já está — a lista, consultando se o cliente está em
 * dia antes de atender.
 *
 * UM CLIQUE, sem confirmação e sem observação. Cada passo a mais aqui é uma
 * chance de o registro não acontecer, e um contador com metade das visitas é
 * pior que nenhum, porque parece um dado real. Quem quiser anotar o motivo faz
 * pela ficha do cliente, onde o campo continua existindo.
 */
export function BotaoPassagem({
  subscriptionId,
  inicial,
}: {
  subscriptionId: string;
  inicial: number;
}) {
  const [total, setTotal] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [erro, setErro] = useState(false);

  const registrar = async () => {
    if (salvando) return;
    setSalvando(true);
    setErro(false);
    const r = await registrarPassagemRapida(subscriptionId);
    setSalvando(false);
    if (!r.ok) {
      setErro(true);
      setTimeout(() => setErro(false), 3000);
      return;
    }
    setTotal((t) => t + 1);
    setConfirmado(true);
    setTimeout(() => setConfirmado(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={registrar}
      disabled={salvando}
      title={`${total} passagem(ns) registrada(s). Clique para registrar mais uma.`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 9px",
        fontSize: 12,
        borderRadius: 6,
        cursor: salvando ? "default" : "pointer",
        border: `1px solid ${erro ? "var(--danger)" : confirmado ? "#0f7a3d" : "var(--line)"}`,
        background: confirmado ? "rgba(15,122,61,0.10)" : "transparent",
        color: erro ? "var(--danger)" : "inherit",
        whiteSpace: "nowrap",
      }}
    >
      {/* Compacto de propósito: esta coluna divide espaço com cinco outras, e
          o texto longo empurrava as ações para fora da tela. O significado
          está no cabeçalho da coluna e no title. */}
      {erro ? (
        "erro"
      ) : confirmado ? (
        "✓ ok"
      ) : (
        <>
          <span style={{ fontWeight: 600 }}>{total}</span>
          <span aria-hidden="true">{salvando ? "…" : "+"}</span>
          <span className="sr-only">registrar passagem</span>
        </>
      )}
    </button>
  );
}
