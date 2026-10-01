import { eq } from "drizzle-orm";
import { schema } from "@/db";

/**
 * Lê o campo oculto `revisoes` (JSON) do formulário.
 *
 * Vem como JSON porque são linhas variáveis: um campo por linha viraria uma
 * sopa de nomes indexados no FormData. Nunca confia no conteúdo — tudo passa
 * pelo schema de validação depois.
 */
export function lerRevisoesDoForm(bruto: string): any[] {
  try {
    const arr = JSON.parse(bruto || "[]");
    if (!Array.isArray(arr)) return [];
    return arr
      .slice(0, 40)
      .map((r: any) => ({
      nome: String(r?.nome ?? "").slice(0, 120),
      km: String(r?.km ?? ""),
      meses: String(r?.meses ?? ""),
        recorrente: r?.recorrente === true,
        incluiPecas: r?.incluiPecas !== false,
      incluiMaoObra: r?.incluiMaoObra !== false,
      custoPecas: parseValor(r?.custoPecas),
        custoMaoObra: parseValor(r?.custoMaoObra),
      }))
      // Descarta linhas totalmente em branco. O formulário abre com uma linha
      // vazia por conveniência, e um plano sem cronograma cadastrado não pode
      // ficar impedido de salvar por causa dela.
      //
      // NOME e RECORRENTE contam como conteúdo. Sem eles no teste, uma linha
      // "todas as revisões enquanto o cliente pagar" — que tem nome e a marca
      // de recorrente, mas pode não ter km, prazo nem custo — era descartada em
      // silêncio, e o contrato saía descrevendo só a primeira revisão.
      .filter(
        (r) =>
          r.nome.trim() !== "" ||
          r.recorrente ||
          r.km !== "" ||
          r.meses !== "" ||
          r.custoPecas > 0 ||
          r.custoMaoObra > 0
      );
  } catch {
    return [];
  }
}

/**
 * Lê o campo oculto `beneficios` (JSON). Mesma razão do de revisões: são linhas
 * variáveis, e um campo por linha viraria sopa de nomes indexados no FormData.
 */
export function lerBeneficiosDoForm(bruto: string): any[] {
  try {
    const arr = JSON.parse(bruto || "[]");
    if (!Array.isArray(arr)) return [];
    return arr
      .slice(0, 20)
      .map((b: any) => {
        const horas = parseOpcional(b?.horasAno);
        const hora = parseOpcional(b?.custoHora);
        // Quando o caminho de horas está preenchido, o custo anual VEM dele —
        // guardar os dois independentes deixaria os números divergirem.
        const custo =
          horas !== null && hora !== null
            ? Math.round(horas * hora * 100) / 100
            : parseOpcional(b?.custoAnoEstimado);
        return {
          nome: String(b?.nome ?? "").slice(0, 160),
          descricao: String(b?.descricao ?? "").slice(0, 600),
          horasAno: horas,
          custoHora: hora,
          custoAnoEstimado: custo,
        };
      })
      .filter((b) => b.nome.trim() !== "");
  } catch {
    return [];
  }
}

