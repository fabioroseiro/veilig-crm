/**
 * Qualificação do lead antes da reunião (etapa "Agenda marcada").
 * Guardada no campo diagnostico do grupo. A chave "decisor" já existia e passa a ser "quem aprova".
 * O portão é um aviso: mover sem os obrigatórios pede justificativa, que fica no histórico.
 */
export type Criterio = {
  chave: string; rotulo: string; obrigatorio: boolean;
  opcoes?: string[];            // sem opções = texto curto
  descobrir: string;            // como descobrir na conversa, sem perguntar direto
};

export const CRITERIOS: Criterio[] = [
  { chave: "dor", rotulo: "Dor principal", obrigatorio: true,
    opcoes: ["Perda de clientes nas revisões", "Prever ou antecipar caixa", "Ocupação da oficina", "Fidelizar para a recompra", "Outra"],
    descobrir: "\"Quando você olha o pós-venda hoje, o que mais incomoda: cliente que some depois das revisões ou o caixa da oficina oscilando mês a mês?\"" },
  { chave: "encaixe", rotulo: "O produto atende essa dor?", obrigatorio: true,
    opcoes: ["Atende bem", "Atende em parte", "Não atende"],
    descobrir: "Avaliação sua, não uma pergunta: compare a dor que ele contou com o que o plano resolve (retenção, receita recorrente, previsibilidade)." },
  { chave: "papel", rotulo: "O contato é o decisor?", obrigatorio: true,
    opcoes: ["Decide", "Influencia a decisão", "Não participa"],
    descobrir: "\"Num projeto como esse, como costuma ser o caminho aí dentro? Quem mais gostaria de ver esses números?\"" },
  { chave: "decisor", rotulo: "Quem aprova o investimento", obrigatorio: false,
    descobrir: "\"Quando vocês aprovaram o último sistema ou fornecedor, quem deu a palavra final?\"" },
  { chave: "orcamento", rotulo: "Orçamento", obrigatorio: false,
    opcoes: ["Aprovado", "Em discussão", "Não previsto", "Não sabe"],
    descobrir: "\"Iniciativas de pós-venda já têm verba separada para este ano, ou entram no planejamento do próximo?\"" },
  { chave: "implantacao", rotulo: "Como costumam implantar", obrigatorio: false,
    opcoes: ["Piloto em poucas lojas", "Todas as lojas de uma vez", "Ainda não sabe"],
    descobrir: "\"Quando vocês trazem algo novo, costumam testar numa loja primeiro ou já levar para o grupo todo?\"" },
];

export const ETAPA_PORTAO = 3; // Agenda marcada

type Diag = Record<string, string | null | undefined> | null | undefined;
const preenchido = (d: Diag, k: string) => !!(d && typeof d[k] === "string" && d[k]!.trim());

export const obrigatoriosFaltando = (d: Diag) => CRITERIOS.filter((c) => c.obrigatorio && !preenchido(d, c.chave)).map((c) => c.rotulo);
export const notaQualificacao = (d: Diag) => ({ feitos: CRITERIOS.filter((c) => preenchido(d, c.chave)).length, total: CRITERIOS.length });
