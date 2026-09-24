/** Normalização de telefone e e-mail — usada na importação e nos formulários. */

const soDigitos = (s: string) => (s || "").replace(/\D/g, "");

/**
 * Recebe DDD e número (ou o número completo) e devolve o celular no formato do
 * wa.me (55 + DDD + 9 dígitos). Celular antigo de 8 dígitos ganha o 9 na frente.
 * Fixo (começa com 2 a 5) devolve null: não tem WhatsApp garantido.
 */
export function normalizarCelular(numero: string, ddd?: string | number | null): string | null {
  let d = soDigitos(String(numero));
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  let area = soDigitos(String(ddd ?? ""));
  if (!area || d.length >= 10) {
    if (d.length < 10) return null;
    area = d.slice(0, 2);
    d = d.slice(2);
  }
  if (area.length !== 2) return null;
  if (d.length === 8) {
    if (!/^[6-9]/.test(d)) return null; // fixo
    d = "9" + d;
  }
  if (d.length !== 9 || !d.startsWith("9")) return null;
  return `55${area}${d}`;
}

/** Separa células com vários números ("81 9999-0000 / 81 8888-0000"). */
export function separarTelefones(celula: string): string[] {
  return String(celula || "").split(/\s*\/\s*|;|,(?!\d)/).map((s) => s.trim()).filter(Boolean);
}

const TROCAS: [RegExp, string][] = [
  [/@gmai\.com$/, "@gmail.com"], [/@gmail\.om$/, "@gmail.com"], [/@gmial\.com$/, "@gmail.com"],
  [/@gmail\.con$/, "@gmail.com"], [/@gamil\.com$/, "@gmail.com"], [/@hotmil\.com$/, "@hotmail.com"],
  [/@hotmai\.com$/, "@hotmail.com"], [/@hotmail\.con$/, "@hotmail.com"], [/@hotmial\.com$/, "@hotmail.com"],
  [/@yahoo\.com\.b$/, "@yahoo.com.br"], [/\.com\.b$/, ".com.br"],
];

export type EmailAnalise = { email: string | null; status: "ok" | "corrigir" | "ausente"; sugestao?: string };

export function analisarEmail(bruto: string | null | undefined): EmailAnalise {
  const e = String(bruto || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!e) return { email: null, status: "ausente" };
  for (const [re, troca] of TROCAS) if (re.test(e)) return { email: e, status: "corrigir", sugestao: e.replace(re, troca) };
  // Só caracteres aceitos em e-mail comum (sem acento) e domínio com extensão.
  if (!/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(e)) return { email: e, status: "corrigir" };
  return { email: e, status: "ok" };
}

export const dominio = (email: string | null) => (email && email.includes("@") ? email.split("@")[1] : "");
