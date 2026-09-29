/**
 * Mesmas contas do simulador do site (planilha Simulador_Veilig_Revisado).
 * Se mudar lá, mude aqui também.
 */
export const FATOR_PERDA = 0.5;
export const MESES_ANO = 12;
export const REVISOES_ANO = 1.2;
export const MARGEM = 1.35;
export const TARIFA_MEIO_PAGAMENTO = 0.02;

const FAIXAS_ADESAO = [
  { ate: 100, adesao: 0.1 },
  { ate: 170, adesao: 0.08 },
  { ate: Infinity, adesao: 0.06 },
];

export type Entradas = { lojas: number; vendasLoja: number; ticket: number };

export function calcular({ lojas, vendasLoja, ticket }: Entradas) {
  const vendasMes = lojas * vendasLoja;
  const rua = vendasMes * FATOR_PERDA * MESES_ANO * ticket;
  const anual = ticket * REVISOES_ANO * MARGEM;
  const mensal = anual / MESES_ANO;
  const adesao = FAIXAS_ADESAO.find((f) => Math.round(mensal) <= f.ate)!.adesao;
  const aderentes = vendasMes * MESES_ANO * adesao;
  const regime = aderentes * anual;
  const caixa1 = 78 * vendasMes * adesao * mensal; // 1+2+…+12 grupos de novos clientes pagando no ano 1
  return { vendasMes, rua, anual, mensal, adesao, aderentes, regime, caixa1 };
}

/** Custos e resultado para a concessionária com a condição da proposta. */
export function retorno(e: Entradas, recorrenteLoja: number, setup: number, feePct: number) {
  const r = calcular(e);
  const fee = feePct / 100;
  const custoAno1 = recorrenteLoja * e.lojas * MESES_ANO + r.caixa1 * (1 - TARIFA_MEIO_PAGAMENTO) * fee + setup;
  const custoRegime = recorrenteLoja * e.lojas * MESES_ANO + r.regime * (1 - TARIFA_MEIO_PAGAMENTO) * fee;
  return { ...r, custoAno1, ficaAno1: r.caixa1 - custoAno1, custoRegime, ficaRegime: r.regime - custoRegime };
}
