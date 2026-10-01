/**
 * A DECISÃO da régua, isolada do resto.
 *
 * Separada da consulta à Asaas e da gravação de propósito: assim ela é uma
 * função pura, testável com qualquer combinação de datas e status, sem
 * depender de rede nem de banco. Uma régua que decide errado cancela contrato
 * de cliente adimplente — é o tipo de código que precisa ser exercitado em
 * todos os cenários antes de rodar sozinho às três da manhã.
 *
 * As regras vêm do CONTRATO:
 *   9.3 — persistindo N dias (parâmetro do grupo), cancelamento definitivo.
 *   9.4 — cancelamento por inadimplência não admite reativação.
 *
 * A 9.1 (suspensão no vencimento) não precisa de ação: o status 'atrasada' que
 * vem da Asaas já comunica isso a todas as telas e ao DMS.
 */

export type AcaoRegua = "cancelar" | "nada";

export type EstadoAssinatura = {
  status: string;
  /** Vencimento da fatura em aberto mais antiga, vindo da Asaas. */
  vencidoDesde: Date | null;
  /** Há QUALQUER valor em aberto? É o saldo devedor, não só a última fatura. */
  temSaldoDevedor: boolean;
  canceladaPorInadimplencia: boolean;
  diasCancelamento: number;
};

export function decidir(e: EstadoAssinatura, hoje: Date): AcaoRegua {
  // Cancelada não volta. A 9.4 é explícita: nova contratação exige contrato
  // novo, com nova carência.
  if (e.status === "cancelada") return "nada";

  // Sem saldo devedor, nada a fazer. A suspensão do direito de uso (9.1) não
  // precisa de ação nossa: o status 'atrasada' que vem da Asaas já comunica
  // isso à loja, ao portal e ao DMS.
  //
  // SALDO, não última fatura: durante o atraso a Asaas segue gerando
  // cobranças, então quem deve 45 dias tem duas em aberto. Pagar só a mais
  // recente não quita o contrato.
  if (!e.temSaldoDevedor || !e.vencidoDesde) return "nada";

  const diasAtraso = Math.floor(
    (hoje.getTime() - e.vencidoDesde.getTime()) / 86400000
  );

  // 9.3 — o prazo é do grupo, contado do vencimento mais antigo em aberto.
  // É a única coisa que a Asaas não faz sozinha.
  return diasAtraso >= e.diasCancelamento ? "cancelar" : "nada";
}
