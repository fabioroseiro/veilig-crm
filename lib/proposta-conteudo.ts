/**
 * Texto da proposta, montado uma vez e usado nos dois formatos: a página (link) e o PDF.
 * Linguagem: consultiva, sem promessa de resultado; números sempre como estimativa.
 */
import { retorno } from "./simulador";
import { PACOTES_PROPOSTA, TARIFAS, type DadosProposta } from "./proposta-tipos";

const brl = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");
const brlCent = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
export const dataExtenso = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });

export type Linha = [string, string];
export type Secao = { titulo: string; texto?: string; linhas?: Linha[]; destaque?: Linha; itens?: string[]; nota?: string; tabela?: { cab: [string, string]; linhas: Linha[] } };

export type Remetente = { nome: string; email: string; whatsapp?: string };

export function conteudoProposta(d: DadosProposta, numero: string, emitida: string, validade: string, rem: Remetente) {
  const r = retorno({ lojas: d.lojas, vendasLoja: d.vendas_loja, ticket: d.ticket }, d.recorrente_loja, d.setup_total, d.fee);
  const pac = PACOTES_PROPOSTA[d.pacote];
  const mensalVeilig = d.recorrente_loja * d.lojas;
  const secoes: Secao[] = [];

  if (d.mostrar_simulacao) {
    secoes.push({
      titulo: "A operação hoje",
      linhas: [
        ["Lojas", int(d.lojas)],
        ...(d.marcas ? [["Marcas", d.marcas] as Linha] : []),
        ["Entregas de veículos novos por mês", int(r.vendasMes)],
        ["Ticket médio de revisão", brl(d.ticket)],
      ],
      destaque: ["Receita de revisões que deixa de voltar à oficina, por ano", brl(r.rua)],
      nota: "Estimativa com os dados acima e a premissa de que metade dos clientes deixa de fazer as revisões na concessionária. Nas concessionárias que chegam à Veilig, antes dos planos, a perda observada é de 40% a 55% dos clientes já na 2ª revisão.",
    });
    secoes.push({
      titulo: "O potencial com planos de manutenção",
      linhas: [
        ["Mensalidade de referência para o cliente final", brl(r.mensal)],
        ["Adesão estimada", `${pct(r.adesao)} das vendas`],
        ["Novos clientes com plano por ano", int(r.aderentes)],
        ["Receita recebida no ano 1", brl(r.caixa1)],
      ],
      destaque: ["Receita anual com planos, do ano 2 em diante", brl(r.regime)],
      nota: "A adesão estimada é a observada na base Veilig para planos nessa faixa de mensalidade. O preço e o escopo dos planos são definidos pela concessionária; os valores são referências, sem garantia de resultado.",
    });
  }

  secoes.push({
    titulo: `A solução: pacote ${pac.nome}`,
    texto: `Módulos incluídos: ${pac.modulos}.`,
    itens: [
      "Montagem dos planos por grupo e por loja, com regras de elegibilidade e carência por idade do veículo.",
      "Venda na entrega do veículo e nas revisões, com contrato de adesão gerado pela plataforma.",
      "Cobrança recorrente por cartão, Pix ou boleto, com repasse automático para a conta da concessionária.",
      "Portal do cliente para acompanhar o plano e as revisões.",
      "Indicadores de receita recorrente, adesão, inadimplência, cancelamentos e visitas à oficina.",
      `Implantação em até ${d.implantacao_dias} dias corridos e treinamento inicial de ${d.onboarding_horas} horas, em formato ${d.onboarding_formato}.`,
      "Suporte em dias úteis, das 9h às 18h.",
    ],
  });

  const setupTexto = d.setup_total > 0
    ? `${brlCent(d.setup_total)}, em 3 parcelas: na assinatura, no Go-Live e 30 dias depois`
    : "Isento";
  secoes.push({
    titulo: "Investimento",
    linhas: [
      ["Recorrente mensal por loja", brlCent(d.recorrente_loja)],
      ["Lojas habilitadas", int(d.lojas)],
      ["Recorrente mensal total", brlCent(mensalVeilig)],
      ["Setup", setupTexto + (d.setup_obs ? ` (${d.setup_obs})` : "")],
      ["Taxa de sucesso", `${d.fee}% sobre o valor líquido recebido dos clientes, retida automaticamente no repasse`],
      ["Vencimento das faturas", `Dia ${d.vencimento_dia} de cada mês, a partir do mês seguinte ao Go-Live`],
    ],
    tabela: { cab: ["Meio de pagamento", "Tarifa da instituição de pagamento (Asaas)"], linhas: TARIFAS.map(([a, b]) => [a, b] as Linha) },
    nota: "Valor líquido recebido: o que o cliente final paga, menos a tarifa do meio de pagamento. Recorrente reajustado anualmente pelo IPCA. Sem fidelidade: o contrato pode ser encerrado com aviso de 90 dias.",
  });

  if (d.mostrar_simulacao) {
    secoes.push({
      titulo: "Retorno estimado",
      linhas: [
        ["Receita recebida no ano 1", brl(r.caixa1)],
        ["Investimento na Veilig no ano 1 (recorrente, setup e taxa de sucesso)", brl(r.custoAno1)],
        ["Fica com a concessionária no ano 1", brl(r.ficaAno1)],
      ],
      destaque: ["Fica com a concessionária por ano, do ano 2 em diante", brl(r.ficaRegime)],
      nota: "Antes do custo das revisões realizadas pela oficina. O ano 1 é menor porque a carteira de clientes com plano é formada mês a mês.",
    });
  }

  secoes.push({
    titulo: "Próximos passos",
    itens: [
      "Aceite desta proposta, pelo botão no link ou respondendo ao e-mail.",
      "Envio e assinatura do contrato, com estas condições no Anexo I — Condições Comerciais.",
      "Abertura da conta de recebimento no Asaas, em nome da concessionária.",
      "Implantação da plataforma e treinamento das equipes.",
      "Go-Live: início da venda dos planos.",
    ],
  });

  return {
    numero,
    emitida: dataExtenso(emitida),
    validade: dataExtenso(validade),
    empresa: d.empresa,
    contato: [d.contato_nome, d.contato_cargo].filter(Boolean).join(" · "),
    intro: `Esta proposta apresenta como oferecer planos de manutenção recorrente aos clientes da ${d.empresa} com a Veilig: o cliente paga uma mensalidade fixa, a concessionária recebe todo mês e o cliente volta para a oficina.`,
    secoes,
    observacoes: d.observacoes,
    condicao: `Proposta válida até ${dataExtenso(validade)}. As condições estão sujeitas à assinatura do contrato de licença de uso da plataforma Veilig.`,
    assinatura: [rem.nome, "Veilig · veilig.com.br", rem.email, ...(rem.whatsapp ? [`WhatsApp ${rem.whatsapp}`] : [])],
    resumo: { mensalVeilig: brlCent(mensalVeilig), setup: setupTexto, pacote: pac.nome },
  };
}
export type ConteudoProposta = ReturnType<typeof conteudoProposta>;
