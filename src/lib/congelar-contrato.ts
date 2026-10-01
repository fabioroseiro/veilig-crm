import React from "react";
import { DocumentoContrato, type DadosCliente } from "@/components/DocumentoContrato";
import type { DadosContrato } from "@/lib/contrato";

/**
 * Congela o contrato em HTML, no momento da venda.
 *
 * ── Por que um serializador próprio ───────────────────────────────────────
 *
 * O Next bloqueia `react-dom/server` no grafo do App Router. Tentamos import
 * dinâmico para escapar da checagem: o build passou, mas o módulo não foi
 * empacotado e a chamada falhava em silêncio no runtime.
 *
 * Elementos React são objetos simples — `{ type, props }`. Como o
 * DocumentoContrato é apresentação pura (sem estado, sem contexto, sem
 * efeitos), dá para chamá-lo como função e percorrer o resultado. Sem
 * dependência externa e sem regra de bundler no caminho.
 *
 * A alternativa seria reescrever as 644 linhas do contrato como texto, criando
 * DUAS fontes para o mesmo documento — e a divergência entre o que o cliente
 * viu e o que foi arquivado é exatamente o que destrói o valor probatório.
 */

const AUTO_FECHANTES = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/** Atributos JSX que têm nome diferente em HTML. */
const NOMES: Record<string, string> = {
  className: "class",
  htmlFor: "for",
  colSpan: "colspan",
  rowSpan: "rowspan",
  tabIndex: "tabindex",
};

function escapar(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** `{ marginTop: 8 }` → `margin-top:8px`. Números viram px, como no React. */
function estilo(obj: Record<string, any>): string {
  const semUnidade = new Set([
    "opacity", "zIndex", "fontWeight", "lineHeight", "flex", "flexGrow", "order",
  ]);
  return Object.entries(obj)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => {
      const prop = k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
      const val = typeof v === "number" && !semUnidade.has(k) ? `${v}px` : String(v);
      return `${prop}:${val}`;
    })
    .join(";");
}

function serializar(no: any): string {
  if (no == null || no === false || no === true) return "";
  if (typeof no === "string") return escapar(no);
  if (typeof no === "number") return String(no);
  if (Array.isArray(no)) return no.map(serializar).join("");

  // Elemento React
  const tipo = no?.type;
  const props = no?.props ?? {};

  // Fragmento: só os filhos
  if (tipo === React.Fragment || tipo == null) {
    return serializar(props.children);
  }

  // Componente: executa e serializa o que ele devolve. Só funciona com
  // componentes de apresentação — que é o caso aqui.
  if (typeof tipo === "function") {
    return serializar((tipo as any)(props));
  }

  if (typeof tipo !== "string") return "";

  const atributos: string[] = [];
  for (const [chave, valor] of Object.entries(props)) {
    if (chave === "children" || chave === "key" || chave === "ref") continue;
    if (chave === "dangerouslySetInnerHTML") continue;
    if (valor == null || valor === false) continue;

    if (chave === "style" && typeof valor === "object") {
      const css = estilo(valor as Record<string, any>);
      if (css) atributos.push(`style="${escapar(css)}"`);
      continue;
    }
    const nome = NOMES[chave] ?? chave;
    if (valor === true) atributos.push(nome);
    else atributos.push(`${nome}="${escapar(String(valor))}"`);
  }

  const abre = `<${tipo}${atributos.length ? " " + atributos.join(" ") : ""}>`;
  if (AUTO_FECHANTES.has(tipo)) return abre;

  const interno = (props as any).dangerouslySetInnerHTML?.__html;
  const filhos = interno != null ? String(interno) : serializar(props.children);
  return `${abre}${filhos}</${tipo}>`;
}

export function congelarContrato(
  dados: DadosContrato,
  cliente: DadosCliente,
  hoje: string
): string | null {
  try {
    const elemento = DocumentoContrato({ dados, cliente, hoje }) as any;
    const html = serializar(elemento);
    // Um contrato tem milhares de caracteres. Resultado curto significa que a
    // serialização falhou sem lançar erro — melhor não gravar do que gravar
    // um documento truncado.
    if (!html || html.length < 500) {
      console.error("[CONTRATO] HTML gerado curto demais:", html?.length ?? 0);
      return null;
    }
    return html;
  } catch (e: any) {
    // Falhar aqui NÃO derruba a venda: o cliente pagou, e o snapshot do plano
    // continua congelado.
    console.error("[CONTRATO] falha ao congelar:", e?.message);
    return null;
  }
}
