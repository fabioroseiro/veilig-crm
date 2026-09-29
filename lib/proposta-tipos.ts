/** Tipos e tabelas da proposta — sem dependência de servidor (usados também nas telas). */
export const PACOTES_PROPOSTA = {
  essencial: { nome: "Essencial", modulos: "Planos de Manutenção" },
  performance: { nome: "Performance", modulos: "Planos de Manutenção, Oficina e BI" },
  completo: { nome: "Completo", modulos: "Planos de Manutenção, Oficina, WhatsApp, BI e NPS" },
} as const;
export type Pacote = keyof typeof PACOTES_PROPOSTA;

export const STATUS_PROPOSTA: Record<string, string> = {
  rascunho: "Rascunho", enviada: "Enviada", aceita: "Aceita", prazo_pedido: "Pediu mais prazo", cancelada: "Cancelada",
};

/** Tarifas da instituição de pagamento (Asaas), iguais à tabela do contrato. */
export const TARIFAS = [
  ["Pix", "R$ 1,99 por transação"],
  ["Boleto", "R$ 1,99 por transação"],
  ["Cartão de débito", "R$ 0,35 + 1,89% por transação"],
  ["Cartão de crédito", "R$ 0,49 + 2,99% por transação"],
] as const;

/** Tudo o que aparece na proposta. Nasce com os dados do CRM e pode ser editado até o envio. */
export type DadosProposta = {
  empresa: string;
  contato_nome: string;
  contato_cargo: string;
  contato_email: string;
  marcas: string;
  lojas: number;
  vendas_loja: number;       // entregas de veículos novos por loja/mês
  ticket: number;            // ticket médio de revisão
  pacote: Pacote;
  recorrente_loja: number;
  setup_total: number;
  setup_obs: string;         // ex.: "Isento — condição de lançamento"
  fee: number;               // % sobre o valor líquido recebido
  implantacao_dias: number;
  onboarding_horas: number;
  onboarding_formato: "remoto" | "presencial";
  vencimento_dia: number;
  mostrar_simulacao: boolean;
  observacoes: string;
};

