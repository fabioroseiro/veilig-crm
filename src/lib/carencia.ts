// ============================================================================
// CARÊNCIA — período em que o cliente JÁ PAGA mas ainda NÃO PODE USAR o plano.
//
// Por que existe: o plano é manutenção pré-paga. Sem carência, alguém compra um
// seminovo já precisando de revisão, assina hoje e usa amanhã — o plano vira
// "conserto subsidiado" em vez de manutenção preventiva. A carência protege o
// modelo.
//
// Regras (decididas com o Fabio):
//  • A carência varia pela IDADE do veículo, em faixas. Veículo mais velho
//    precisa de manutenção mais cedo, então espera mais.
//  • Quem define os valores é o GRUPO, por plano. A Veilig não impõe números.
//  • Durante a carência a cobrança corre normalmente. A carência limita o
//    DIREITO DE USO, não o pagamento.
//  • A faixa é decidida UMA VEZ, na venda, e não muda depois. O veículo
//    envelhecer durante o plano não recalcula nada.
//  • A contagem começa na DATA DA VENDA.
//
// Este arquivo é a fonte única do cálculo: venda, portal, listas e painéis
// usam as mesmas funções, para nunca divergirem.
// ============================================================================

export type FaixaCarencia = "zero_km" | "ate_2_anos" | "3_a_5_anos" | "6_mais";

/** Política de aceitação e carência que vem do plano (nível do grupo). */
export type PoliticaCarencia = {
  aceitaZeroKm: boolean;
  /** 0 = só zero km (não aceita seminovo); 99 = sem limite de idade. */
  idadeMaximaAnos: number;
  carenciaZeroKm: number;
  carenciaAte2Anos: number;
  carencia3a5Anos: number;
  carencia6Mais: number;
};

export const SEM_LIMITE_IDADE = 99;

export const ROTULOS_FAIXA: Record<FaixaCarencia, string> = {
  zero_km: "Zero km",
  ate_2_anos: "0 a 2 anos",
  "3_a_5_anos": "3 a 5 anos",
  "6_mais": "6 anos ou mais",
};

// ── Idade do veículo ────────────────────────────────────────────────────────

/**
 * Idade em ano-calendário simples: ano atual − ano do veículo.
 * Escolhemos o simples (e não considerar mês) porque é o mais fácil de
 * explicar ao cliente no balcão.
 *
 * Ano-modelo pode ser MAIOR que o ano atual (moto 2027 vendida em 2026), o que
 * daria idade negativa. Nesse caso tratamos como 0.
 */
export function idadeVeiculo(anoVeiculo: number, referencia: Date = new Date()): number {
  const idade = referencia.getFullYear() - anoVeiculo;
  return idade < 0 ? 0 : idade;
}

// ── Faixa ───────────────────────────────────────────────────────────────────

/**
 * Zero km é uma CATEGORIA, não uma idade: é o veículo que sai da loja agora,
 * sem histórico desconhecido. Por isso vem antes de qualquer faixa etária —
 * um zero km de ano-modelo anterior continua sendo zero km.
 */
export function faixaDeCarencia(zeroKm: boolean, idadeAnos: number): FaixaCarencia {
  if (zeroKm) return "zero_km";
  if (idadeAnos <= 2) return "ate_2_anos";
  if (idadeAnos <= 5) return "3_a_5_anos";
  return "6_mais";
}

export function mesesDaFaixa(politica: PoliticaCarencia, faixa: FaixaCarencia): number {
  switch (faixa) {
    case "zero_km":
      return politica.carenciaZeroKm;
    case "ate_2_anos":
      return politica.carenciaAte2Anos;
    case "3_a_5_anos":
      return politica.carencia3a5Anos;
    case "6_mais":
      return politica.carencia6Mais;
  }
}

// ── Datas ───────────────────────────────────────────────────────────────────

/**
 * Soma meses tratando o fim do mês corretamente.
 * 31/01 + 1 mês = 28/02 (e não 03/03, que é o que o JS faria sozinho).
 */
export function somarMeses(data: Date, meses: number): Date {
  const d = new Date(data.getTime());
  const diaOriginal = d.getDate();
  d.setDate(1); // evita o "transbordo" do JS antes de mudar o mês
  d.setMonth(d.getMonth() + meses);
  const ultimoDiaDoMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(diaOriginal, ultimoDiaDoMes));
  return d;
}