/** Valor opcional: vazio vira null (≠ zero — "não estimado" não é "de graça"). */
function parseOpcional(v: any): number | null {
  const s = String(v ?? "").trim().replace(/\./g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** "1.234,56" → 1234.56; vazio ou lixo → 0 */
function parseValor(v: any): number {
  const s = String(v ?? "").trim().replace(/\./g, "").replace(",", ".");
  if (s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Lê os modelos selecionados com o preço mínimo de cada um.
 *
 * Viaja como JSON pela mesma razão das revisões: são linhas variáveis, e um
 * campo por modelo viraria uma sopa de nomes indexados no FormData.
 */
export function lerModelosDoForm(
  bruto: string
): { id: string; precoMinimo: number; fatorCusto: number }[] {
  try {
    const arr = JSON.parse(bruto || "[]");
    if (!Array.isArray(arr)) return [];
    return arr
      .slice(0, 2000)
      .map((m: any) => {
        const f = parseValor(m?.fatorCusto);
        return {
          id: String(m?.id ?? ""),
          precoMinimo: parseValor(m?.precoMinimo),
          // Fator ausente ou zerado significa "igual ao de referência".
          fatorCusto: f > 0 ? f : 1,
        };
      })
      .filter((m) => m.id !== "");
  } catch {
    return [];
  }
}

/**
 * Regrava o cronograma inteiro do plano.
 *
 * Apaga e reinsere em vez de tentar casar linha a linha: as revisões não têm
 * identidade própria do ponto de vista do usuário (ele adiciona, remove e
 * reordena livremente), e nada aponta para elas. Casar por id aqui seria
 * complexidade sem benefício.
 */
/** Lê os argumentos de venda do campo oculto (JSON), como revisões e benefícios. */
export function lerArgumentosDoForm(bruto: string): { titulo: string; texto: string }[] {
  try {
    const arr = JSON.parse(bruto || "[]");
    if (!Array.isArray(arr)) return [];
    return arr
      .slice(0, 12)
      .map((a: any) => ({
        titulo: String(a?.titulo ?? "").slice(0, 120),
        texto: String(a?.texto ?? "").slice(0, 1200),
      }))
      .filter((a) => a.titulo.trim() !== "");
  } catch {
    return [];
  }
}

/** Regrava os argumentos. Mesma lógica do cronograma: apaga e reinsere. */
export async function regravarArgumentos(
  tx: any,
  groupId: string,
  planId: string,
  argumentos: { titulo: string; texto: string }[]
) {
  await tx.delete(schema.planArgumentos).where(eq(schema.planArgumentos.planId, planId));
  if (argumentos.length === 0) return;
  await tx.insert(schema.planArgumentos).values(
    argumentos.map((a, i) => ({
      groupId,
      planId,
      ordem: i + 1,
      titulo: a.titulo,
      texto: a.texto,
    }))
  );
}

/** Regrava os benefícios do plano. Mesma lógica do cronograma: apaga e reinsere. */
export async function regravarBeneficios(
  tx: any,
  groupId: string,
  planId: string,
  beneficios: {
    nome: string;
    descricao: string;
    horasAno: number | null;
    custoHora: number | null;
    custoAnoEstimado: number | null;
  }[]
) {
  await tx.delete(schema.planBeneficios).where(eq(schema.planBeneficios.planId, planId));
  if (beneficios.length === 0) return;

  await tx.insert(schema.planBeneficios).values(
    beneficios.map((b, i) => ({
      groupId,
      planId,
      ordem: i + 1,
      nome: b.nome,
      descricao: b.descricao,
      horasAno: b.horasAno === null ? null : b.horasAno.toFixed(2),
      custoHora: b.custoHora === null ? null : b.custoHora.toFixed(2),
      custoAnoEstimado:
        b.custoAnoEstimado === null ? null : b.custoAnoEstimado.toFixed(2),
    }))
  );
}

export async function regravarRevisoes(
  tx: any,
  groupId: string,
  planId: string,
  revisoes: {
    nome: string;
    km: number | null;
    meses: number | null;
    recorrente: boolean;
    incluiPecas: boolean;
    incluiMaoObra: boolean;
    custoPecas: number;
    custoMaoObra: number;
  }[]
) {
  await tx.delete(schema.planRevisoes).where(eq(schema.planRevisoes.planId, planId));
  if (revisoes.length === 0) return;

  await tx.insert(schema.planRevisoes).values(
    revisoes.map((r, i) => ({
      groupId,
      planId,
      ordem: i + 1,
      nome: r.nome || `${i + 1}ª revisão`,
      km: r.km,
      meses: r.meses,
      recorrente: r.recorrente,
      incluiPecas: r.incluiPecas,
      incluiMaoObra: r.incluiMaoObra,
      custoPecas: r.custoPecas.toFixed(2),
      custoMaoObra: r.custoMaoObra.toFixed(2),
    }))
  );
}

/** Converte os limites (null = sem limite) para o formato do banco. */
export function limitesParaBanco(d: {
  limiteRevisoesAno: number | null;
  limiteValorPecasAno: number | null;
  limiteValorMaoObraAno: number | null;
  limiteValorTotalAno: number | null;
  limiteKmAno: number | null;
}) {
  return {
    limiteRevisoesAno: d.limiteRevisoesAno,
    limiteValorPecasAno: d.limiteValorPecasAno?.toFixed(2) ?? null,
    limiteValorMaoObraAno: d.limiteValorMaoObraAno?.toFixed(2) ?? null,
    limiteValorTotalAno: d.limiteValorTotalAno?.toFixed(2) ?? null,
    limiteKmAno: d.limiteKmAno,
  };
}
