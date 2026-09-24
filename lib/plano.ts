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

/** Pausa depois do fim do ciclo, antes do segundo ciclo. */
export const PAUSA_DIAS: Record<"A" | "B" | "C", number> = { A: 30, B: 30, C: 60 };

export const NOMES_MODELO: Record<string, string> = {
  frio_1: "Toque 1", frio_1_ciclo2: "Toque 1 (segundo ciclo)", frio_2: "Toque 2", frio_3: "Toque 3", frio_5: "Toque 5",
  frio_8: "Toque 8", frio_10: "Toque 10", frio_12: "Toque 12", frio_13: "Toque 13", frio_14: "Toque 14", frio_encerramento: "Encerramento",
  frio_l4: "Ligação do toque 4", frio_w6: "WhatsApp do toque 6", frio_l7: "Ligação do toque 7", frio_l9: "Ligação do toque 9", frio_w11: "WhatsApp do toque 11",
};
