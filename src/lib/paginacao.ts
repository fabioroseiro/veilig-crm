import { sql, type SQL } from "drizzle-orm";

export const POR_PAGINA = 25;

export type Paginacao = {
  pagina: number;
  offset: number;
  limite: number;
};

/**
 * Lê o número da página da URL (?p=), com defesa contra lixo (`p=abc`, `p=-3`,
 * `p=99999999`).
 */
export function lerPaginacao(p?: string, porPagina = POR_PAGINA): Paginacao {
  const n = Number(p);
  const pagina = Number.isInteger(n) && n > 0 && n < 100000 ? n : 1;
  return { pagina, offset: (pagina - 1) * porPagina, limite: porPagina };
}

/**
 * Constrói a condição de busca no BANCO (ILIKE em várias colunas).
 *
 * Isto existe porque as listas filtravam em JavaScript DEPOIS de carregar a
 * tabela inteira. Funciona com 20 registros e degrada mal com 20 mil: o banco
 * manda tudo pela rede e o servidor descarta quase tudo. Pior ainda ao paginar
 * — filtrar só a página exibida faria a busca "não achar" o que está na página
 * seguinte.
 *
 * Devolve undefined quando não há termo, para o chamador simplesmente omitir o
 * WHERE.
 */
export function condicaoBusca(termo: string | undefined, colunas: SQL[]): SQL | undefined {
  const t = (termo ?? "").trim();
  if (!t) return undefined;

  // Escapa os curingas do LIKE para que "50%" busque o texto, e não "50" +
  // qualquer coisa.
  const escapado = t.replace(/[\\%_]/g, (c) => "\\" + c);
  const padrao = `%${escapado}%`;

  const partes = colunas.map(
    (col) => sql`coalesce(${col}::text, '') ILIKE ${padrao} ESCAPE '\\'`
  );
  return sql`(${sql.join(partes, sql` OR `)})`;
}

/**
 * Termo reduzido a dígitos — para buscar CPF, telefone ou CEP que o usuário
 * digita com pontuação ("529.982" deve achar o CPF gravado sem pontos).
 * Devolve null quando não há dígitos suficientes para valer a pena.
 */
/**
 * Termo reduzido a letras e dígitos — para buscar CNPJ, que desde 2026 pode
 * ter letras. Usar só dígitos fazia "WH.HCV" virar string vazia e a busca não
 * achar nada.
 */
export function termoAlfanumerico(termo: string | undefined): string | null {
  const t = String(termo ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  return t.length >= 3 ? t : null;
}

export function termoDigitos(termo: string | undefined): string | null {
  const d = (termo ?? "").replace(/\D/g, "");
  return d.length >= 3 ? d : null;
}

export function totalPaginas(total: number, porPagina = POR_PAGINA): number {
  return Math.max(1, Math.ceil(total / porPagina));
}
