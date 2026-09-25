/**
 * Plano da cadência Frio (apresentação "Macro de Touchpoints", slides 10 a 12).
 * O porte define até onde vai; o último toque de cada porte é sempre o e-mail de encerramento.
 */
export type Canal = "email" | "ligacao" | "whatsapp" | "email_ou_whatsapp";
export type Passo = { toque: number; dia: number; canal: Canal; chave?: string; responde?: string; titulo?: string };

const BASE: Passo[] = [
  { toque: 1, dia: 0, canal: "email", chave: "frio_1" },
  { toque: 2, dia: 5, canal: "email", chave: "frio_2", responde: "frio_1" },
  { toque: 3, dia: 10, canal: "email", chave: "frio_3" },
  { toque: 4, dia: 13, canal: "ligacao", chave: "frio_l4", titulo: "Ligação: retomar o gancho dos e-mails e buscar uma agenda" },
  { toque: 5, dia: 16, canal: "email", chave: "frio_5" },
  { toque: 6, dia: 20, canal: "whatsapp", chave: "frio_w6", titulo: "WhatsApp: mensagem breve, mudando de canal depois dos e-mails" },
  { toque: 7, dia: 25, canal: "ligacao", chave: "frio_l7", titulo: "Ligação: pergunta objetiva e pedido de agenda" },
  { toque: 8, dia: 35, canal: "email", chave: "frio_8" },
  { toque: 9, dia: 40, canal: "ligacao", chave: "frio_l9", titulo: "Ligação: terceira tentativa de contato direto" },
  { toque: 10, dia: 45, canal: "email", chave: "frio_10" },
  { toque: 11, dia: 50, canal: "whatsapp", chave: "frio_w11", titulo: "WhatsApp: oferecer uma novidade concreta" },
  { toque: 12, dia: 60, canal: "email", chave: "frio_12" },
  { toque: 13, dia: 70, canal: "email", chave: "frio_13" },
  { toque: 14, dia: 80, canal: "email_ou_whatsapp", chave: "frio_14" },
  { toque: 15, dia: 90, canal: "email", chave: "frio_encerramento" },
];

const encerrar = (p: Passo): Passo => ({ ...p, canal: "email", chave: "frio_encerramento", responde: undefined, titulo: undefined });

export const PLANO_FRIO: Record<"A" | "B" | "C", Passo[]> = {
  A: BASE,
  B: [...BASE.slice(0, 10), encerrar(BASE[10])],
  C: [...BASE.slice(0, 7), encerrar(BASE[7])],
};

/** Pausa entre um ciclo e o próximo (próximo contato do grupo ou segundo ciclo do original). */
export const PAUSA_DIAS: Record<"A" | "B" | "C", number> = { A: 30, B: 30, C: 60 };

export const NOMES_MODELO: Record<string, string> = {
  frio_1: "Toque 1", frio_1_ciclo2: "Toque 1 (reenvio)", frio_2: "Toque 2", frio_3: "Toque 3", frio_5: "Toque 5",
  frio_8: "Toque 8", frio_10: "Toque 10", frio_12: "Toque 12", frio_13: "Toque 13", frio_14: "Toque 14", frio_encerramento: "Encerramento",
  frio_l4: "Ligação do toque 4", frio_w6: "WhatsApp do toque 6", frio_l7: "Ligação do toque 7", frio_l9: "Ligação do toque 9", frio_w11: "WhatsApp do toque 11",
};

/**
 * Plano da cadência Morno (apresentação, slides 8 e 9). Quase toda por WhatsApp:
 * o CRM monta as tarefas com o texto pronto; e-mail só onde há e-mail válido.
 * Último toque de cada porte = encerramento. Depois, o lead vira Frio e a cadência Frio começa em 30 dias.
 */
const BASE_MORNO: Passo[] = [
  { toque: 1, dia: 0, canal: "whatsapp", chave: "morno_w1", titulo: "WhatsApp: reengajar com um dado concreto, sem pedir reunião" },
  { toque: 2, dia: 5, canal: "whatsapp", chave: "morno_w2", titulo: "WhatsApp: a simulação usa os números da própria operação" },
  { toque: 3, dia: 8, canal: "whatsapp", chave: "morno_w3", titulo: "WhatsApp: ordem de grandeza com um exemplo do simulador" },
  { toque: 4, dia: 14, canal: "email_ou_whatsapp", chave: "morno_4" },
  { toque: 5, dia: 20, canal: "whatsapp", chave: "morno_w5", titulo: "WhatsApp: entender o que pesa na decisão" },
  { toque: 6, dia: 26, canal: "whatsapp", chave: "morno_w6", titulo: "WhatsApp: oferecer o piloto controlado" },
  { toque: 7, dia: 32, canal: "ligacao", chave: "morno_l7", titulo: "Ligação: retomar o piloto controlado" },
  { toque: 8, dia: 38, canal: "whatsapp", chave: "morno_w8", titulo: "WhatsApp: deixar tudo pronto para avaliar com calma" },
  { toque: 9, dia: 45, canal: "whatsapp", chave: "morno_w9", titulo: "WhatsApp: retomar e propor começar nas próximas semanas" },
  { toque: 10, dia: 52, canal: "whatsapp", chave: "morno_w10", titulo: "WhatsApp: simulação sem reunião, pelo site" },
  { toque: 11, dia: 60, canal: "whatsapp", chave: "morno_w11", titulo: "WhatsApp: validar se ainda faz sentido" },
  { toque: 12, dia: 70, canal: "email_ou_whatsapp", chave: "morno_encerramento" },
];
const encerrarMorno = (p: Passo): Passo => ({ ...p, canal: "email_ou_whatsapp", chave: "morno_encerramento", titulo: undefined });

export const PLANO_MORNO: Record<"A" | "B" | "C", Passo[]> = {
  A: BASE_MORNO,
  B: [...BASE_MORNO.slice(0, 8), encerrarMorno(BASE_MORNO[8])],
  C: [...BASE_MORNO.slice(0, 6), encerrarMorno(BASE_MORNO[6])],
};

/** Dias entre o fim do Morno e o início automático da cadência Frio. */
export const MORNO_PARA_FRIO_DIAS = 30;

export type TipoCadencia = "frio" | "morno";
export const NOME_CADENCIA: Record<TipoCadencia, string> = { frio: "Frio", morno: "Morno" };
export const planoDe = (tipo: string, porte: "A" | "B" | "C") => (tipo === "morno" ? PLANO_MORNO : PLANO_FRIO)[porte];
