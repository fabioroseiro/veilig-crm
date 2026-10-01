/**
 * VALOR ANUAL DE UM PLANO, por perfil de cliente.
 *
 * A base de cálculo é o PREÇO MÉDIO que a loja cobra hoje por cada revisão —
 * não o custo interno dela. Foi uma escolha deliberada: o lojista sabe de
 * cabeça quanto cobra por uma revisão de 10.000 km; quanto ela custa em peça
 * ao preço de compra mais hora de mecânico, ele teria que ir levantar.
 *
 * Consequência: o número que sai daqui é quanto o cliente pagaria AVULSO se
 * não tivesse plano. A margem da loja já está dentro dele.
 *
 * Serve ao painel de carteira na tela do plano: o grupo estima a mistura de
 * clientes que a loja atende e vê o custo MÉDIO — não o do caso extremo.
 * O plano é mutualizado; quem roda pouco banca quem roda muito, e precificar
 * pela cauda encareceria o plano para todo mundo e derrubaria a adesão.
 */

export type RevisaoCusto = {
  km: number | null;
  meses: number | null;
  /** true → km/meses são INTERVALO ("a cada X"); false → acumulado (uma vez) */
  recorrente: boolean;
  incluiPecas: boolean;
  incluiMaoObra: boolean;
  /** Preço médio COBRADO por revisão (já com a margem da loja). */
  custoPecas: number;
  custoMaoObra: number;
};

export type BeneficioCusto = {
  nome: string;
  custoAnoEstimado: number | null;
};

/**
 * Quantas vezes uma revisão acontece no primeiro ano, para um dado km/mês.
 *
 * "O que vier primeiro" entre km e prazo significa que o ciclo fecha no
 * gatilho que chegar antes — ou seja, a frequência é a MAIOR das duas, não a
 * menor. Um plano "a cada 10.000 km ou 12 meses" para quem roda 30.000 km/ano
 * acontece 3 vezes, não 1.
 */
export function ocorrenciasNoAno(r: RevisaoCusto, kmMes: number): number {
  const kmAno = kmMes * 12;

  if (r.recorrente) {
    const porKm = r.km && r.km > 0 ? kmAno / r.km : 0;
    const porTempo = r.meses && r.meses > 0 ? 12 / r.meses : 0;
    // a mais frequente das duas regras é a que manda
    return Math.floor(Math.max(porKm, porTempo));
  }

  // Não recorrente: acontece no máximo UMA vez, e só se o gatilho for
  // alcançado dentro do primeiro ano.
  const alcancaKm = !!r.km && r.km > 0 && r.km <= kmAno;
  const alcancaTempo = !!r.meses && r.meses > 0 && r.meses <= 12;
  return alcancaKm || alcancaTempo ? 1 : 0;
}

/** Custo de uma passagem, respeitando o que o plano cobre naquela revisão. */
export function custoDaRevisao(r: RevisaoCusto): number {
  return (r.incluiPecas ? r.custoPecas : 0) + (r.incluiMaoObra ? r.custoMaoObra : 0);
}

export type CustoPerfil = {
  revisoes: number;
  custoRevisoes: number;
  custoBeneficios: number;
  total: number;
};

export function custoAnualDoPerfil(
  revisoes: RevisaoCusto[],
  beneficios: BeneficioCusto[],
  kmMes: number
): CustoPerfil {
  let quantas = 0;
  let custoRevisoes = 0;

  for (const r of revisoes) {
    const n = ocorrenciasNoAno(r, kmMes);
    if (n === 0) continue;
    quantas += n;
    custoRevisoes += custoDaRevisao(r) * n;
  }

  // Benefícios não dependem de quilometragem: mão de obra grátis em
  // manutenções avulsas custa o mesmo para quem roda muito ou pouco, porque a
  // estimativa já é em horas por ano.
  const custoBeneficios = beneficios.reduce(
    (a, b) => a + (b.custoAnoEstimado ?? 0),
    0
  );

  return {
    revisoes: quantas,
    custoRevisoes: arred(custoRevisoes),
    custoBeneficios: arred(custoBeneficios),
    total: arred(custoRevisoes + custoBeneficios),
  };
}

/** Benefícios sem custo estimado deixam o total otimista — a tela precisa avisar. */
export function beneficiosSemCusto(beneficios: BeneficioCusto[]): string[] {
  return beneficios
    .filter((b) => b.custoAnoEstimado === null || b.custoAnoEstimado === undefined)
    .map((b) => b.nome || "(sem nome)");
}

/** Custo anual de um benefício de mão de obra: horas × valor da hora. */
export function custoDeHoras(horasAno: number, custoHora: number): number {
  return arred(horasAno * custoHora);
}

function arred(n: number): number {
  return Math.round(n * 100) / 100;
}
