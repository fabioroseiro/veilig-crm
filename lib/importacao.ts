/**
 * Transforma as linhas de uma planilha em grupos prontos para entrar no CRM.
 * Roda no navegador (prévia) e no servidor (conferência), sem acesso ao banco.
 */
import { analisarEmail, dominio, normalizarCelular, separarTelefones } from "./contatos";

export type Celula = string | number | boolean | Date | null | undefined;
export type Linha = Celula[];

export type ContatoImp = {
  nome: string | null; cargo: string | null; email: string | null;
  email_status: "ok" | "corrigir" | "ausente"; email_sugestao: string | null;
  whatsapp: string | null; telefone: string | null; principal: boolean;
};
export type LojaImp = { razao_social: string | null; nome_fantasia: string | null; cidade: string | null; uf: string | null; regiao: string | null; cep: string | null };
export type GrupoImp = {
  chave: string; nome: string; tipo: string; origem: string | null; origem_interna: string | null;
  segmento: string | null; marcas: string | null; num_lojas: number; entregas_mes: number | null;
  etapa: number; situacao: "ativo" | "pausado" | "perdido"; pausado_ate: string | null; perdido_motivo: string | null;
  temperatura: "quente" | "morno" | "frio" | "oscilante"; pacote: "essencial" | "performance" | "completo";
  ultimo_sinal: string | null; observacoes: string | null;
  contatos: ContatoImp[]; lojas: LojaImp[];
  tarefas: { titulo: string; vence_em: string }[];
  atividades: { tipo: string; resumo: string; em: string }[];
  avisos: string[]; excluido: string | null; incluir: boolean;
};

