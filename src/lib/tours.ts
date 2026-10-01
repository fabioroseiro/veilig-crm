import type { PassoTour } from "@/components/tour/TourProvider";

/**
 * Textos dos tours, num lugar só.
 *
 * Cada passo aponta para um elemento marcado com `data-tour="..."`. Se o
 * elemento não estiver na tela, o passo é pulado — então dá para ter o mesmo
 * tour servindo telas com variações.
 *
 * A carência aparece com peso de propósito no fluxo de venda: foi a falta de
 * informá-la que gerou o primeiro estorno.
 */

export const TOURS: Record<string, PassoTour[]> = {
  painel_vendedor: [
    { alvo: "menu-clientes", titulo: "Vender e atender", texto: "Em Clientes você cadastra uma venda nova e consulta os clientes da loja." },
    { alvo: "menu-planos", titulo: "Conheça os planos", texto: "Aqui ficam os planos da loja. O botão Vender mostra o que cada um cobre — e o que não cobre." },
    { alvo: "painel-numeros", titulo: "Seus números", texto: "Suas vendas do mês, o valor vendido e o líquido, já descontadas as canceladas." },
  ],
  painel_gestor_loja: [
    { alvo: "menu-precos", titulo: "Preços da loja", texto: "Defina o valor de cada modelo nos planos da loja. Para seminovo, o acréscimo por idade é somado sozinho." },
    { alvo: "menu-usuarios", titulo: "Sua equipe", texto: "Crie os vendedores e resete a senha de quem ficar bloqueado." },
    { alvo: "menu-isencoes", titulo: "Isenção de carência", texto: "Os pedidos dos vendedores para vender sem carência chegam aqui. A aprovação vale por 24 horas, para uma venda." },
    { alvo: "menu-clientes", titulo: "Clientes", texto: "A carteira da loja, com a situação de cada assinatura e as passagens na loja." },
  ],
  painel_gestor_grupo: [
    { alvo: "menu-planos", titulo: "Os planos do grupo", texto: "Revisões, benefícios, exclusões, carência por faixa e argumentos de venda. Confira sempre a minuta." },
    { alvo: "menu-precos", titulo: "Preços", texto: "O valor de cada modelo, por loja." },
    { alvo: "menu-comissoes", titulo: "Comissões", texto: "Apuração por vendedor, recorrente ou só primeira parcela, com exportação para Excel." },
    { alvo: "menu-desempenho", titulo: "Desempenho", texto: "Compare as lojas e os vendedores do grupo mês a mês." },
    { alvo: "menu-integracoes", titulo: "Integrações", texto: "Gere a chave que o DMS usa para saber se o veículo pode ser atendido." },
  ],

  venda_inicio: [
    { alvo: "venda-cliente", titulo: "Dados do cliente", texto: "Comece pelos dados do cliente. O CPF é conferido antes de seguir." },
    { alvo: "venda-veiculo", titulo: "Descreva o veículo", texto: "Fabricante, modelo, ano e se é zero km. Com isso o sistema mostra só os planos que servem, já com o preço certo. Sem placa? Use o chassi." },
  ],
  venda_plano: [
    { alvo: "venda-planos", titulo: "Escolha o plano", texto: "Os planos que servem para este veículo, com preço e carência calculados." },
    {
      alvo: "venda-carencia",
      titulo: "Leia isto para o cliente",
      texto: "Esta é a data a partir da qual o cliente pode usar o plano. Ele já paga desde hoje. Cliente que não sabe da carência acha que pode usar no mesmo dia — e pede estorno.",
    },
    { alvo: "venda-negociar", titulo: "Negociar carência", texto: "Se o cliente acabou de fazer uma revisão, peça a isenção ao gestor. Depois de aprovada, clique em \"Já foi aprovado?\"." },
    { alvo: "venda-concluir", titulo: "Concluir", texto: "O link de pagamento vai para o cliente sozinho. O contrato vale a partir do primeiro pagamento." },
  ],
  venda_credenciais: [
    { alvo: "cred-copiar", titulo: "Envie o acesso agora", texto: "A senha aparece uma única vez. Copie a mensagem pronta e mande pelo WhatsApp antes de sair desta tela." },
  ],

  comissoes: [
    { alvo: "com-competencia", titulo: "Competência", texto: "Escolha o mês. As datas exatas do período aparecem logo abaixo." },
    { alvo: "com-modelo", titulo: "Modelo de comissão", texto: "Recorrente conta todas as mensalidades pagas; primeira parcela, só a que formou o contrato." },
    { alvo: "com-excel", titulo: "Exportar", texto: "Gera a planilha do período para o fechamento." },
  ],
  isencoes: [
    { alvo: "isen-pendentes", titulo: "Pedidos de isenção", texto: "Leia o motivo do vendedor e aprove ou negue. A aprovação vale 24 horas e serve para uma venda só." },
  ],
};

/**
 * Ids com que as telas registram os tours — é o que fica gravado como visto.
 *
 * NÃO são as chaves de TOURS: os três painéis usam o mesmo id "painel" (cada
 * pessoa tem um papel só), com textos diferentes. A rota de marcação recusa
 * qualquer id fora desta lista, e ela precisa bater com a da migração.
 */
export const TOUR_IDS = [
  "painel",
  "venda_inicio",
  "venda_plano",
  "venda_credenciais",
  "comissoes",
  "isencoes",
];
