import { z } from "zod";
import { cnpjValido, soDigitos, soAlfanumerico } from "./loja-validation";

/** Percentual do contrato: aceita "2" ou "2,5". */
function percentualContrato(min: number, max: number, msg: string) {
  return z
    .union([z.string(), z.number()])
    .transform((v) => {
      const s = String(v ?? "").trim().replace(",", ".");
      if (s === "") return 0;
      const n = Number(s);
      return Number.isFinite(n) ? n : NaN;
    })
    .refine((n) => Number.isFinite(n) && n >= min && n <= max, msg);
}

export const grupoSchema = z.object({
  razaoSocial: z.string().trim().min(2, "Informe a razão social."),
  nomeFantasia: z.string().trim().optional().default(""),
  // Obrigatório: contrato sem CNPJ da parte contratada não serve para disputa.
  // soAlfanumerico e não soDigitos — um CNPJ com letras tem zero dígitos nas
  // primeiras posições e seria recusado como "não informado".
  cnpj: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine((v) => soAlfanumerico(v).length > 0, "Informe o CNPJ do grupo.")
    .refine((v) => cnpjValido(v), "CNPJ inválido."),

  // ── Parâmetros do contrato ───────────────────────────────────────────────
  multaPercent: percentualContrato(0, 100, "Multa inválida (0 a 100%)."),
  jurosMesPercent: percentualContrato(0, 100, "Juros inválidos (0 a 100%)."),
  // Período de apuração de comissão. Padrão 1 e 31 = mês cheio, então quem
  // não configurar não percebe diferença.
  apuracaoDiaInicio: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      const n = Number(String(v ?? "").replace(/\D/g, ""));
      return Number.isFinite(n) && n >= 1 && n <= 31 ? n : 1;
    }),
  apuracaoDiaFim: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      const n = Number(String(v ?? "").replace(/\D/g, ""));
      return Number.isFinite(n) && n >= 1 && n <= 31 ? n : 31;
    }),

  diasCancelamento: z
    .union([z.string(), z.number()])
    .transform((v) => {
      const n = Number(String(v).replace(/\D/g, ""));
      return Number.isFinite(n) && n > 0 ? n : 60;
    })
    .refine((n) => n >= 1 && n <= 365, "Informe entre 1 e 365 dias."),
  indiceReajuste: z.string().trim().min(2, "Informe o índice.").max(40).default("IPCA"),
  // vazio = sem teto
  tetoReajustePercent: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => {
      const s = String(v ?? "").trim().replace(",", ".");
      if (s === "") return null;
      const n = Number(s);
      return Number.isFinite(n) && n > 0 ? n : null;
    }),
  responsavelNome: z.string().trim().min(2, "Informe o responsável."),
  responsavelEmail: z.string().trim().email("E-mail inválido."),
  telefone: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine((v) => !v || soDigitos(v).length >= 10, "Telefone inválido."),
  feePercent: z
    .string()
    .refine((v) => {
      const n = Number(String(v).replace(",", "."));
      return Number.isFinite(n) && n >= 0 && n <= 100;
    }, "Fee deve ser entre 0 e 100."),
});

export type GrupoInput = z.infer<typeof grupoSchema>;
