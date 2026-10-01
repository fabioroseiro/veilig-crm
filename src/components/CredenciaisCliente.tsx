"use client";

import { useState } from "react";
import { Tour } from "@/components/tour/Tour";
import { TOURS } from "@/lib/tours";

/**
 * Credenciais do portal para o vendedor passar ao cliente.
 *
 * Existe porque a senha é ALEATÓRIA e exibida uma única vez. Se o vendedor
 * precisasse ir até a ficha do cliente para descobrir o acesso, ele
 * simplesmente não faria — o cliente sairia da loja sem saber que tem portal.
 * Por isso tudo aparece aqui: link, CPF e senha, com um botão que copia o
 * texto pronto para colar no WhatsApp.
 */
export function CredenciaisCliente({
  cpf,
  senha,
  nome,
  titulo = "Acesso do cliente ao portal",
}: {
  cpf: string;
  senha: string;
  nome?: string;
  titulo?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  // Montado no navegador: o vendedor já está no domínio certo, então isso
  // acerta sempre, sem depender de variável de ambiente configurada.
  const url =
    typeof window !== "undefined" ? `${window.location.origin}/portal` : "/portal";

  // NÃO dizer que o plano está ativo: ele só se efetiva com o primeiro
  // pagamento. Afirmar o contrário faz o cliente aparecer na oficina achando
  // que tem cobertura — e a loja fica com a explicação.
  const textoPronto =
    `Seu plano de manutenção foi contratado!\n\n` +
    `Para ativá-lo, é só pagar a primeira mensalidade pelo link que você recebeu.\n\n` +
    `Acompanhe faturas e contrato pelo portal:\n${url}\n\n` +
    `CPF: ${cpf}\n` +
    `Senha provisória: ${senha}\n\n` +
    `No primeiro acesso você escolhe uma senha própria.`;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoPronto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sem permissão de área de transferência: os dados estão visíveis na
      // tela de qualquer forma, então não vale interromper o vendedor.
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
      <Tour id="venda_credenciais" passos={TOURS.venda_credenciais} />
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {titulo}
        {nome ? ` — ${nome}` : ""}
      </div>
      <p style={{ margin: "0 0 12px", fontSize: 14 }}>
        Passe estes dados ao cliente <strong>agora</strong>. A senha não poderá
        ser consultada depois.
      </p>

      <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
        <div>
          <div className="store-sub" style={{ fontSize: 12 }}>Endereço do portal</div>
          <strong style={{ fontSize: 15, wordBreak: "break-all" }}>{url}</strong>
        </div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div className="store-sub" style={{ fontSize: 12 }}>Entrar com o CPF</div>
            <strong style={{ fontSize: 16 }}>{cpf}</strong>
          </div>
          <div>
            <div className="store-sub" style={{ fontSize: 12 }}>Senha provisória</div>
            <strong
              style={{
                fontSize: 22,
                letterSpacing: "0.08em",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              {senha}
            </strong>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="btn-primary"
        style={{ padding: "8px 16px", fontSize: 14 }}
        onClick={copiar}
        data-tour="cred-copiar"
      >
        {copiado ? "Copiado!" : "Copiar mensagem para o cliente"}
      </button>

      <p className="hint" style={{ margin: "10px 0 0" }}>
        No primeiro acesso o cliente escolhe a própria senha. Se esta se perder,
        é possível gerar outra na ficha dele.
      </p>
    </div>
  );
}
