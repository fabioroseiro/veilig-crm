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
  onboarding: Onboarding;   // consultivo, online ou os dois para o cliente escolher
  vencimento_dia: number;
  mostrar_simulacao: boolean;
  observacoes: string;
};


/** Os dois formatos de onboarding (material "Veilig Onboarding", setembro de 2026). */
export const ONBOARDING = {
  consultivo: {
    nome: "Consultivo",
    duracao: "cerca de 6 semanas até o go-live",
    resumo: "Encontros presenciais nos marcos e acompanhamento semanal, com o time da Veilig dentro da operação.",
    etapas: [
      ["Semana 1", "Kickoff e diagnóstico da oficina (presencial): custos de mão de obra e peças por revisão, passagens e escopo do piloto"],
      ["Semanas 2 e 3", "Workshop de desenho e precificação de no mínimo 3 planos, com a minuta do contrato revisada pelo jurídico de vocês"],
      ["Semanas 3 e 4", "Parametrização do ambiente pela Veilig, conta no Asaas por loja ou por grupo e divisão do valor configurada"],
      ["Semanas 4 e 5", "Treinamento presencial por perfil (grupo, gestor de loja e vendedor), com simulação de balcão"],
      ["Semana 5", "Homologação e venda-teste real, do balcão ao repasse na conta da loja"],
      ["Semana 6", "Go-live assistido, com o time Veilig na loja na primeira semana de vendas"],
    ] as [string, string][],
    acompanhamento: "90 dias de acompanhamento depois do go-live: reuniões semanais no primeiro mês e quinzenais até o 90º dia, revisão de preços aos 30 dias com base nas vendas reais e plano de expansão para as demais lojas.",
    indicado: "Grupos com várias lojas no piloto ou dados de pós-venda dispersos",
  },
  online: {
    nome: "Online",
    duracao: "cerca de 3 semanas até o go-live",
    resumo: "Sessões curtas por vídeo, formulário de levantamento e materiais gravados.",
    etapas: [
      ["Semana 1", "Kickoff por vídeo (1h) e formulário de levantamento dos custos de revisão"],
      ["Semanas 1 e 2", "Proposta de 3 planos montada pela Veilig, ajustada e aprovada em sessão de 1h30"],
      ["Semana 2", "Parametrização do ambiente pela Veilig e abertura da conta no Asaas com o nosso passo a passo"],
      ["Semanas 2 e 3", "Treinamento por perfil ao vivo e gravado, com guia rápido de balcão para os vendedores"],
      ["Semana 3", "Venda-teste conferida em chamada e go-live com suporte remoto prioritário na primeira semana"],
    ] as [string, string][],
    acompanhamento: "30 dias de acompanhamento depois do go-live, com check-ins de resultado aos 15 e aos 30 dias e suporte pelo canal de atendimento.",
    indicado: "Uma ou poucas lojas, com custos de revisão organizados",
  },
} as const;
export type FormatoOnboarding = keyof typeof ONBOARDING;
export type Onboarding = FormatoOnboarding | "ambos";
export const OPCOES_ONBOARDING: Record<Onboarding, string> = {
  consultivo: "Consultivo (~6 semanas, presencial nos marcos)",
  online: "Online (~3 semanas, por vídeo)",
  ambos: "Apresentar os dois para o cliente escolher",
};
/** Sugestão pelo tamanho do piloto: várias lojas → consultivo. */
export const onboardingSugerido = (lojas: number): FormatoOnboarding => (lojas >= 4 ? "consultivo" : "online");
/** Propostas criadas antes dos dois formatos (tinham "remoto"/"presencial"). */
export const onboardingDe = (d: { onboarding?: string; onboarding_formato?: string }): Onboarding =>
  d.onboarding === "consultivo" || d.onboarding === "online" || d.onboarding === "ambos" ? d.onboarding
    : d.onboarding_formato === "presencial" ? "consultivo" : "online";
