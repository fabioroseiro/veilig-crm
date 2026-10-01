import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { ROTULOS_FAIXA } from "@/lib/carencia";
import { formatarCnpjExibicao } from "@/lib/mascaras";

/**
 * Dados que alimentam o contrato de adesão.
 *
 * Este módulo monta a MINUTA — o contrato do plano, sem cliente. É o documento
 * que o vendedor mostra antes de fechar.
 *
 * A minuta lê o plano AO VIVO, e isso é correto: ela representa as condições
 * vigentes hoje, para quem ainda vai contratar. O contrato do cliente é outra
 * história — esse precisa ler um snapshot congelado na venda, senão um
 * contrato de 2026 aberto em 2028 mostraria o plano de 2028.
 */

/**
 * Relação entre a loja e a entidade cadastrada como grupo.
 *
 * A raiz do CNPJ (8 primeiros caracteres) identifica a EMPRESA; os 4 seguintes,
 * o estabelecimento. Matriz e filiais compartilham a raiz — são a MESMA pessoa
 * jurídica em endereços diferentes. Grupo econômico é outra coisa: empresas
 * distintas sob controle comum, com raízes diferentes.
 *
 * A distinção tem efeito no contrato: sendo a mesma pessoa jurídica, as
 * obrigações vinculam a empresa inteira. Chamar isso de "grupo econômico"
 * sugere entidades separadas e enfraquece o documento.
 */
/**
 * Exclusões fixas da Cláusula 4.4 — as que valem para QUALQUER plano.
 *
 * Fonte única: o contrato e a tela de venda leem daqui. Escrever a lista nos
 * dois lugares faria os textos divergirem com o tempo, e a divergência entre o
 * que o vendedor mostrou e o que o contrato diz é exatamente o que aparece
 * numa reclamação.
 *
 * ATENÇÃO ao que NÃO está aqui: se o plano cobre peças nas revisões, isso é
 * decisão do CADASTRO e aparece na descrição de cada revisão. Estas exclusões
 * tratam de peças de ACIDENTE, que são excluídas independentemente do plano.
 */
export const EXCLUSOES_FIXAS = [
  "Peças decorrentes de acidente, colisão, incêndio, furto, roubo ou vandalismo — e a reparação dos danos",
  "Danos por uso indevido, competição, sobrecarga ou modificação não autorizada pelo fabricante",
  "Serviços feitos fora da rede da concessionária sem autorização prévia por escrito",
  "Itens de desgaste natural não listados entre as revisões do plano",
  "Reparos por não ter feito as revisões nos prazos e quilometragens do fabricante",
] as const;

export type RelacaoLojaGrupo = "mesmo_estabelecimento" | "filial" | "grupo_economico";

