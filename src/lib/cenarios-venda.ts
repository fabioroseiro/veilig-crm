/**
 * Cenários de venda sugeridos, por categoria de veículo.
 *
 * São PONTO DE PARTIDA, não texto final: o grupo edita, apaga e escreve os
 * seus. O argumento de moto é diferente do de carro, e quem está no balcão
 * conhece a linguagem que funciona.
 *
 * ── A regra que guiou a redação ────────────────────────────────────────────
 *
 * Material de venda escrito costuma pesar MAIS que o contrato numa disputa de
 * consumo. Então nenhum texto aqui promete o que a Cláusula 4.4 exclui.
 *
 * Concretamente: no cenário do retrovisor quebrado, o cliente PAGA A PEÇA e o
 * plano cobre a mão de obra. Dizer "tudo incluso" seria caracterizar cobertura
 * de evento futuro e incerto — exatamente o que a Cláusula 2.5 nega, e o que
 * enquadraria o plano como garantia estendida, operação privativa de
 * seguradora.
 *
 * O medo do cliente é argumento legítimo e está preservado: serviço em oficina
 * não autorizada pode comprometer a garantia de fábrica. O que muda é a
 * promessa — mão de obra por nossa conta, peça com nota fiscal, instalação
 * autorizada.
 */

export type CenarioSugerido = { titulo: string; texto: string };

const MOTO: CenarioSugerido[] = [
  {
    titulo: "Sua moto caiu e quebrou o retrovisor",
    texto:
      "Fora da concessionária o serviço sai mais barato — mas peça e instalação " +
      "em oficina não autorizada podem comprometer a garantia de fábrica.\n\n" +
      "Com o plano, a mão de obra é por nossa conta. Você paga só a peça, com " +
      "nota fiscal, instalada por quem é autorizado pelo fabricante. Sua " +
      "garantia continua intacta.",
  },
  {
    titulo: "Revisão sem susto no fim do mês",
    texto:
      "Revisão de moto chega sempre junto com outra conta. No plano, você paga " +
      "um valor fixo por mês e não é pego de surpresa — as revisões do " +
      "cronograma já estão pagas quando chegar a hora.",
  },
  {
    titulo: "Quem cuida é quem conhece",
    texto:
      "As revisões seguem o cronograma do fabricante, com peças conformes à " +
      "especificação e registro no histórico do veículo. Isso conta na hora de " +
      "revender.",
  },
];

const CARRO: CenarioSugerido[] = [
  {
    titulo: "Uma batidinha no estacionamento",
    texto:
      "Levar num funileiro qualquer sai mais barato — e pode comprometer a " +
      "garantia de fábrica.\n\n" +
      "Com o plano, a mão de obra é por nossa conta. Você paga só a peça, com " +
      "nota fiscal, instalada por quem é autorizado pelo fabricante.",
  },
  {
    titulo: "Revisão deixa de ser um susto",
    texto:
      "Em vez de uma conta grande a cada seis meses, um valor fixo por mês. " +
      "As revisões do cronograma já estão pagas quando chegar a hora.",
  },
  {
    titulo: "Histórico completo na revenda",
    texto:
      "Carro com todas as revisões feitas na concessionária, registradas no " +
      "histórico, vale mais na hora de vender — e vende mais rápido.",
  },
];

const FROTA: CenarioSugerido[] = [
  {
    titulo: "Custo de manutenção previsível",
    texto:
      "Manutenção de frota estoura orçamento porque é imprevisível. Com o " +
      "plano, o custo por veículo é fixo e cabe no planejamento do mês.",
  },
  {
    titulo: "Veículo parado custa mais que a revisão",
    texto:
      "Revisão em dia reduz quebra fora de hora. E com agendamento na " +
      "concessionária, o veículo volta a rodar mais rápido.",
  },
];

export function cenariosSugeridos(categorias: string[]): CenarioSugerido[] {
  const c = new Set(categorias);
  if (c.has("pesado") || c.has("utilitario")) return FROTA;
  if (c.has("moto")) return MOTO;
  return CARRO;
}
