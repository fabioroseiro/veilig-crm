/**
 * Processa uma lista em lotes paralelos, com orçamento de tempo.
 *
 * Por que existe: o ressync percorria as assinaturas UMA POR VEZ, cada uma
 * esperando a resposta da Asaas. A meio segundo por chamada, ~120 assinaturas
 * já estouravam o tempo limite da função — e a falha era SILENCIOSA: nada
 * quebrava na tela, os status simplesmente paravam de ser corrigidos.
 *
 * Duas proteções aqui:
 *
 *  • Paralelismo LIMITADO. Disparar tudo de uma vez seria pior que o serial:
 *    a Asaas responderia com 429 e perderíamos as respostas. Um punhado por
 *    vez respeita o limite dela e ainda assim multiplica a vazão.
 *
 *  • Orçamento de TEMPO. Se o relógio acabar, paramos de propósito e
 *    devolvemos o que faltou, em vez de sermos mortos no meio da operação. O
 *    que sobrou entra na próxima execução — o cron roda todo dia.
 */
export async function processarEmLotes<T, R>(
  itens: T[],
  processar: (item: T) => Promise<R>,
  opcoes: { tamanhoLote?: number; orcamentoMs?: number } = {}
): Promise<{ resultados: R[]; processados: number; restantes: number; esgotou: boolean }> {
  const tamanhoLote = opcoes.tamanhoLote ?? 8;
  const orcamentoMs = opcoes.orcamentoMs ?? 45_000;
  const inicio = Date.now();

  const resultados: R[] = [];
  let processados = 0;
  let esgotou = false;

  for (let i = 0; i < itens.length; i += tamanhoLote) {
    // Checa o relógio ANTES de começar o lote, não depois: começar um lote
    // com 200ms de sobra garantiria estourar no meio dele.
    if (Date.now() - inicio > orcamentoMs) {
      esgotou = true;
      break;
    }

    const lote = itens.slice(i, i + tamanhoLote);
    // allSettled e não all: uma falha isolada não pode abortar o lote inteiro.
    const saidas = await Promise.allSettled(lote.map(processar));
    for (const s of saidas) {
      if (s.status === "fulfilled") resultados.push(s.value);
    }
    processados += lote.length;
  }

  return {
    resultados,
    processados,
    restantes: itens.length - processados,
    esgotou,
  };
}