export function relacaoComGrupo(
  cnpjLoja: string | null | undefined,
  cnpjGrupo: string | null | undefined
): RelacaoLojaGrupo {
  const limpar = (c: string | null | undefined) =>
    String(c ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  const l = limpar(cnpjLoja);
  const g = limpar(cnpjGrupo);

  // Sem dado suficiente, assume a redação mais genérica — verdadeira em
  // qualquer caso, só menos precisa.
  if (l.length !== 14 || g.length !== 14) return "grupo_economico";
  if (l === g) return "mesmo_estabelecimento";
  return l.slice(0, 8) === g.slice(0, 8) ? "filial" : "grupo_economico";
}

/** "0001" = matriz; qualquer outro = filial. */
export function ehMatriz(cnpj: string | null | undefined): boolean {
  const c = String(cnpj ?? "").replace(/[^0-9A-Za-z]/g, "");
  return c.length === 14 && c.slice(8, 12) === "0001";
}

export type DadosContrato = {
  grupo: {
    razaoSocial: string;
    nomeFantasia: string | null;
    cnpj: string;
    multaPercent: number;
    jurosMesPercent: number;
    diasCancelamento: number;
    indiceReajuste: string;
    tetoReajustePercent: number | null;
  };
  loja: {
    razaoSocial: string;
    nomeFantasia: string;
    cnpj: string;
    enderecoCompleto: string;
    /** Como a loja se relaciona com a entidade do grupo (ver relacaoComGrupo). */
    relacao: RelacaoLojaGrupo;
    ehMatriz: boolean;
  } | null;
  plano: {
    nome: string;
    descricao: string;
    exclusoes: string;
    condicoes: string;
    aceitaZeroKm: boolean;
    idadeMaximaAnos: number;
    carencias: { faixa: string; meses: number }[];
    acrescimos: { faixa: string; percent: number }[];
    revisoes: {
      nome: string;
      km: number | null;
      meses: number | null;
      recorrente: boolean;
      incluiPecas: boolean;
      incluiMaoObra: boolean;
    }[];
    beneficios: { nome: string; descricao: string }[];
    tetos: { rotulo: string; valor: string }[];
  };
};


function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Monta os dados do contrato para um plano. `storeId` é opcional na minuta. */
export async function dadosDoContrato(
  tx: any,
  planId: string,
  storeId?: string | null
): Promise<DadosContrato | null> {
  const planos = await tx
    .select()
    .from(schema.plans)
    .where(eq(schema.plans.id, planId))
    .limit(1);
  const p = planos[0];
  if (!p) return null;

  const grupos = await tx
    .select()
    .from(schema.groups)
    .where(eq(schema.groups.id, p.groupId))
    .limit(1);
  const g = grupos[0];
  if (!g) return null;

  let loja: DadosContrato["loja"] = null;
  if (storeId) {
    const lojas = await tx
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.id, storeId))
      .limit(1);
    const l = lojas[0];
    if (l) {
      const partes = [
        l.logradouro,
        l.numero,
        l.complemento || null,
        l.bairro,
        `${l.cidade}/${l.uf}`,
        l.cep ? `CEP ${l.cep}` : null,
      ].filter(Boolean);
      loja = {
        razaoSocial: l.razaoSocial,
        nomeFantasia: l.nomeFantasia,
        cnpj: formatarCnpjExibicao(l.cnpj),
        enderecoCompleto: partes.join(", "),
        relacao: relacaoComGrupo(l.cnpj, g.cnpj),
        ehMatriz: ehMatriz(l.cnpj),
      };
    }
  }

  const revs = await tx
    .select()
    .from(schema.planRevisoes)
    .where(eq(schema.planRevisoes.planId, planId))
    .orderBy(schema.planRevisoes.ordem);

  const bens = await tx
    .select()
    .from(schema.planBeneficios)
    .where(eq(schema.planBeneficios.planId, planId))
    .orderBy(schema.planBeneficios.ordem);

  // Só entram as faixas que o plano realmente aceita — listar carência de
  // seminovo num plano só para zero km confundiria quem lê.
  const carencias: { faixa: string; meses: number }[] = [];
  if (p.aceitaZeroKm) {
    carencias.push({ faixa: ROTULOS_FAIXA.zero_km, meses: p.carenciaZeroKm });
  }
  if (p.idadeMaximaAnos > 0) {
    carencias.push({ faixa: ROTULOS_FAIXA.ate_2_anos, meses: p.carenciaAte2Anos });
    if (p.idadeMaximaAnos >= 3) {
      carencias.push({ faixa: ROTULOS_FAIXA["3_a_5_anos"], meses: p.carencia3a5Anos });
    }
    if (p.idadeMaximaAnos >= 6) {
      carencias.push({ faixa: ROTULOS_FAIXA["6_mais"], meses: p.carencia6Mais });
    }
  }

  const acrescimos: { faixa: string; percent: number }[] = [];
  if (p.idadeMaximaAnos > 0) {
    acrescimos.push({ faixa: ROTULOS_FAIXA.ate_2_anos, percent: Number(p.acrescimoAte2Anos) });
    if (p.idadeMaximaAnos >= 3) {
      acrescimos.push({ faixa: ROTULOS_FAIXA["3_a_5_anos"], percent: Number(p.acrescimo3a5Anos) });
    }
    if (p.idadeMaximaAnos >= 6) {
      acrescimos.push({ faixa: ROTULOS_FAIXA["6_mais"], percent: Number(p.acrescimo6Mais) });
    }
  }

  // Só os tetos preenchidos: NULL significa "sem limite", e imprimir
  // "sem limite" numa lista de limites é ruído.
  const tetos: { rotulo: string; valor: string }[] = [];
  if (p.limiteRevisoesAno != null) {
    tetos.push({ rotulo: "Revisões por 12 meses", valor: String(p.limiteRevisoesAno) });
  }
  if (p.limiteKmAno != null) {
    tetos.push({ rotulo: "Quilometragem por ano", valor: `${Number(p.limiteKmAno).toLocaleString("pt-BR")} km` });
  }
  if (p.limiteValorPecasAno != null) {
    tetos.push({ rotulo: "Peças por ano", valor: `R$ ${fmtBRL(Number(p.limiteValorPecasAno))}` });
  }
  if (p.limiteValorMaoObraAno != null) {
    tetos.push({ rotulo: "Mão de obra por ano", valor: `R$ ${fmtBRL(Number(p.limiteValorMaoObraAno))}` });
  }
  if (p.limiteValorTotalAno != null) {
    tetos.push({ rotulo: "Total coberto por ano", valor: `R$ ${fmtBRL(Number(p.limiteValorTotalAno))}` });
  }

  return {
    grupo: {
      razaoSocial: g.razaoSocial,
      nomeFantasia: g.nomeFantasia,
      cnpj: formatarCnpjExibicao(g.cnpj),
      multaPercent: Number(g.multaPercent),
      jurosMesPercent: Number(g.jurosMesPercent),
      diasCancelamento: g.diasCancelamento,
      indiceReajuste: g.indiceReajuste,
      tetoReajustePercent:
        g.tetoReajustePercent === null ? null : Number(g.tetoReajustePercent),
    },
    loja,
    plano: {
      nome: p.nome,
      descricao: p.descricao ?? "",
      exclusoes: p.exclusoes ?? "",
      condicoes: p.condicoes ?? "",
      aceitaZeroKm: p.aceitaZeroKm,
      idadeMaximaAnos: p.idadeMaximaAnos,
      carencias,
      acrescimos,
      revisoes: revs.map((r: any) => ({
        nome: r.nome,
        km: r.km,
        meses: r.meses,
        recorrente: r.recorrente,
        incluiPecas: r.incluiPecas,
        incluiMaoObra: r.incluiMaoObra,
      })),
      beneficios: bens.map((b: any) => ({ nome: b.nome, descricao: b.descricao })),
      tetos,
    },
  };
}

