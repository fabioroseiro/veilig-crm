/**
 * Projeção e ROI da apresentação da proposta.
 *
 * As premissas são as mesmas de lib/simulador.ts (que espelha a planilha
 * Simulador_Veilig_Revisado e o simulador do site) — as constantes vêm de lá,
 * para não existirem dois números com o mesmo nome. A única coisa que este
 * módulo acrescenta é a frequência de revisões por segmento: o simulador do
 * site assume 1,2 (veículos leves) e moto roda 2 revisões por ano.
 *
 * Módulo puro: não acessa banco, não importa nada de servidor.
 */
import { FATOR_PERDA, MESES_ANO, MARGEM, TARIFA_MEIO_PAGAMENTO } from "../simulador";

export type Modelo = "consultivo" | "online";

/** Revisões por ano usadas na simulação comercial, por segmento do grupo. */
export const REVISOES_POR_SEGMENTO: Record<string, number> = {
  leves: 1.2,
  motos: 2,
  pesados: 2,
  agricolas: 2,
  outro: 1.2,
};
export const revisoesAno = (segmento?: string | null) =>
  REVISOES_POR_SEGMENTO[String(segmento ?? "leves")] ?? 1.2;

/** Adesão observada na base Veilig, por faixa de mensalidade (igual ao simulador). */
const FAIXAS_ADESAO = [
  { ate: 100, adesao: 0.1 },
  { ate: 170, adesao: 0.08 },
  { ate: Infinity, adesao: 0.06 },
];
export const adesaoPorMensalidade = (mensal: number) =>
  FAIXAS_ADESAO.find((f) => Math.round(mensal) <= f.ate)!.adesao;

export interface EntradaProposta {
  grupo: string;
  segmento: string;
  lojas: number;
  /** Entregas de veículos novos por loja, por mês (mesmo campo do CRM). */
  vendasLoja: number;
  /** Ticket médio de revisão, em reais. */
  ticket: number;
  /** Recorrente mensal por loja em operação. */
  recorrenteLoja: number;
  /** Taxa de sucesso, em porcentagem (10 = 10%), como no CRM. */
  fee: number;
  setupConsultivo: number;
  setupOnline: number;
  /** 'ambos' deixa a escolha com o cliente, no aceite. */
  onboarding: Modelo | "ambos";
  /** Fixa a adesão à mão; vazio usa a faixa observada. */
  adesaoManual?: number | null;
}

export interface Projecao {
  revisoes: number;
  vendasMes: number;
  valorAnualPlano: number;
  mensalidadePlano: number;
  adesao: number;
  planosAno: number;
  /** Caixa do ano 1: a carteira se forma mês a mês (1+2+…+12 = 78 grupos). */
  receitaAno1: number;
  /** Receita anual com a carteira cheia, do ano 2 em diante. */
  receitaRegime: number;
  recorrencia12Mes: number;
  clientesPerdidosAno: number;
  deixadoNaRua: number;
}

export function calcularProjecao(e: EntradaProposta): Projecao {
  const revisoes = revisoesAno(e.segmento);
  const vendasMes = e.lojas * e.vendasLoja;
  const valorAnualPlano = e.ticket * revisoes * MARGEM;
  const mensalidadePlano = valorAnualPlano / MESES_ANO;
  const adesao = e.adesaoManual || adesaoPorMensalidade(mensalidadePlano);
  const planosAno = vendasMes * MESES_ANO * adesao;

  return {
    revisoes,
    vendasMes,
    valorAnualPlano,
    mensalidadePlano,
    adesao,
    planosAno,
    receitaAno1: 78 * vendasMes * adesao * mensalidadePlano,
    receitaRegime: planosAno * valorAnualPlano,
    recorrencia12Mes: planosAno * mensalidadePlano,
    clientesPerdidosAno: vendasMes * FATOR_PERDA * MESES_ANO,
    deixadoNaRua: vendasMes * FATOR_PERDA * MESES_ANO * e.ticket,
  };
}

export interface CenarioRoi {
  rotulo: string;
  receita: number;
  incremental: number;
  recorrente: number;
  taxaSucesso: number;
  setup: number;
  custo: number;
  retorno: number;
  multiplo: number;
  percentual: number;
}

