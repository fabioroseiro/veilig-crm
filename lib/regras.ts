/** Regras do funil — fonte única para telas e ações. */

export const ETAPAS: Record<number, { nome: string; prob: number }> = {
  1: { nome: "Lead", prob: 0.1 },
  2: { nome: "Contato feito", prob: 0.2 },
  3: { nome: "Agenda marcada", prob: 0.35 },
  4: { nome: "Proposta enviada", prob: 0.5 },
  5: { nome: "Negociação", prob: 0.7 },
  6: { nome: "Piloto acordado", prob: 0.85 },
  7: { nome: "Fechado", prob: 1 },
};
export const ETAPA_PASSA_CLOSER = 4; // Proposta enviada: o lead passa para o closer.
export const ETAPA_VIRA_QUENTE = 3;  // Agenda marcada ou além: temperatura Quente.

export const TEMPERATURAS = {
  quente: { nome: "Quente", cor: "#d9480f" },
  morno: { nome: "Morno", cor: "#e8a33d" },
  frio: { nome: "Frio", cor: "#4ec3e0" },
  oscilante: { nome: "Oscilante", cor: "#8a6dd8" },
} as const;
export type Temperatura = keyof typeof TEMPERATURAS;

export const SEGMENTOS: Record<string, string> = {
  motos: "Motos", leves: "Veículos leves", pesados: "Caminhões e ônibus", agricolas: "Máquinas agrícolas", outro: "Outro",
};

export const PACOTES: Record<string, string> = { essencial: "Essencial", performance: "Performance", completo: "Completo" };

export const TIPOS_TAREFA: Record<string, string> = { whatsapp: "WhatsApp", ligacao: "Ligação", email: "E-mail", outro: "Ação" };

export function porte(numLojas: number): "A" | "B" | "C" {
  return numLojas >= 10 ? "A" : numLojas >= 4 ? "B" : "C";
}

export type Precos = { essencial: number | null; performance: number | null; completo: number | null };

/** Recorrente potencial/mês: no porte A conta só as lojas do piloto (regra da planilha). */
export function potencial(numLojas: number, pacote: string, precos: Precos, lojasPiloto: number) {
  const preco = precos[pacote as keyof Precos] ?? null;
  if (preco == null) return null;
  const lojas = porte(numLojas) === "A" ? Math.min(lojasPiloto, numLojas) : numLojas;
  return preco * lojas;
}

export function ponderado(pot: number | null, etapa: number, situacao: string) {
  if (pot == null || situacao !== "ativo") return null;
  return pot * ETAPAS[etapa].prob;
}

export function diasDesde(data: string | Date | null) {
  if (!data) return null;
  return Math.floor((Date.now() - new Date(data).getTime()) / 86400000);
}

export const brl = (v: number | null | undefined) =>
  v == null ? "—" : "R$ " + Math.round(v).toLocaleString("pt-BR");

export const dataBR = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

/** Hoje no fuso de São Paulo, no formato AAAA-MM-DD. */
export function hojeISO() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}
export function somaDias(iso: string, dias: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function linkWhatsApp(numero: string | null, texto?: string | null) {
  if (!numero) return null;
  return `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}

/** Troca [Nome], [Grupo] etc. pelos dados do lead. */
export function preencher(modelo: string, v: { nome?: string | null; grupo?: string | null; origem?: string | null }) {
  const primeiro = (v.nome || "").trim().split(/\s+/)[0] || "";
  const cap = primeiro ? primeiro[0].toUpperCase() + primeiro.slice(1).toLowerCase() : "";
  return modelo.replace(/\[Nome\]/g, cap).replace(/\[Grupo\]/g, v.grupo || "").replace(/\[Origem\]/g, v.origem || "");
}
