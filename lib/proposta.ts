import "server-only";
import { randomBytes } from "crypto";
import { q, q1 } from "./db";
import { lerConfig } from "./config";
import { retorno } from "./simulador";
import { somaDias, hojeISO } from "./regras";

import { PACOTES_PROPOSTA, onboardingSugerido, type DadosProposta, type Pacote } from "./proposta-tipos";

export type Proposta = {
  id: string; grupo_id: string; numero: string; token: string; status: string; dados: DadosProposta;
  validade: string; enviada_em: string | null; enviada_para: string | null; aberta_em: string | null; aberturas: number;
  aceita_em: string | null; aceite: { nome: string; cargo: string; email: string; ip: string | null; onboarding?: "consultivo" | "online" } | null;
  prazo_pedido: { data: string; motivo: string; em: string } | null; criado_em: string;
};

type Tabela = {
  recorrente: Record<Pacote, number>; setup: { ate3: number; ate9: number; mais: number | null };
  fee: number; validade_dias: number; vencimento_dia: number;
};

export async function tabela(): Promise<Tabela> {
  const r = await q1<{ valor: Tabela }>("SELECT valor FROM config WHERE chave='tabela_proposta'");
  return r?.valor ?? {
    recorrente: { essencial: 400, performance: 900, completo: 1300 }, setup: { ate3: 5000, ate9: 12000, mais: null },
    fee: 10, validade_dias: 15, vencimento_dia: 10,
  };
}

export const setupTabela = (t: Tabela, lojas: number) => (lojas <= 3 ? t.setup.ate3 : lojas <= 9 ? t.setup.ate9 : t.setup.mais ?? 0);

/** Números da simulação que o lead fez no site (se fez), lidos do histórico. */
async function simulacaoDoSite(grupoId: string) {
  const a = await q1<{ detalhe: string }>(
    "SELECT detalhe FROM atividade WHERE grupo_id=$1 AND tipo='site' AND detalhe LIKE '%Ticket de revisão%' ORDER BY em DESC LIMIT 1", [grupoId]);
  if (!a) return null;
  const num = (rotulo: string) => {
    const m = a.detalhe.match(new RegExp(`${rotulo}: (?:R\\$ )?([\\d.]+)`));
    return m ? Number(m[1].replace(/\./g, "")) : null;
  };
  return { vendasLoja: num("Vendas por loja/mês"), ticket: num("Ticket de revisão") };
}

/** Dados iniciais de uma proposta nova, a partir do que o CRM já sabe do grupo. */
export async function dadosIniciais(grupoId: string): Promise<DadosProposta> {
  const g = await q1<{ nome: string; marcas: string | null; num_lojas: number; entregas_mes: number | null; pacote: Pacote; diagnostico: Record<string, string> }>(
    "SELECT nome, marcas, num_lojas, entregas_mes, pacote, diagnostico FROM grupo WHERE id=$1", [grupoId]);
  if (!g) throw new Error("Grupo não encontrado");
  const c = await q1<{ nome: string | null; cargo: string | null; email: string | null }>(
    "SELECT nome, cargo, email FROM contato WHERE grupo_id=$1 ORDER BY principal DESC, criado_em LIMIT 1", [grupoId]);
  const [t, cfg, site] = await Promise.all([tabela(), lerConfig(), simulacaoDoSite(grupoId)]);
  const d = g.diagnostico || {};
  const pacote: Pacote = g.pacote in PACOTES_PROPOSTA ? g.pacote : "essencial";
  const vendasLoja = Number(d.entregas_loja) || site?.vendasLoja || (g.entregas_mes ? Math.round(g.entregas_mes / g.num_lojas) : 0) || 30;
  return {
    empresa: g.nome,
    contato_nome: c?.nome ?? "",
    contato_cargo: c?.cargo ?? "",
    contato_email: c?.email ?? "",
    marcas: g.marcas ?? "",
    lojas: g.num_lojas,
    vendas_loja: vendasLoja,
    ticket: Number(String(d.ticket_revisao ?? "").replace(/\D/g, "")) || site?.ticket || 1000,
    pacote,
    recorrente_loja: cfg.precos[pacote] ?? t.recorrente[pacote],
    setup_total: setupTabela(t, g.num_lojas),
    setup_obs: "",
    fee: t.fee,
    onboarding: onboardingSugerido(g.num_lojas),
    vencimento_dia: t.vencimento_dia,
    mostrar_simulacao: true,
    observacoes: "",
  };
}

/** Contas que aparecem na proposta (sempre recalculadas a partir dos dados). */
export function contas(d: DadosProposta) {
  const r = retorno({ lojas: d.lojas, vendasLoja: d.vendas_loja, ticket: d.ticket }, d.recorrente_loja, d.setup_total, d.fee);
  return { ...r, mensalVeilig: d.recorrente_loja * d.lojas };
}

export async function novaProposta(grupoId: string, usuarioId: string) {
  const t = await tabela();
  const dados = await dadosIniciais(grupoId);
  const seq = await q1<{ n: string }>("SELECT nextval('proposta_numero') AS n");
  const numero = `VLG-${new Date().getFullYear()}-${String(seq!.n).padStart(4, "0")}`;
  const token = randomBytes(18).toString("base64url");
  const p = await q1<{ id: string }>(
    `INSERT INTO proposta (grupo_id, numero, token, dados, validade, criada_por) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [grupoId, numero, token, dados, somaDias(hojeISO(), t.validade_dias), usuarioId]);
  return p!.id;
}

const COLUNAS = `id, grupo_id, numero, token, status, dados, to_char(validade,'YYYY-MM-DD') AS validade, enviada_em, enviada_para,
  aberta_em, aberturas, aceita_em, aceite, prazo_pedido, criado_em`;

export const propostaPorId = (id: string) => q1<Proposta>(`SELECT ${COLUNAS} FROM proposta WHERE id=$1`, [id]);
export const propostaPorToken = (token: string) => q1<Proposta>(`SELECT ${COLUNAS} FROM proposta WHERE token=$1`, [token]);
export const propostasDoGrupo = (grupoId: string) => q<Proposta>(`SELECT ${COLUNAS} FROM proposta WHERE grupo_id=$1 ORDER BY criado_em DESC`, [grupoId]);

export async function remetenteProposta() {
  const r = await q1<{ valor: { email: string; nome: string; whatsapp?: string } }>("SELECT valor FROM config WHERE chave='remetente_proposta'");
  return r?.valor ?? { email: "fabio.roseiro@vendas.veilig.com.br", nome: "Fabio Roseiro", whatsapp: "" };
}

export const vencida = (p: Proposta) => p.validade < hojeISO();

/** Data de emissão (envio ou criação) no formato AAAA-MM-DD, no fuso de São Paulo. */
export const emitidaISO = (p: Proposta) =>
  new Date(p.enviada_em ?? p.criado_em).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
