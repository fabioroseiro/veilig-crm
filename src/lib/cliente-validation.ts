import { z } from "zod";
import { soDigitos } from "./loja-validation";
import { cpfValido } from "./mascaras";

export const clienteVeiculoSchema = z.object({
  // cliente
  nome: z.string().trim().min(2, "Informe o nome do cliente."),
  cpf: z
    .string()
    .trim()
    .refine((v) => soDigitos(v).length === 11, "CPF deve ter 11 dígitos.")
    // A Asaas valida o CPF de verdade e recusa a cobrança. Validando aqui, o
    // vendedor corrige no formulário em vez de descobrir depois da venda.
    .refine((v) => cpfValido(v), "CPF inválido — confira os números."),
  email: z.string().trim().email("E-mail inválido."),
  telefone: z
    .string()
    .trim()
    .refine((v) => {
      const n = soDigitos(v).length;
      return n === 10 || n === 11;
    }, "Telefone inválido."),
  // veículo
  vehicleModelId: z.string().uuid("Selecione o modelo do veículo."),
  // Placa OPCIONAL, validada quando preenchida. A obrigatoriedade agora é
  // "placa OU chassi", verificada no final do schema — zero km sai da fábrica
  // sem emplacar, e exigir placa impedia justamente o cliente mais fácil de
  // converter.
  placa: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine((v) => {
      if (!v.trim()) return true;
      const p = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
      // antiga ABC1234 ou Mercosul ABC1D23
      return /^[A-Z]{3}[0-9]{4}$/.test(p) || /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(p);
    }, "Placa inválida (use ABC1D23 ou ABC1234)."),

  // 17 caracteres, sem I/O/Q — essas três são excluídas do padrão para não
  // serem confundidas com 1 e 0, que é o erro de transcrição comum.
  // Conferimos só o FORMATO: o dígito verificador do VIN é obrigatório nos EUA
  // e opcional no Brasil, então validá-lo recusaria chassis nacionais legítimos.
  chassi: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine(
      (v) => !v.trim() || /^[0-9A-HJ-NPR-Z]{17}$/.test(v.toUpperCase().replace(/[^0-9A-HJ-NPR-Z]/g, "")),
      "Chassi inválido (17 caracteres, sem I, O ou Q)."
    ),
  // ano do veículo do cliente — digitado pelo vendedor, olhando o documento.
  // NÃO vem mais do catálogo: o modelo é fabricante+modelo+versão, sem ano.
  ano: z.coerce
    .number()
    .int("Informe o ano do veículo.")
    .min(1950, "Ano muito antigo.")
    .max(new Date().getFullYear() + 1, "Ano inválido."),
  // ── Endereço do cliente ──────────────────────────────────────────────────
  // Necessário para o contrato de adesão (identificação da parte contratante)
  // e enviado à Asaas — o que reduz o que o cliente digita no checkout,
  // principalmente no boleto, que exige endereço.
  //
  // Opcional na validação para não travar a venda por um CEP faltando, mas a
  // tela pede. Contrato sem endereço sai identificando por nome e CPF.
  cep: z.string().trim().optional().default(""),
  logradouro: z.string().trim().max(200).optional().default(""),
  numero: z.string().trim().max(20).optional().default(""),
  complemento: z.string().trim().max(100).optional().default(""),
  bairro: z.string().trim().max(100).optional().default(""),
  cidade: z.string().trim().max(100).optional().default(""),
  uf: z.string().trim().max(2).optional().default(""),

  // Uso do veículo — SÓ REGISTRO, não afeta preço nem elegibilidade.
  // É a matéria-prima da futura calculadora de preço: sem esse dado, a taxa de
  // utilização continua sendo estimativa. Opcionais para não travar a venda.
  kmAtual: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      const s = String(v ?? "").replace(/\D/g, "");
      if (s === "") return null;
      const n = Number(s);
      return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? n : null;
    }),
  kmMesEstimado: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      const s = String(v ?? "").replace(/\D/g, "");
      if (s === "") return null;
      const n = Number(s);
      return Number.isFinite(n) && n >= 0 && n < 100_000 ? n : null;
    }),
  perfilUso: z
    .enum(["particular", "aplicativo", "entregas", "locacao", "frota"])
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || v === undefined ? null : v)),
  // veículo zero km: informado pelo vendedor, que está com o veículo à frente.
  // Chega como "on" (checkbox marcado) ou ausente.
  zeroKm: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "on" || v === "true"),
  // loja (só usada quando quem cadastra não é vendedor)
  storeId: z.string().uuid().optional().or(z.literal("")),
}).refine(
  // A regra que substitui a obrigatoriedade da placa. Fica no schema inteiro,
  // não num campo: depende dos dois.
  (d) => Boolean(d.placa?.trim()) || Boolean(d.chassi?.trim()),
  {
    message: "Informe a placa ou o chassi do veículo.",
    path: ["placa"],
  }
);

export type ClienteVeiculoInput = z.infer<typeof clienteVeiculoSchema>;

// Normaliza placa: maiúsculas, sem espaços/hífen.
export function normalizaPlaca(placa: string): string {
  return placa.toUpperCase().replace(/[\s-]/g, "");
}