export interface Roi {
  /** Fração da receita de planos que é receita nova para a oficina. */
  peso: number;
  acrescimoPorPlano: number;
  naoVoltariam: number;
  voltariam: number;
  valorNaoVoltariam: number;
  valorVoltariam: number;
  ano1: CenarioRoi;
  regime: CenarioRoi;
  /** Mês em que o acumulado do ganho passa o acumulado do custo, com setup. */
  paybackMes: number | null;
  paybackSemSetup: number | null;
  setupAplicado: number;
}

/**
 * Receita incremental: só o que não existiria sem o plano.
 * Quem não voltaria para a revisão gera o valor cheio; quem voltaria de
 * qualquer forma gera apenas o acréscimo de margem embutido no plano.
 */
export function calcularRoi(e: EntradaProposta, p: Projecao): Roi {
  const custoBaseServico = e.ticket * p.revisoes;
  const acrescimo = p.valorAnualPlano - custoBaseServico;
  const peso = FATOR_PERDA + (1 - FATOR_PERDA) * (acrescimo / p.valorAnualPlano);

  const naoVoltariam = p.planosAno * FATOR_PERDA;
  const voltariam = p.planosAno - naoVoltariam;

  const fee = e.fee / 100;
  const recorrenteAno = e.recorrenteLoja * e.lojas * MESES_ANO;
  // Com os dois formatos em aberto, o ROI usa o setup MAIOR: a conta mostrada
  // ao cliente nunca pode ser melhor do que o cenário que ele pode escolher.
  const setupAplicado =
    e.onboarding === "consultivo" ? e.setupConsultivo
    : e.onboarding === "online" ? e.setupOnline
    : Math.max(e.setupConsultivo, e.setupOnline);

  function cenario(rotulo: string, receita: number, setup: number): CenarioRoi {
    const taxaSucesso = receita * (1 - TARIFA_MEIO_PAGAMENTO) * fee;
    const custo = recorrenteAno + taxaSucesso + setup;
    const incremental = receita * peso;
    return {
      rotulo, receita, incremental,
      recorrente: recorrenteAno, taxaSucesso, setup, custo,
      retorno: incremental - custo,
      multiplo: custo > 0 ? incremental / custo : 0,
      percentual: custo > 0 ? ((incremental - custo) / custo) * 100 : 0,
    };
  }

  /** Mês a mês, com a carteira entrando em partes iguais ao longo do ano 1. */
  function payback(setup: number): number | null {
    const novosPorMes = p.planosAno / MESES_ANO;
    let ganho = 0, custo = setup;
    for (let mes = 1; mes <= 60; mes++) {
      const ativos = novosPorMes * Math.min(mes, MESES_ANO);
      const recebidoMes = ativos * p.mensalidadePlano;
      ganho += recebidoMes * peso;
      custo += e.recorrenteLoja * e.lojas + recebidoMes * (1 - TARIFA_MEIO_PAGAMENTO) * fee;
      if (ganho >= custo) return mes;
    }
    return null;
  }

  return {
    peso,
    acrescimoPorPlano: acrescimo,
    naoVoltariam,
    voltariam,
    valorNaoVoltariam: naoVoltariam * p.valorAnualPlano,
    valorVoltariam: voltariam * acrescimo,
    ano1: cenario("Ano 1", p.receitaAno1, setupAplicado),
    regime: cenario("Em regime", p.receitaRegime, 0),
    paybackMes: payback(setupAplicado),
    paybackSemSetup: payback(0),
    setupAplicado,
  };
}

// ---------------------------------------------------------------- formatação
export const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");

export const brlCent = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const num = (n: number) => Math.round(n).toLocaleString("pt-BR");

export const pct = (fracao: number) =>
  (fracao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";

/** Abrevia valores grandes, como "R$ 2,4 milhões". */
export function brlLongo(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `R$ ${m.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${m >= 2 ? "milhões" : "milhão"}`;
  }
  if (n >= 100_000) return `R$ ${Math.round(n / 1000)} mil`;
  return brl(n);
}

export const NOME_SEGMENTO: Record<string, string> = {
  leves: "veículos leves", motos: "motos", pesados: "caminhões e ônibus",
  agricolas: "máquinas agrícolas", outro: "veículos",
};
export const nomeSegmento = (s?: string | null) => NOME_SEGMENTO[String(s ?? "leves")] ?? "veículos";
