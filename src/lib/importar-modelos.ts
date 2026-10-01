/**
 * Leitura de modelos colados em massa.
 *
 * Aceita texto colado do Excel (colunas viram tabulação) ou digitado à mão.
 * Fabricante e categoria vêm de seletores fora da lista — na prática cada leva
 * é de uma montadora só, e repetir "Kawasaki" em 40 linhas é digitação inútil.
 *
 * Formato por linha: `Modelo` ou `Modelo <tab> Versão`.
 * Também aceita `;` e `,` como separador, porque nem todo mundo cola do Excel.
 */

export type LinhaImportacao = {
  linha: number;
  modelo: string;
  versao: string;
  /** Motivo pelo qual esta linha não será importada. */
  erro?: string;
  /** Já existe no catálogo (ou repetida na própria colagem). */
  duplicado?: boolean;
};

export type ResultadoLeitura = {
  novos: LinhaImportacao[];
  duplicados: LinhaImportacao[];
  invalidos: LinhaImportacao[];
};

/**
 * Normaliza para comparação: sem acento, sem espaço extra, minúsculo.
 *
 * Serve para detectar que "Ninja 500", "NINJA  500" e "ninja 500" são o mesmo
 * modelo. Sem isso, a mesma moto entraria três vezes no catálogo e apareceria
 * repetida na tela de venda.
 */
export function chaveComparacao(fabricante: string, modelo: string, versao: string): string {
  const limpar = (v: string) =>
    String(v ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  return `${limpar(fabricante)}|${limpar(modelo)}|${limpar(versao)}`;
}

/** Colapsa espaços internos e apara as pontas, preservando maiúsculas. */
function arrumar(v: string): string {
  return String(v ?? "").trim().replace(/\s+/g, " ");
}

export function lerModelosColados(
  texto: string,
  fabricante: string,
  existentes: { fabricante: string; modelo: string; versao: string }[]
): ResultadoLeitura {
  const jaNoCatalogo = new Set(
    existentes.map((e) => chaveComparacao(e.fabricante, e.modelo, e.versao))
  );
  // Detecta repetição dentro da própria colagem: colar duas vezes por engano é
  // comum, e o banco recusaria só a segunda com um erro pouco claro.
  const vistasAgora = new Set<string>();

  const novos: LinhaImportacao[] = [];
  const duplicados: LinhaImportacao[] = [];
  const invalidos: LinhaImportacao[] = [];

  const linhas = String(texto ?? "").split(/\r?\n/);

  linhas.forEach((bruta, i) => {
    const numero = i + 1;
    if (!bruta.trim()) return; // linha em branco é ignorada em silêncio

    // Tab primeiro (é o que vem do Excel); ponto e vírgula e vírgula depois.
    const partes = bruta.includes("\t")
      ? bruta.split("\t")
      : bruta.includes(";")
      ? bruta.split(";")
      : bruta.split(",");

    const modelo = arrumar(partes[0] ?? "");
    const versao = arrumar(partes[1] ?? "");

    if (!modelo) {
      invalidos.push({ linha: numero, modelo: "", versao, erro: "Sem nome de modelo." });
      return;
    }
    if (modelo.length > 80 || versao.length > 80) {
      invalidos.push({ linha: numero, modelo, versao, erro: "Texto longo demais." });
      return;
    }
    if (partes.length > 2 && arrumar(partes.slice(2).join(" "))) {
      // Mais de duas colunas quase sempre significa que a planilha tinha
      // fabricante ou categoria junto — melhor avisar que importar torto.
      invalidos.push({
        linha: numero,
        modelo,
        versao,
        erro: "Mais de duas colunas. Esperado: modelo e versão.",
      });
      return;
    }

    const chave = chaveComparacao(fabricante, modelo, versao);
    if (jaNoCatalogo.has(chave)) {
      duplicados.push({ linha: numero, modelo, versao, duplicado: true, erro: "Já está no catálogo." });
      return;
    }
    if (vistasAgora.has(chave)) {
      duplicados.push({ linha: numero, modelo, versao, duplicado: true, erro: "Repetida nesta lista." });
      return;
    }

    vistasAgora.add(chave);
    novos.push({ linha: numero, modelo, versao });
  });

  return { novos, duplicados, invalidos };
}
