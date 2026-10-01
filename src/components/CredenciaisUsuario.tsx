"use client";

import { useState } from "react";

/**
 * Credenciais de acesso de um USUÁRIO do sistema (funcionário).
 *
 * Mesmo raciocínio do componente do cliente: a senha é aleatória e mostrada
 * UMA VEZ. Se quem cadastrou não copiar agora, ninguém mais a conhece e a
 * pessoa fica sem acesso até um novo reset.
 *
 * O botão existe porque o caminho real é o WhatsApp — sem ele, o gestor
 * transcreve à mão e erra um caractere de uma senha tipo H7K2-M9PX.
 */
export function CredenciaisUsuario({
  nome,
  email,
  senha,
  titulo = "Acesso criado",
}: {
  nome?: string;
  email: string;
  senha: string;
  titulo?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  // Montado no navegador: acerta o domínio sem depender de variável de
  // ambiente configurada.
  const url = typeof window !== "undefined" ? window.location.origin : "";

  const textoPronto =
    `${nome ? `Olá, ${nome.split(" ")[0]}! ` : ""}Seu acesso ao sistema Veilig está pronto.\n\n` +
    `Entre por aqui:\n${url}/login\n\n` +
    `E-mail: ${email}\n` +
    `Senha provisória: ${senha}\n\n` +
    `No primeiro acesso o sistema pede para você criar uma senha própria.`;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoPronto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sem permissão de área de transferência: os dados continuam visíveis
      // na tela, então não vale interromper quem está cadastrando.
    }
  };

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
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {titulo}
        {nome ? ` — ${nome}` : ""}
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        A senha aparece <strong>uma única vez</strong>. Copie agora — depois ela
        não pode ser consultada, só gerada de novo.
      </p>

      <div style={{ display: "grid", gap: 6, marginBottom: 12, fontSize: 14 }}>
        <div>
          <span className="store-sub">Endereço: </span>
          {url}/login
        </div>
        <div>
          <span className="store-sub">E-mail: </span>
          {email}
        </div>
        <div>
          <span className="store-sub">Senha provisória: </span>
          <strong style={{ fontFamily: "ui-monospace, monospace", fontSize: 16 }}>
            {senha}
          </strong>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn-primary"
          style={{ padding: "8px 16px" }}
          onClick={copiar}
        >
          {copiado ? "Copiado!" : "Copiar mensagem para WhatsApp"}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(textoPronto)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost"
          style={{ padding: "8px 16px" }}
        >
          Abrir no WhatsApp
        </a>
      </div>
    </div>
  );
}