/** Só a parte da data (zera o horário), para comparações justas. */
function soData(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ── Avaliação da venda ──────────────────────────────────────────────────────

export type AvaliacaoCarencia = {
  /** O plano aceita este veículo? */
  elegivel: boolean;
  /** Se não elegível, o motivo em linguagem de balcão. */
  motivo?: string;
  idadeAnos: number;
  faixa: FaixaCarencia;
  faixaRotulo: string;
  meses: number;
  /** Data a partir da qual o cliente pode usar. null = sem carência. */
  carenciaAte: Date | null;
};

/**
 * Decide, no momento da venda, se o veículo é aceito pelo plano e qual a
 * carência aplicada. É a função que a tela do vendedor e a action usam —
 * as duas passam pelo mesmo caminho, então o que o vendedor vê na tela é
 * exatamente o que vai ser gravado.
 */
export function avaliarCarencia(params: {
  politica: PoliticaCarencia;
  anoVeiculo: number;
  zeroKm: boolean;
  dataVenda?: Date;
}): AvaliacaoCarencia {
  const { politica, anoVeiculo, zeroKm } = params;
  const dataVenda = params.dataVenda ?? new Date();

  const idadeAnos = zeroKm ? 0 : idadeVeiculo(anoVeiculo, dataVenda);
  const faixa = faixaDeCarencia(zeroKm, idadeAnos);
  const meses = mesesDaFaixa(politica, faixa);
  const faixaRotulo = ROTULOS_FAIXA[faixa];

  // elegibilidade
  let elegivel = true;
  let motivo: string | undefined;

  if (zeroKm && !politica.aceitaZeroKm) {
    elegivel = false;
    motivo = "Este plano não aceita veículos zero km.";
  } else if (!zeroKm && politica.idadeMaximaAnos === 0) {
    elegivel = false;
    motivo = "Este plano é exclusivo para veículos zero km.";
  } else if (!zeroKm && idadeAnos > politica.idadeMaximaAnos) {
    elegivel = false;
    motivo =
      `Este plano aceita veículos de até ${politica.idadeMaximaAnos} ` +
      `${politica.idadeMaximaAnos === 1 ? "ano" : "anos"}. ` +
      `Este tem ${idadeAnos} ${idadeAnos === 1 ? "ano" : "anos"}.`;
  }

  const carenciaAte =
    elegivel && meses > 0 ? soData(somarMeses(dataVenda, meses)) : null;

  return { elegivel, motivo, idadeAnos, faixa, faixaRotulo, meses, carenciaAte };
}

// ── Consulta do estado (usado no portal, listas e painéis) ──────────────────

/**
 * O cliente ainda está em carência hoje?
 * NULL em carenciaAte = sem carência (inclui as assinaturas antigas, anteriores
 * a esta funcionalidade, que ficam liberadas).
 *
 * Regra de borda: no DIA da liberação o cliente JÁ PODE usar. Por isso a
 * comparação é estritamente "hoje < data", e não "<=".
 */
export function emCarencia(
  carenciaAte: Date | string | null | undefined,
  referencia: Date = new Date()
): boolean {
  if (!carenciaAte) return false;
  const ate = normalizarData(carenciaAte);
  if (!ate) return false;
  return soData(referencia).getTime() < ate.getTime();
}

/** Dias que ainda faltam para liberar (0 se já liberado). */
export function diasRestantesCarencia(
  carenciaAte: Date | string | null | undefined,
  referencia: Date = new Date()
): number {
  if (!carenciaAte) return 0;
  if (!emCarencia(carenciaAte, referencia)) return 0;
  const ate = normalizarData(carenciaAte);
  if (!ate) return 0;
  const diff = ate.getTime() - soData(referencia).getTime();
  return Math.ceil(diff / 86_400_000);
}

/**
 * Aceita Date ou string. O Postgres devolve `date` como "2026-06-10";
 * `new Date("2026-06-10")` interpreta como UTC e, no fuso do Brasil, volta
 * um dia (09/06 às 21h). Por isso montamos a data por partes.
 */
export function normalizarData(valor: Date | string): Date | null {
  if (valor instanceof Date) return soData(valor);
  const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    const d = new Date(valor);
    return isNaN(d.getTime()) ? null : soData(d);
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** "10/06/2026" — formato de balcão. */
export function formatarData(valor: Date | string | null | undefined): string {
  if (!valor) return "";
  const d = normalizarData(valor);
  if (!d) return "";
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${d.getFullYear()}`;
}

/** "AAAA-MM-DD" — formato que o Postgres espera na coluna `date`. */
export function paraISO(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Texto curto para selo de lista: "Carência até 10/06/2026". */
export function rotuloCarencia(carenciaAte: Date | string | null | undefined): string {
  return emCarencia(carenciaAte) ? `Carência até ${formatarData(carenciaAte)}` : "";
}

// ── Preço por faixa de idade ────────────────────────────────────────────────
// O preço que a loja cadastra é o do VEÍCULO NOVO. Para seminovo, o plano
// define um acréscimo percentual por faixa — as mesmas faixas da carência.
//
// Antes o preço era cadastrado por modelo+ano, o que tinha dois defeitos: a
// loja precisava de uma linha por ano, e a tabela envelhecia sozinha (o preço
// do "modelo 2023" continuava o mesmo enquanto o veículo ficava um ano mais
// velho a cada virada de ano). Com acréscimo por faixa, a idade é calculada na
// hora da venda e o preço acompanha.

export type PoliticaPreco = {
  acrescimoAte2Anos: number;
  acrescimo3a5Anos: number;
  acrescimo6Mais: number;
};

export function acrescimoDaFaixa(politica: PoliticaPreco, faixa: FaixaCarencia): number {
  switch (faixa) {
    case "zero_km":
      return 0; // o preço-base JÁ é o do veículo novo
    case "ate_2_anos":
      return politica.acrescimoAte2Anos;
    case "3_a_5_anos":
      return politica.acrescimo3a5Anos;
    case "6_mais":
      return politica.acrescimo6Mais;
  }
}

export type PrecoCalculado = {
  base: number;
  acrescimoPercent: number;
  acrescimoValor: number;
  final: number;
};

/**
 * Arredonda para centavos usando Math.round sobre o valor em centavos, para
 * evitar o clássico 115.00000000000001 do ponto flutuante.
 */
export function calcularPreco(
  precoBase: number,
  politica: PoliticaPreco,
  faixa: FaixaCarencia
): PrecoCalculado {
  const acrescimoPercent = acrescimoDaFaixa(politica, faixa) || 0;
  const final = Math.round(precoBase * (1 + acrescimoPercent / 100) * 100) / 100;
  const acrescimoValor = Math.round((final - precoBase) * 100) / 100;
  return { base: precoBase, acrescimoPercent, acrescimoValor, final };
}

/** "1.234,56" — formato brasileiro para exibição. */
export function formatarBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
