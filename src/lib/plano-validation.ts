import { z } from "zod";

/**
 * Piso da Asaas para qualquer cobrança. Não é regra nossa — é da instituição
 * de pagamento, e ela recusa com erro 400 na hora da venda.
 */
export const VALOR_MINIMO_COBRANCA = 5;

// Converte preço em formato brasileiro ("1.234,56" ou "89,90" ou "89.90") para número.
export function parsePreco(valor: string): number | null {
  if (!valor) return null;
  let s = String(valor).trim().replace(/\s|R\$/g, "");
  // Se tem vírgula, tratamos vírgula como decimal e ponto como milhar.
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Campo numérico inteiro vindo do formulário (chega sempre como string).
 * Vazio conta como 0 — é o caso comum de "não tem carência nessa faixa".
 */
function mesesOuAnos(min: number, max: number, msg: string) {
  return z
    .union([z.string(), z.number()])
    .transform((v) => {
      const s = String(v).trim();
      if (s === "") return 0;
      const n = Number(s.replace(/\D/g, ""));
      return Number.isFinite(n) ? n : NaN;
    })
    .refine((n) => Number.isInteger(n) && n >= min && n <= max, msg);
}

/** Percentual de acréscimo: aceita "15", "15,5" ou vazio (= 0). */
function percentual() {
  return z
    .union([z.string(), z.number()])
    .transform((v) => {
      const s = String(v).trim().replace("%", "");
      if (s === "") return 0;
      const n = Number(s.replace(",", "."));
      return Number.isFinite(n) ? n : NaN;
    })
    .refine((n) => Number.isFinite(n) && n >= 0 && n <= 300, "Acréscimo inválido (0 a 300%).");
}

/** Inteiro opcional: "" vira null (= sem limite). */
function opcionalInteiro() {
  return z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const s = String(v).replace(/\D/g, "");
      if (s === "") return null;
      const n = Number(s);
      return Number.isFinite(n) && n > 0 ? n : null;
    });
}

/** Valor em reais opcional: aceita "1.234,56"; "" vira null. */
function opcionalValor() {
  return z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      if (s === "") return null;
      const n = parsePreco(s);
      return n !== null && n > 0 ? n : null;
    });
}

export const planoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do plano."),
  descricao: z.string().trim().optional().default(""),
  // Modelos selecionados, cada um com o SEU preço mínimo. O piso deixou de ser
  // único por plano: modelos diferentes custam diferente para manter.
  modelos: z
    .array(
      z.object({
        id: z.string().uuid(),
        // A Asaas recusa cobrança abaixo de R$ 5,00. Sem este piso, o plano
        // salva, a loja precifica, e o erro só aparece na venda — com o
        // cliente na frente e a culpa parecendo do sistema.
        precoMinimo: z.number().min(0),
        fatorCusto: z.number().min(0.01).max(10).default(1),
      })
    )
    .min(1, "Selecione ao menos um modelo.")
    .refine(
      (ms) => ms.every((m) => m.precoMinimo > 0),
      "Todo modelo selecionado precisa de um preço mínimo."
    )
    .refine(
      (ms) => ms.every((m) => m.precoMinimo === 0 || m.precoMinimo >= VALOR_MINIMO_COBRANCA),
      `A Asaas não cobra valores abaixo de R$ ${VALOR_MINIMO_COBRANCA.toFixed(2).replace(".", ",")}. Ajuste os preços mínimos.`
    ),

  // ── Política de aceitação e carência ──────────────────────────────────────
  aceitaZeroKm: z.boolean().default(true),
  // 0 = só zero km; 99 = sem limite
  idadeMaximaAnos: mesesOuAnos(0, 99, "Informe a idade máxima (0 a 99 anos)."),
  carenciaZeroKm: mesesOuAnos(0, 60, "Carência inválida (0 a 60 meses)."),
  carenciaAte2Anos: mesesOuAnos(0, 60, "Carência inválida (0 a 60 meses)."),
  carencia3a5Anos: mesesOuAnos(0, 60, "Carência inválida (0 a 60 meses)."),
  carencia6Mais: mesesOuAnos(0, 60, "Carência inválida (0 a 60 meses)."),

  // Acréscimo percentual por faixa de idade (o preço-base é o do veículo novo)
  acrescimoAte2Anos: percentual(),
  acrescimo3a5Anos: percentual(),
  acrescimo6Mais: percentual(),

  // ── Tetos de utilização (todos opcionais) ────────────────────────────────
  // "" = sem limite naquela dimensão.
  limiteRevisoesAno: opcionalInteiro(),
  limiteValorPecasAno: opcionalValor(),
  limiteValorMaoObraAno: opcionalValor(),
  limiteValorTotalAno: opcionalValor(),
  limiteKmAno: opcionalInteiro(),
  exclusoes: z.string().trim().max(4000, "Texto muito longo.").default(""),
  condicoes: z.string().trim().max(4000, "Texto muito longo.").default(""),
  precoPeloGrupo: z.boolean().default(false),

  // Argumentos de venda: título obrigatório, texto opcional.
  argumentos: z
    .array(
      z.object({
        titulo: z.string().trim().max(120).default(""),
        texto: z.string().trim().max(1200).default(""),
      })
    )
    .default([])
    .refine(
      (as) => as.every((a) => a.titulo.length > 0),
      "Todo argumento precisa de um título."
    ),

  // ── Benefícios que não são revisão ───────────────────────────────────────
  beneficios: z
    .array(
      z.object({
        nome: z.string().trim().max(160).default(""),
        descricao: z.string().trim().max(600).default(""),
        horasAno: z.number().min(0).nullable().default(null),
        custoHora: z.number().min(0).nullable().default(null),
        custoAnoEstimado: z.number().min(0).nullable().default(null),
      })
    )
    .default([])
    .refine(
      (bs) => bs.every((b) => b.nome.length > 0),
      "Todo benefício precisa de um nome."
    ),

  // ── Cronograma de revisões ───────────────────────────────────────────────
  revisoes: z
    .array(
      z.object({
        nome: z.string().trim().max(120).default(""),
        km: opcionalInteiro(),
        meses: opcionalInteiro(),
        recorrente: z.boolean().default(false),
        incluiPecas: z.boolean().default(true),
        incluiMaoObra: z.boolean().default(true),
        custoPecas: z.number().min(0).default(0),
        custoMaoObra: z.number().min(0).default(0),
      })
    )
    .default([])
    .refine(
      // uma revisão sem km e sem meses nunca acontece
      (rs) => rs.every((r) => r.km !== null || r.meses !== null),
      "Cada revisão precisa de um km ou de um prazo em meses (ou os dois)."
    ),
}).refine(
  // Um plano que não aceita zero km E não aceita seminovo não vende nada.
  (d) => d.aceitaZeroKm || d.idadeMaximaAnos > 0,
  {
    message:
      "O plano precisa aceitar zero km ou seminovo — do jeito atual ele não poderia ser vendido para nenhum veículo.",
    path: ["aceitaZeroKm"],
  }
);

export type PlanoInput = z.infer<typeof planoSchema>;