export type Modelo = "base" | "pipeline";
export type OpcoesBase = {
  segmento: string; marca: string; origem: string; origem_interna: string;
  temperatura: GrupoImp["temperatura"]; dominios_excluidos: string[];
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const norm = (c: Celula) => semAcento(String(c ?? "")).trim().toUpperCase().replace(/\s+/g, " ");
const txt = (c: Celula) => {
  if (c == null) return null;
  const s = String(c).trim();
  return s && s !== "-" ? s : null;
};

const PEQUENAS = new Set(["de", "da", "do", "das", "dos", "e"]);
const SIGLA = /^(?:[ivxl]{2,}|[a-z]{2})$/i; // XIII, II, AP, BH, SP...
export function titulo(s: string | null) {
  if (!s) return s;
  return s.trim().toLowerCase().split(/\s+/).map((p, i) => {
    if (i > 0 && PEQUENAS.has(p)) return p;
    if (SIGLA.test(p) && !/[aeou]/.test(p.replace(/^(?:[ivxl]+)$/, ""))) return p.toUpperCase();
    return p.replace(/(^|[(\-/])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());
  }).join(" ");
}

/** Data de célula (Date do Excel ou "dd/mm/aaaa") para "aaaa-mm-dd". */
export function dataISO(c: Celula): string | null {
  if (c instanceof Date && !isNaN(c.getTime())) return c.toISOString().slice(0, 10);
  const s = txt(c);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

/** Acha a linha de cabeçalho e o modelo da planilha. */
export function detectar(linhas: Linha[]): { modelo: Modelo; cab: number } | null {
  for (let i = 0; i < Math.min(linhas.length, 15); i++) {
    const cols = linhas[i].map(norm);
    if (cols.includes("GRUPO / CONCESSIONARIA")) return { modelo: "pipeline", cab: i };
    if (cols.includes("NOME") && cols.includes("RESPONSAVEL") && cols.includes("EMAIL")) return { modelo: "base", cab: i };
  }
  return null;
}

function indices(cab: Linha) {
  const mapa = new Map<string, number>();
  cab.forEach((c, i) => { const k = norm(c); if (k && !mapa.has(k)) mapa.set(k, i); });
  return (nome: string) => mapa.get(norm(nome)) ?? -1;
}

// ---------- Modelo "base": uma linha por loja (ex.: base de concessionárias) ----------

class Uniao {
  pai: number[];
  constructor(n: number) { this.pai = Array.from({ length: n }, (_, i) => i); }
  achar(i: number): number { while (this.pai[i] !== i) { this.pai[i] = this.pai[this.pai[i]]; i = this.pai[i]; } return i; }
  unir(a: number, b: number) { const x = this.achar(a), y = this.achar(b); if (x !== y) this.pai[y] = x; }
}

const GENERICOS = new Set(["", "NAO POSSUI", "SHINERAY", "SHINERAY MOTOS", "SHINERAY MOTOS LTDA"]);

export function importarBase(linhas: Linha[], cab: number, op: OpcoesBase): GrupoImp[] {
  const col = indices(linhas[cab]);
  const c = {
    nome: col("NOME"), fantasia: col("NOME FANTASIA"), cidade: col("CIDADE"), uf: col("UF"), regiao: col("REGIAO"),
    cep: col("CEP"), resp: col("RESPONSAVEL"), ddd: col("DDD"), tel: col("TELEFONE"), email: col("EMAIL"),
  };
  const get = (l: Linha, i: number) => (i >= 0 ? l[i] : null);

  type Reg = { loja: LojaImp; resp: string | null; email: ReturnType<typeof analisarEmail>; zap: string | null; telefone: string | null; excluido: string | null };
  const regs: Reg[] = [];
  for (const l of linhas.slice(cab + 1)) {
    const razao = txt(get(l, c.nome));
    const email = analisarEmail(txt(get(l, c.email)));
    const telBruto = txt(get(l, c.tel));
    if (!razao && !email.email && !telBruto) continue;
    const ddd = txt(get(l, c.ddd));
    const zap = separarTelefones(telBruto || "").map((t) => normalizarCelular(t, ddd)).find(Boolean) ?? null;
    const dom = dominio(email.email);
    regs.push({
      loja: {
        razao_social: razao, nome_fantasia: txt(get(l, c.fantasia)), cidade: titulo(txt(get(l, c.cidade))),
        uf: txt(get(l, c.uf)), regiao: txt(get(l, c.regiao)), cep: txt(get(l, c.cep)),
      },
      resp: txt(get(l, c.resp)),
      email, zap,
      telefone: telBruto ? `${ddd ? `(${ddd}) ` : ""}${telBruto}` : null,
      excluido: dom && op.dominios_excluidos.includes(dom) ? `Domínio excluído (${dom})` : null,
    });
  }

  // Lojas com o mesmo WhatsApp, e-mail ou responsável (nome completo) são do mesmo grupo.
  const u = new Uniao(regs.length);
  const dono = new Map<string, number>();
  regs.forEach((r, i) => {
    const chaves: string[] = [];
    if (r.zap) chaves.push("w:" + r.zap);
    if (r.email.email) chaves.push("e:" + r.email.email);
    const nomeResp = norm(r.resp).replace(/\(.*?\)/g, "").trim();
    if (nomeResp.split(" ").length >= 2) chaves.push("r:" + nomeResp);
    for (const k of chaves) { const j = dono.get(k); if (j === undefined) dono.set(k, i); else u.unir(i, j); }
  });
  const conjuntos = new Map<number, Reg[]>();
  regs.forEach((r, i) => { const raiz = u.achar(i); (conjuntos.get(raiz) || conjuntos.set(raiz, []).get(raiz)!).push(r); });

  const grupos: GrupoImp[] = [];
  let n = 0;
  for (const rs of conjuntos.values()) {
    // Nome: um nome fantasia com "GRUPO"; senão o mais frequente; senão a razão social.
    const cont = new Map<string, number>();
    const original = new Map<string, string>();
    for (const r of rs) {
      const f = norm(r.loja.nome_fantasia);
      if (GENERICOS.has(f)) continue;
      cont.set(f, (cont.get(f) || 0) + 1);
      if (!original.has(f)) original.set(f, r.loja.nome_fantasia!.trim());
    }
    const nomes = [...cont.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const escolhido = nomes.find((k) => k.includes("GRUPO")) || nomes[0];
    let nome = titulo(escolhido ? original.get(escolhido)! : rs[0].loja.razao_social || "Sem nome")!;
    if (!escolhido && rs[0].loja.cidade) nome = `${nome} (${rs[0].loja.cidade})`;

    // Contatos: um por responsável; e-mails diferentes do mesmo responsável viram contatos extras.
    const contatos: ContatoImp[] = [];
    const vistosEmail = new Set<string>();
    const freq = new Map<string, number>();
    for (const r of rs) {
      const chave = norm(r.resp) || r.zap || r.email.email || "";
      freq.set(chave, (freq.get(chave) || 0) + 1);
      const jaTem = contatos.find((ct) => norm(ct.nome) === norm(r.resp) && (!r.email.email || ct.email === r.email.email || vistosEmail.has(r.email.email)));
      if (r.email.email && vistosEmail.has(r.email.email) && jaTem) continue;
      if (jaTem && !r.email.email) { jaTem.whatsapp ||= r.zap; continue; }
      if (r.email.email) vistosEmail.add(r.email.email);
      const mesmoNome = contatos.some((ct) => norm(ct.nome) === norm(r.resp));
      contatos.push({
        nome: titulo(r.resp) ? (mesmoNome ? `${titulo(r.resp)} (${titulo(r.loja.nome_fantasia) || r.loja.cidade})` : titulo(r.resp)) : null,
        cargo: null, email: r.email.email, email_status: r.email.status, email_sugestao: r.email.sugestao ?? null,
        whatsapp: r.zap, telefone: r.telefone, principal: false,
      });
    }
    // Um e-mail com erro de digitação cuja correção já existe no grupo é descartado.
    for (let i = contatos.length - 1; i >= 0; i--) {
      const ct = contatos[i];
      if (ct.email_status === "corrigir" && ct.email_sugestao && contatos.some((o) => o.email === ct.email_sugestao)) contatos.splice(i, 1);
    }
    contatos.forEach((ct) => { if (ct.nome) ct.nome = ct.nome.replace(/ \(.*\)$/, (m) => (contatos.filter((o) => o.nome?.startsWith(ct.nome!.replace(m, ""))).length > 1 ? m : "")); });
    const maisFrequente = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const principal = contatos.find((ct) => norm(ct.nome) === maisFrequente && ct.email_status === "ok") ||
      contatos.find((ct) => ct.email_status === "ok") || contatos[0];
    if (principal) principal.principal = true;

    const avisos: string[] = [];
    const corrigir = contatos.filter((ct) => ct.email_status === "corrigir").length;
    if (corrigir) avisos.push(`${corrigir} e-mail(s) para corrigir`);
    if (!contatos.some((ct) => ct.whatsapp)) avisos.push("Sem celular válido para WhatsApp");
    if (!contatos.some((ct) => ct.email_status === "ok")) avisos.push("Sem e-mail válido: só WhatsApp e ligação");
    const excluido = rs.find((r) => r.excluido)?.excluido ?? null;

    grupos.push({
      chave: `b${n++}`, nome, tipo: "Concessionária", origem: op.origem || null,
      origem_interna: op.origem_interna || null, segmento: op.segmento || null, marcas: op.marca || null,
      num_lojas: rs.length, entregas_mes: null, etapa: 1, situacao: "ativo", pausado_ate: null, perdido_motivo: null,
      temperatura: op.temperatura, pacote: "essencial", ultimo_sinal: null, observacoes: null,
      contatos, lojas: rs.map((r) => r.loja), tarefas: [], atividades: [], avisos,
      excluido, incluir: !excluido,
    });
  }
  return grupos.sort((a, b) => b.num_lojas - a.num_lojas || a.nome.localeCompare(b.nome));
}

// ---------- Modelo "pipeline": uma linha por grupo, com etapa e próxima ação ----------

const TEMP: Record<string, GrupoImp["temperatura"]> = { QUENTE: "quente", MORNO: "morno", FRIO: "frio", OSCILANTE: "oscilante" };
const PAC: Record<string, GrupoImp["pacote"]> = { ESSENCIAL: "essencial", PERFORMANCE: "performance", COMPLETO: "completo" };

export function importarPipeline(linhas: Linha[], cab: number, hoje: string): GrupoImp[] {
  const col = indices(linhas[cab]);
  const g = (l: Linha, nome: string) => { const i = col(nome); return i >= 0 ? l[i] : null; };
  const grupos: GrupoImp[] = [];
  let n = 0;
  for (const l of linhas.slice(cab + 1)) {
    const nome = txt(g(l, "Grupo / Concessionária"));
    if (!nome) continue;
    const nomes = String(txt(g(l, "Contato")) || "").split("/").map((s) => s.trim()).filter(Boolean);
    const zaps = separarTelefones(String(txt(g(l, "WhatsApp")) || ""));
    const email = analisarEmail(txt(g(l, "E-mail")));
    const cargo = txt(g(l, "Cargo"));
    const qtd = Math.max(nomes.length, zaps.length, 1);
    const contatos: ContatoImp[] = [];
    for (let i = 0; i < qtd; i++) {
      contatos.push({
        nome: nomes[i] ? titulo(nomes[i]) : null, cargo: i === 0 ? cargo : null,
        email: i === 0 ? email.email : null, email_status: i === 0 ? email.status : "ausente",
        email_sugestao: i === 0 ? email.sugestao ?? null : null,
        whatsapp: zaps[i] ? normalizarCelular(zaps[i]) : null, telefone: zaps[i] ?? null, principal: i === 0,
      });
    }

    const etapaNum = Number(String(txt(g(l, "Estágio")) || "1").match(/^\d/)?.[0] ?? 1);
    const perdido = norm(g(l, "Perdido? (S/N)")) === "S" || etapaNum === 0;
    const recontato = dataISO(g(l, "Data prevista de recontato (se Perdido)"));
    const proxima = txt(g(l, "Próxima ação"));
    const dataProx = dataISO(g(l, "Data da próxima ação"));
    const ultimo = dataISO(g(l, "Último contato"));
    let situacao: GrupoImp["situacao"] = "ativo";
    let pausado_ate: string | null = null;
    let perdido_motivo: string | null = null;
    const tarefas: GrupoImp["tarefas"] = [];
    if (perdido && recontato) { situacao = "pausado"; pausado_ate = recontato; tarefas.push({ titulo: `Retomar contato${proxima ? `: ${proxima}` : ""}`, vence_em: recontato }); }
    else if (perdido) { situacao = "perdido"; perdido_motivo = proxima || txt(g(l, "Observações")) || "Motivo não registrado na planilha"; }
    else if (proxima) tarefas.push({ titulo: proxima, vence_em: dataProx || hoje });

    const atividades: GrupoImp["atividades"] = [];
    if (ultimo) atividades.push({ tipo: "nota", resumo: "Último contato registrado na planilha", em: ultimo });
    if (norm(g(l, "Simulação de ROI enviada? (S/N)")) === "S") atividades.push({ tipo: "nota", resumo: "Simulação de ROI enviada (registrado na planilha)", em: ultimo || hoje });

    const avisos: string[] = [];
    if (!contatos.some((ct) => ct.email_status === "ok")) avisos.push("Sem e-mail: só WhatsApp e ligação");
    if (!contatos.some((ct) => ct.whatsapp)) avisos.push("Sem celular válido para WhatsApp");
    const lojas = Number(txt(g(l, "Nº de lojas")) || 1) || 1;

    grupos.push({
      chave: `p${n++}`, nome, tipo: txt(g(l, "Tipo")) || "Concessionária", origem: txt(g(l, "Origem")),
      origem_interna: null, segmento: null, marcas: txt(g(l, "Marca(s)")), num_lojas: lojas,
      entregas_mes: Number(txt(g(l, "Entregas de veículos/mês (grupo)"))) || null,
      etapa: Math.min(Math.max(etapaNum || 2, 1), 7), situacao, pausado_ate, perdido_motivo,
      temperatura: TEMP[norm(g(l, "Temperatura"))] || "frio", pacote: PAC[norm(g(l, "Pacote provável"))] || "essencial",
      ultimo_sinal: ultimo, observacoes: txt(g(l, "Observações")),
      contatos, lojas: [], tarefas, atividades, avisos, excluido: null, incluir: true,
    });
  }
  return grupos;
}
