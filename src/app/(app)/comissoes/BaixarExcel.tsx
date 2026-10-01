"use client";

import type { LinhaApuracao } from "./apuracao";

/**
 * Extração em CSV, que o Excel abre direto.
 *
 * CSV e não xlsx: não exige biblioteca, o arquivo é gerado no navegador sem ida
 * ao servidor, e o contador abre do mesmo jeito. Quando houver e-mail
 * automático, aí sim vale gerar no servidor.
 */
export function BaixarExcel({
  linhas,
  inicio,
  fim,
}: {
  linhas: LinhaApuracao[];
  inicio: string;
  fim: string;
}) {
  const baixar = () => {
    const cabecalho = [
      "Vendedor", "Loja", "Mensalidades pagas",
      "Competencia", "Liquido", "Caixa", "A receber",
    ];
    // Ponto e vírgula: o Excel em português usa vírgula como separador
    // decimal, então CSV com vírgula quebra as colunas.
    const linhasCsv = linhas.map((l) =>
      [
        l.vendedor,
        l.loja ?? "",
        l.qtdPagas,
        l.valorCompetencia.toFixed(2).replace(".", ","),
        l.valorLiquidoCompetencia.toFixed(2).replace(".", ","),
        l.valorCaixa.toFixed(2).replace(".", ","),
        Math.max(0, l.valorCompetencia - l.valorCaixa).toFixed(2).replace(".", ","),
      ].join(";")
    );

    const total = linhas.reduce((s, l) => s + l.valorCompetencia, 0);
    const conteudo = [
      `Apuracao de comissoes;${inicio} a ${fim}`,
      "",
      cabecalho.join(";"),
      ...linhasCsv,
      "",
      `TOTAL;;;${total.toFixed(2).replace(".", ",")}`,
    ].join("\n");

    // BOM no início: sem ele o Excel abre acentos como caracteres estranhos.
    const blob = new Blob(["\uFEFF" + conteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comissoes_${inicio}_a_${fim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button type="button" className="btn-ghost" style={{ padding: "8px 16px" }} onClick={baixar} data-tour="com-excel">
      Baixar para Excel
    </button>
  );
}
