// Validação do cadastro de loja.
// Decisão de produto: a loja cria a própria conta na Asaas e informa o walletId.
// Nós validamos formato (UUID) e que a wallet difere da conta da Veilig (emissora).
// A validação definitiva do walletId acontece na primeira cobrança com split.

import { z } from "zod";

// walletId da Asaas é um UUID. Esta constante é a wallet da própria Veilig
// (conta emissora); a loja NUNCA pode informar essa, senão o split é inválido.
export const VEILIG_WALLET_ID = process.env.VEILIG_WALLET_ID || "";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Normaliza CNPJ/CEP/telefone removendo máscara.
export const soDigitos = (s: string) => (s || "").replace(/\D/g, "");

// Validação de dígitos verificadores de CNPJ.
/**
 * Mantém letras (A-Z) e dígitos, descartando pontuação. Usado no CNPJ, que
 * desde 31/07/2026 aceita letras nas 12 primeiras posições.
 */
export function soAlfanumerico(v: string): string {
  return String(v ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/**
 * Valida CNPJ nos DOIS formatos: o numérico de sempre e o alfanumérico, em
 * vigor desde 31/07/2026 (IN RFB nº 2.229/2024).
 *
 * No formato novo, as 12 primeiras posições aceitam letras maiúsculas e os
 * dois dígitos verificadores continuam numéricos. O cálculo segue o mesmo
 * módulo 11 — o que muda é o VALOR de cada caractere: ASCII menos 48. Assim
 * os números continuam valendo o próprio dígito ('0' = 48-48 = 0) e as letras
 * vão de A=17 a Z=42.
 *
 * Foi desenhado assim de propósito pela Receita: com essa conversão, o CNPJ
 * numérico antigo produz exatamente o mesmo dígito verificador de antes. Por
 * isso uma função só atende os dois formatos.
 *
 * Os CNPJs existentes continuam válidos indefinidamente — os dois formatos
 * convivem, então rejeitar qualquer um dos dois é bug.
 */
export function cnpjValido(cnpj: string): boolean {
  const n = soAlfanumerico(cnpj);
  if (n.length !== 14) return false;

  // Os 2 últimos são SEMPRE numéricos, mesmo no formato alfanumérico.
  if (!/^[0-9]{2}$/.test(n.slice(12))) return false;

  // Sequência repetida (00000000000000, AAAAAAAAAAAA00…) passa na conta mas
  // não é CNPJ real.
  if (/^(.)\1{13}$/.test(n)) return false;

  // Valor do caractere = ASCII − 48.
  const valor = (c: string) => c.charCodeAt(0) - 48;

  const calc = (base: string) => {
    const pesos =
      base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base
      .split("")
      .reduce((acc, c, i) => acc + valor(c) * pesos[i], 0);
    const resto = soma % 11;
    // Resto 0 ou 1 → dígito 0 (equivale a "se 11 − resto der 10 ou 11, é 0").
    return resto < 2 ? 0 : 11 - resto;
  };

  const d1 = calc(n.slice(0, 12));
  const d2 = calc(n.slice(0, 12) + d1);
  return n.endsWith(`${d1}${d2}`);
}

export const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

// Schema do formulário de loja.
export const lojaSchema = z.object({
  // groupId só é usado quando quem cadastra é a Veilig; para group_admin vem da sessão.
  groupId: z.string().uuid("Selecione o grupo.").optional(),
  fabricante: z.string().trim().min(1, "Selecione o fabricante."),
  razaoSocial: z.string().min(2, "Informe a razão social."),
  nomeFantasia: z.string().min(2, "Informe o nome fantasia."),
  cnpj: z
    .string()
    .refine((v) => cnpjValido(v), "CNPJ inválido."),
  inscricaoEstadual: z.string().optional(),
  cep: z.string().refine((v) => soDigitos(v).length === 8, "CEP inválido."),
  logradouro: z.string().min(2, "Informe o logradouro."),
  numero: z.string().min(1, "Informe o número."),
  complemento: z.string().optional(),
  bairro: z.string().min(2, "Informe o bairro."),
  cidade: z.string().min(2, "Informe a cidade."),
  uf: z.enum(UFS as [string, ...string[]], { message: "UF inválida." }),
  responsavelNome: z.string().min(2, "Informe o responsável."),
  responsavelCpf: z.string().optional(),
  email: z.string().email("E-mail inválido."),
  telefone: z
    .string()
    .refine((v) => soDigitos(v).length >= 10, "Telefone inválido."),
  // OPCIONAL: a loja abre a própria conta na Asaas, e isso leva dias. Exigir
  // aqui travava todo o onboarding — cadastro de usuários, modelos e preços —
  // por causa de um dado que só é necessário na hora de VENDER.
  //
  // A venda barra quem estiver sem ele, com mensagem própria.
  walletId: z
    .string()
    .optional()
    .default("")
    .refine(
      (v) => !v.trim() || UUID_RE.test(v.trim()),
      "walletId inválido (deve ser um UUID da Asaas)."
    )
    .refine(
      (v) => !v.trim() || !VEILIG_WALLET_ID || v.trim().toLowerCase() !== VEILIG_WALLET_ID.toLowerCase(),
      "Este walletId é o da conta emissora (Veilig). Informe o walletId da conta da loja."
    ),
});

export type LojaInput = z.infer<typeof lojaSchema>;
