/**
 * O que sobrou do documento escrito da proposta: a formatação de data, usada em
 * vários lugares do CRM. O corpo da proposta agora é a apresentação em slides
 * (lib/proposta/render.ts), e o PDF sai do navegador do próprio cliente.
 */
export const dataExtenso = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