/**
 * Monta o SNAPSHOT do plano — o conteúdo congelado no momento da venda.
 *
 * Guarda tudo que o contrato precisa descrever: o que cobre, quanto cobre, o
 * que não cobre e sob que condições. A partir daqui, o contrato daquele cliente
 * nunca mais muda, ainda que o grupo edite o plano amanhã.
 *
 * Guarda também os dados do GRUPO e da LOJA na data da venda — razão social,
 * CNPJ, endereço, multa, juros, índice. Eles mudam com menos frequência que o
 * plano, mas mudam: uma loja que se muda de endereço em 2027 não pode fazer o
 * contrato de 2026 apontar para o endereço novo.
 */
export async function montarSnapshotDoPlano(
  tx: any,
  planId: string,
  storeId: string
): Promise<any> {
  const dados = await dadosDoContrato(tx, planId, storeId);
  if (!dados) return null;

  return {
    // Versão do formato do snapshot. Se um dia mudarmos a estrutura, os
    // contratos antigos continuam legíveis porque dizem qual formato usam.
    formato: 1,
    congeladoEm: new Date().toISOString(),
    grupo: dados.grupo,
    loja: dados.loja,
    plano: dados.plano,
  };
}

/** "a cada 5.000 km ou 6 meses, o que ocorrer primeiro" */
export function descreverRevisao(r: DadosContrato["plano"]["revisoes"][0]): string {
  const partes: string[] = [];
  if (r.km) partes.push(`${r.km.toLocaleString("pt-BR")} km`);
  if (r.meses) partes.push(`${r.meses} ${r.meses === 1 ? "mês" : "meses"}`);

  // Sem km e sem prazo, a revisão não diz QUANDO acontece. A tela agora avisa
  // no cadastro, mas planos antigos podem estar assim — e "a cada sem gatilho
  // definido" num contrato é pior que uma frase honesta.
  const semGatilho = partes.length === 0;

  const gatilho =
    partes.length === 2
      ? `${partes[0]} ou ${partes[1]}, o que ocorrer primeiro`
      : partes[0] ?? "";

  // "aos 10.000 km" mas "ao 1 mês": a preposição concorda com o número, e
  // contrato com erro de português desgasta a credibilidade do documento.
  const singular = partes.length === 1 && !r.km && r.meses === 1;
  const quando = semGatilho
    ? r.recorrente
      ? "conforme o plano de manutenção do fabricante, enquanto o contrato estiver vigente"
      : "conforme o plano de manutenção do fabricante"
    : r.recorrente
    ? `a cada ${gatilho}`
    : `${singular ? "ao" : "aos"} ${gatilho}`;

  const cobre: string[] = [];
  if (r.incluiPecas) cobre.push("peças");
  if (r.incluiMaoObra) cobre.push("mão de obra");
  const cobertura = cobre.length ? cobre.join(" e ") : "sem cobertura definida";

  const vigencia = r.recorrente && !semGatilho ? ", enquanto o contrato estiver vigente" : "";
  return `${quando} — cobre ${cobertura}${vigencia}`;
}
