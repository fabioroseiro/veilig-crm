// lib/proposta/render.ts
// Gera o HTML da proposta — os mesmos slides 16:9 da apresentação, com os dados do CRM.
// Módulo puro: devolve string. Quem serve a resposta é a rota.

import {
  EntradaProposta, Projecao, Roi, Modelo,
  calcularProjecao, calcularRoi, brl, brlCent, brlLongo, num, pct, nomeSegmento,
} from "./modelo";
import { TARIFAS, ONBOARDING } from "../proposta-tipos";

export interface AssetsProposta {
  /** URL do ícone da marca (ex.: /proposta/logo.png). */
  logo: string;
  /** URL da roda do ciclo do plano (ex.: /proposta/mandala.png). */
  mandala: string;
}

export interface MetaProposta {
  numero: string;
  emitidaEm: string;
  validaAte: string;
  responsavel: string;
  /** Nome do pacote contratado (Essencial, Performance, Completo). */
  pacote: string;
  /** Módulos incluídos no pacote. */
  modulos: string;
  /** Dia de vencimento das faturas, como na proposta escrita. */
  vencimentoDia?: number;
  /** Texto livre digitado na proposta; vira um slide quando preenchido. */
  observacoes?: string;
  /** Quando true, mostra a barra de pré-visualização (uso interno do CRM). */
  previa?: boolean;
}

// ----------------------------------------------------------- unidades
// O slide tem 10 x 5,625 polegadas. 1 polegada = 10cqw; 1pt = 10/72 cqw.
const U = (n: number) => (n * 10).toFixed(4) + "cqw";
const PT = (n: number) => (n * 0.138889).toFixed(4) + "cqw";
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Align = "left" | "center" | "right";
type VAlign = "top" | "middle" | "bottom";

function A(x: number, y: number, w: number, h: number | "auto", inner = "", st = "") {
  const altura = h === "auto" ? "auto" : U(h);
  return `<div class="a" style="left:${U(x)};top:${U(y)};width:${U(w)};height:${altura};${st}">${inner}</div>`;
}

function T(t: string, x: number, y: number, w: number, h: number, size: number,
           cor = "var(--body)", bold = false, al: Align = "left", va: VAlign = "top",
           lh = 1.35, extra = "") {
  const mapa = { top: "flex-start", middle: "center", bottom: "flex-end" } as const;
  return A(x, y, w, h, `<span>${t}</span>`,
    `font-size:${PT(size)};color:${cor};text-align:${al};line-height:${lh};` +
    `${bold ? "font-weight:700;" : ""}display:flex;flex-direction:column;` +
    `justify-content:${mapa[va]};${extra}`);
}

const C = (x: number, y: number, w: number, h: number,
           fill = "var(--surface)", line = "var(--border)", r = 0.06) =>
  A(x, y, w, h, "", `background:${fill};border:${U(0.0075)} solid ${line};border-radius:${U(r)};`);

const LINE = (x: number, y: number, w: number, c = "var(--border)") =>
  A(x, y, w, 0.0075, "", `background:${c};`);

const PILL = (t: string, x: number, y: number, w: number, h: number,
              fill: string, cor: string, size = 7.5) =>
  A(x, y, w, h, `<span>${t}</span>`,
    `background:${fill};color:${cor};border-radius:${U(h / 2)};font-size:${PT(size)};` +
    `font-weight:700;display:flex;align-items:center;justify-content:center;line-height:1.15;`);

const NUM = (n: number | string, x: number, y: number, d = 0.34,
             fill = "var(--accent)", cor = "var(--ink)", size = 10) =>
  A(x, y, d, d, `<span>${n}</span>`,
    `background:${fill};color:${cor};border-radius:50%;font-size:${PT(size)};font-weight:700;` +
    `display:flex;align-items:center;justify-content:center;text-align:center;line-height:1;`);

/** Lista com altura natural: nunca estima quantas linhas cada item ocupa. */
function LI(itens: string[], x: number, y: number, w: number, size = 9.5, cor = "var(--body)") {
  const li = itens.map(t =>
    `<div style="display:flex;gap:${U(0.12)};align-items:flex-start">` +
    `<span style="flex:none;width:${U(0.072)};height:${U(0.072)};border-radius:50%;` +
    `background:var(--accent);margin-top:${U(0.05)}"></span>` +
    `<span style="flex:1;min-width:0">${t}</span></div>`).join("");
  return A(x, y, w, "auto", li,
    `font-size:${PT(size)};color:${cor};line-height:1.3;display:flex;` +
    `flex-direction:column;gap:${U(0.055)};`);
}

function HEAD(titulo: string, kicker: string, sub?: string, logo?: string) {
  let o = T(kicker.toUpperCase(), 0.5, 0.3, 8, 0.22, 8.5, "var(--accent)", true,
            "left", "top", 1.3, `letter-spacing:${PT(1.5)};`) +
          T(titulo, 0.5, 0.52, 8.9, 0.5, 22, "var(--ink)", true, "left", "top", 1.15);
  if (sub) o += T(sub, 0.5, 1.06, 8.9, 0.42, 10.5, "var(--muted)", false, "left", "top", 1.35);
  if (logo) o += A(9.1, 0.3, 0.4, 0.4, `<img src="${logo}" alt="">`, "display:flex;");
  return o;
}

// ----------------------------------------------------------- formatos de onboarding
interface DefModelo {
  nome: string; modo: string; tag: string; setup: number;
  parcelas: [string, number][]; prazo: string; itens: string[]; nota: string; indicado: string;
}

/** Nome, duração e indicação vêm de ONBOARDING, para não divergir da proposta escrita. */
function modelos(e: EntradaProposta): Record<Modelo, DefModelo> {
  const p3 = (v: number): [string, number][] => {
    if (v <= 0) return [];
    const a = Math.round(v * 0.4167 / 50) * 50;
    const resto = Math.round((v - a) / 2 / 50) * 50;
    return [["1ª parcela — assinatura", a], ["2ª parcela — go-live", resto],
            ["3ª parcela — 30 dias após", v - a - resto]];
  };
  const p2 = (v: number): [string, number][] => {
    if (v <= 0) return [];
    const a = Math.round(v * 0.57 / 50) * 50;
    return [["1ª parcela — assinatura", a], ["2ª parcela — go-live", v - a]];
  };
  const prazo = (k: Modelo) => ONBOARDING[k].duracao.replace(" até o go-live", "");
  return {
    consultivo: {
      nome: ONBOARDING.consultivo.nome, modo: "Presencial nos marcos, com a Veilig dentro da operação",
      tag: "Mais completo", setup: e.setupConsultivo, parcelas: p3(e.setupConsultivo),
      prazo: prazo("consultivo"), indicado: ONBOARDING.consultivo.indicado,
      itens: ["Diagnóstico presencial dos custos da oficina",
              "Workshop para desenhar e precificar os planos",
              "Treinamento presencial, com simulação de balcão",
              "Time Veilig na loja na primeira semana de vendas",
              "90 dias de acompanhamento, com revisão de preços"],
      nota: "Nas etapas presenciais, as despesas de deslocamento da equipe Veilig são reembolsadas mediante comprovação.",
    },
    online: {
      nome: ONBOARDING.online.nome, modo: "Remoto, mais enxuto e mais rápido",
      tag: "Mais rápido", setup: e.setupOnline, parcelas: p2(e.setupOnline),
      prazo: prazo("online"), indicado: ONBOARDING.online.indicado,
      itens: ["Levantamento por formulário e kickoff em vídeo",
              "Proposta de planos da Veilig, validada em uma sessão",
              "Treinamento ao vivo por perfil, gravado para consulta",
              "Venda-teste conferida em chamada antes do go-live",
              "30 dias de acompanhamento, com dois check-ins"],
      nota: "Onboarding integralmente remoto, sem custo de deslocamento.",
    },
  };
}

// ----------------------------------------------------------- slides
function slideCapa(e: EntradaProposta, p: Projecao, m: MetaProposta, a: AssetsProposta) {
  const txtModo = e.onboarding === "ambos"
    ? "com dois formatos de onboarding à escolha"
    : `com onboarding ${e.onboarding === "consultivo" ? "consultivo" : "online"}`;
  const chips: [string, string][] = [
    [num(e.lojas), `lojas de<br>${nomeSegmento(e.segmento)}`],
    [num(p.vendasMes), "veículos vendidos<br>por mês"],
    [brl(e.ticket), "ticket médio de<br>revisão"],
  ];
  let o =
    A(7.3, -1.3, 4.0, 4.0, "", "background:var(--ink-deep);border-radius:50%;") +
    A(8.8, 3.6, 2.4, 2.4, "", "background:var(--ink-deep);border-radius:50%;") +
    A(0.5, 0.5, 0.6, 0.6, `<img src="${a.logo}" alt="">`, "display:flex;") +
    T("VEILIG", 1.28, 0.5, 3, 0.6, 15, "var(--accent-bright)", true, "left", "middle", 1.3, `letter-spacing:${PT(6)};`) +
    T("Proposta Comercial", 0.5, 1.68, 7, 0.6, 32, "#fff", true, "left", "top", 1.1) +
    T(esc(e.grupo), 0.5, 2.34, 7, 0.45, 20, "var(--accent-bright)") +
    T(`Pacote ${esc(m.pacote)} de planos de manutenção recorrente para as ${num(e.lojas)} lojas do grupo, ${txtModo}.`,
      0.5, 2.92, 6.2, 0.75, 11.5, "var(--soft)", false, "left", "top", 1.45);
  chips.forEach(([n, d], i) => {
    const x = 0.5 + i * 2.2;
    o += A(x, 3.86, 2.0, 0.92, "", `background:var(--ink-deep);border:${U(0.0075)} solid #2c5a64;border-radius:${U(0.08)};`) +
         T(n, x + 0.18, 3.95, 1.7, 0.36, 20, "var(--accent-bright)", true) +
         T(d, x + 0.18, 4.32, 1.7, 0.45, 8, "var(--soft)", false, "left", "top", 1.3);
  });
  o += T(`Proposta ${esc(m.numero)}  ·  emitida em ${esc(m.emitidaEm)}  ·  válida até ${esc(m.validaAte)}`,
         0.5, 5.0, 7, 0.25, 8.5, "#7fa6b0");
  return o;
}

function slideEscopo(e: EntradaProposta, p: Projecao, m: MetaProposta, a: AssetsProposta) {
  const linhas: [string, string][] = [
    [`Lojas de ${nomeSegmento(e.segmento)}`, num(e.lojas)],
    ["Veículos vendidos por mês", num(p.vendasMes)],
    ["Ticket médio de revisão", brl(e.ticket)],
  ];
  let o = HEAD("Escopo desta proposta", "Escopo",
    `Pacote ${esc(m.pacote)} da Veilig, implantado nas ${num(e.lojas)} lojas do grupo.`, a.logo) +
    C(0.5, 1.6, 4.35, 2.05, "var(--ink)", "var(--ink)") +
    T("O GRUPO", 0.78, 1.76, 3.8, 0.2, 7.5, "var(--accent-bright)", true, "left", "top", 1.3, `letter-spacing:${PT(1)};`);
  linhas.forEach(([k, v], i) => {
    const y = 2.12 + i * 0.5, ult = i === 2;
    o += T(k, 0.78, y, 2.7, 0.3, 10.5, ult ? "#fff" : "var(--soft)", ult, "left", "middle") +
         T(v, 3.4, y, 1.16, 0.3, ult ? 15 : 14, ult ? "var(--accent-bright)" : "#fff", true, "right", "middle");
    if (i === 1) o += LINE(0.78, y + 0.4, 3.78, "#2c5a64");
  });
  o += C(5.15, 1.6, 4.35, 2.05) +
       T(`O que está incluído no ${esc(m.pacote)}`, 5.39, 1.76, 3.9, 0.28, 12, "var(--ink)", true) +
       LI([`Plataforma de planos nas ${num(e.lojas)} lojas`,
           "Usuários ilimitados, nos quatro perfis de acesso",
           "Portal do cliente final e contrato de adesão",
           "Cobrança recorrente e repasse automático",
           "Indicadores de adesão, inadimplência e oficina",
           "Suporte em dias úteis, das 9h às 18h"], 5.39, 2.14, 3.95, 9.3);
  ([["Módulos incluídos", esc(m.modulos) + "."],
    ["Taxas de pagamento", "As tarifas da instituição de pagamento são descontadas na liquidação e não compõem o valor da Veilig."]] as [string, string][])
    .forEach(([t, p], i) => {
      const x = 0.5 + i * 4.6;
      o += C(x, 3.8, 4.4, 1.15, "var(--surface-2)") +
           T(t, x + 0.22, 3.94, 3.9, 0.26, 10, "var(--ink)", true) +
           T(p, x + 0.22, 4.22, 3.98, 0.68, 8.8, "var(--muted)", false, "left", "top", 1.35);
    });
  return o;
}

function cardModelo(m: DefModelo, chave: Modelo, selecionavel: boolean,
                    marcado: boolean, x: number, y: number, w: number, h: number) {
  let o = C(x, y, w, h, "var(--surface)", marcado || !selecionavel ? "var(--accent)" : "var(--border)", 0.09) +
    T(m.nome, x + 0.28, y + 0.2, 2.5, 0.38, 19, "var(--ink)", true) +
    T(m.modo, x + 0.28, y + 0.6, w - 0.9, 0.22, 9, "var(--muted)") +
    PILL(m.tag, x + w - 1.45, y + 0.22, 1.2, 0.24, "var(--accent-soft)", "var(--accent)", 6.8) +
    T(brl(m.setup), x + 0.28, y + 0.88, 2.4, 0.44, 25, "var(--ink)", true) +
    T(`de setup, em ${m.parcelas.length} parcelas<br>go-live em ${m.prazo.replace("cerca de ", "~")}`,
      x + 2.45, y + 0.96, w - 2.7, 0.42, 8.5, "var(--muted)", false, "left", "top", 1.3) +
    LINE(x + 0.28, y + 1.42, w - 0.56) +
    LI(m.itens, x + 0.28, y + 1.54, w - 0.56, 9);
  if (selecionavel) {
    o += `<div class="a hit" tabindex="0" role="button" data-escolher="${chave}" ` +
      `style="left:${U(x + 0.28)};top:${U(y + h - 0.62)};width:${U(w - 0.56)};height:${U(0.42)};` +
      `background:var(--accent);color:#fff;border-radius:${U(0.07)};` +
      `font-size:${PT(10.5)};font-weight:700;display:flex;align-items:center;justify-content:center;">` +
      `<span>Quero este formato</span></div>`;
  } else {
    o += T("Formato definido para esta proposta.", x + 0.28, y + h - 0.52, w - 0.56, 0.3,
           8.5, "var(--muted)", false, "left", "top", 1.3, "font-style:italic;");
  }
  return o;
}

function slideRoi(e: EntradaProposta, p: Projecao, r: Roi, a: AssetsProposta) {
  const setup = r.setupAplicado;
  const escolhaAberta = e.onboarding === "ambos";
  let o = HEAD("Retorno sobre o investimento", "ROI estimado",
    "O que a Veilig custa comparado com a receita de oficina que só existe porque o cliente assinou o plano.", a.logo);

  // Composição da receita incremental, com a carteira cheia.
  const comp: [string, string, string, string][] = [
    [`${num(r.naoVoltariam)} clientes`, "que não voltariam para a revisão seguinte",
     brl(r.valorNaoVoltariam), "o valor cheio do plano, que hoje é receita perdida"],
    [`${num(r.voltariam)} clientes`, "que voltariam de qualquer forma",
     brl(r.valorVoltariam), "apenas o acréscimo de margem embutido no plano"],
  ];
  comp.forEach((c, i) => {
    const x = 0.5 + i * 2.62;
    o += C(x, 1.5, 2.45, 1.5) +
         T(c[0], x + 0.2, 1.62, 2.1, 0.3, 13, "var(--ink)", true) +
         T(c[1], x + 0.2, 1.92, 2.1, 0.4, 8.3, "var(--muted)", false, "left", "top", 1.3) +
         T(c[2], x + 0.2, 2.34, 2.1, 0.34, 15, "var(--accent)", true) +
         T(c[3], x + 0.2, 2.68, 2.15, 0.3, 7.6, "var(--muted)", false, "left", "top", 1.25) +
         T(i === 0 ? "+" : "=", x + 2.45, 2.05, 0.17, 0.3, 15, "var(--accent)", true, "center", "middle");
  });
  o += C(5.74, 1.5, 3.76, 1.5, "var(--ink)", "var(--ink)") +
    T("RECEITA INCREMENTAL COM A CARTEIRA CHEIA", 5.94, 1.62, 3.4, 0.2, 6.8, "var(--accent-bright)", true, "left", "top", 1.2, `letter-spacing:${PT(0.8)};`) +
    T(brl(r.regime.incremental), 5.94, 1.86, 3.4, 0.5, 27, "#fff", true) +
    T(`por ano, do 2º ano em diante. No 1º ano, com a carteira se formando mês a mês: <b style="color:var(--accent-bright)">${brl(r.ano1.incremental)}</b>.`,
      5.94, 2.4, 3.42, 0.5, 8.6, "var(--soft)", false, "left", "top", 1.35);

  // Custo da Veilig, ano 1 e em regime, lado a lado.
  o += C(0.5, 3.12, 5.05, 1.84) +
    T("O que a Veilig custa", 0.74, 3.22, 2.6, 0.26, 11.5, "var(--ink)", true) +
    T("Ano 1", 3.45, 3.24, 0.95, 0.22, 8, "var(--muted)", true, "right", "top", 1.2, `letter-spacing:${PT(0.6)};`) +
    T("Em regime", 4.42, 3.24, 0.95, 0.22, 8, "var(--muted)", true, "right", "top", 1.2, `letter-spacing:${PT(0.6)};`);
  const custos: [string, string, string, string][] = [
    ["Recorrente da plataforma", `${num(e.lojas)} lojas × ${brl(e.recorrenteLoja)} × 12`,
     brl(r.ano1.recorrente), brl(r.regime.recorrente)],
    [`Taxa de sucesso de ${num(e.fee)}%`, "sobre o valor líquido recebido dos planos",
     brl(r.ano1.taxaSucesso), brl(r.regime.taxaSucesso)],
    ["Implantação", setup <= 0 ? "isenta nesta proposta"
       : escolhaAberta ? "no formato consultivo, o de maior valor" : "parcelada, cobrada só no 1º ano",
     brl(setup), "—"],
  ];
  custos.forEach((c, i) => {
    const y = 3.52 + i * 0.36;
    if (i % 2 === 0) o += A(0.66, y, 4.74, 0.34, "", "background:var(--surface-2);");
    o += T(c[0], 0.78, y + 0.01, 2.5, 0.19, 8.6, "var(--ink)", true) +
         T(c[1], 0.78, y + 0.17, 2.6, 0.17, 7.1, "var(--muted)") +
         T(c[2], 3.45, y, 0.95, 0.34, 9, "var(--ink)", true, "right", "middle") +
         T(c[3], 4.42, y, 0.95, 0.34, 9, "var(--muted)", true, "right", "middle");
  });
  o += LINE(0.66, 4.64, 4.74) +
    T("Total", 0.78, 4.68, 2.5, 0.26, 9, "var(--ink)", true, "left", "middle") +
    T(brl(r.ano1.custo), 3.45, 4.68, 0.95, 0.26, 10, "var(--ink)", true, "right", "middle") +
    T(brl(r.regime.custo), 4.42, 4.68, 0.95, 0.26, 10, "var(--ink)", true, "right", "middle");

  // Retorno nos dois horizontes.
  o += T("Retorno sobre o investimento", 5.74, 3.22, 3.8, 0.26, 11.5, "var(--ink)", true);
  ([[r.ano1, "No ano 1", setup > 0 ? "já com a implantação" : "sem implantação a pagar"],
    [r.regime, "Em regime", "do 2º ano em diante"]] as [typeof r.ano1, string, string][])
    .forEach(([c, rot, sub], i) => {
      const x = 5.74 + i * 1.95, dest = i === 1;
      o += C(x, 3.52, 1.81, 1.3, dest ? "var(--accent-soft)" : "var(--surface)", dest ? "var(--accent)" : "var(--border)") +
        T(rot, x + 0.16, 3.62, 1.5, 0.2, 8.5, "var(--ink)", true) +
        T(sub, x + 0.16, 3.81, 1.55, 0.26, 7, "var(--muted)", false, "left", "top", 1.2) +
        T(brlCent(c.multiplo), x + 0.16, 4.07, 1.5, 0.36, 19, "var(--ink)", true) +
        T("de volta a cada R$ 1 investido", x + 0.16, 4.45, 1.55, 0.3, 7, "var(--muted)", false, "left", "top", 1.25);
    });
  o += (r.paybackMes
    ? T(`O investimento se paga no ${r.paybackMes}º mês${setup > 0 ? ", já contando a implantação" : ""}.`,
        5.74, 4.92, 3.8, 0.2, 8, "var(--accent)", true)
    : "");

  o += T("Receita incremental, não lucro: o custo das revisões feitas pela oficina continua sendo da concessionária. " +
         "Premissa de que metade dos clientes não voltaria para a revisão seguinte sem o plano. Estimativa, não garantia de resultado.",
         0.5, 5.18, 9.0, 0.3, 7.6, "var(--muted)", false, "left", "top", 1.3, "font-style:italic;");
  return o;
}

/** Institucional — texto fixo, não depende dos números da proposta. */
function slideOrigem(a: AssetsProposta) {
  let o = HEAD("Nascemos dentro da concessionária", "Quem somos",
    "A Veilig não é uma software house que descobriu o setor automotivo. O produto nasceu da " +
    "operação de pós-venda, resolvendo um problema que já era nosso.", a.logo) +
    C(0.5, 1.68, 4.35, 2.55, "var(--ink)", "var(--ink)") +
    T("A origem", 0.78, 1.86, 3.8, 0.28, 13, "var(--accent-bright)", true) +
    T("Começamos operando pós-venda em concessionárias. A perda de cliente entre a primeira, a segunda " +
      "e a terceira revisão não era teoria: era a conta que não fechava no fim do mês.<br><br>" +
      "O plano de manutenção recorrente foi a resposta que construímos para dentro. Funcionou, e virou produto.",
      0.78, 2.22, 3.8, 1.85, 10.5, "#fff", false, "left", "top", 1.45);
  ([["Fidelizar o cliente", "O plano traz o cliente de volta à oficina porque a manutenção já está paga. O vínculo deixa de depender de lembrete."],
    ["Antecipar receita", "A revisão que aconteceria daqui a seis meses passa a entrar em parcelas, todo mês, desde a venda do veículo."]] as [string, string][])
    .forEach(([t, d], i) => {
      const y = 1.68 + i * 1.33;
      o += C(5.15, y, 4.35, 1.22) +
           A(5.37, y + 0.2, 0.2, 0.2, "", `background:var(--accent);border-radius:${U(0.05)};`) +
           T(t, 5.67, y + 0.14, 3.6, 0.32, 12.5, "var(--ink)", true, "left", "middle") +
           T(d, 5.37, y + 0.54, 3.95, 0.62, 9.5, "var(--muted)", false, "left", "top", 1.35);
    });
  o += C(0.5, 4.38, 9.0, 0.58, "var(--accent-soft)", "var(--accent-soft)") +
    T("Hoje somos a plataforma que estrutura, vende e administra planos de manutenção para grupos de " +
      "concessionárias — de motos a veículos leves, pesados e agrícolas.",
      0.74, 4.38, 8.5, 0.58, 10, "var(--ink)", false, "left", "middle");
  return o;
}

/** Indicadores medidos pela Veilig em operação real — valores fixos, nunca calculados. */
function slideResultados(a: AssetsProposta) {
  let o = HEAD("O que já medimos em operação real", "Resultados",
    "Dados de uma rede de concessionárias atendida pela Veilig, em 16 meses e mais de 20 mil ordens de serviço.", a.logo);
  ([["98%", "74%", "voltaram da 1ª para a 2ª revisão"],
    ["5,0", "2,4", "passagens na oficina por veículo"],
    ["1,8", "0,8", "serviços avulsos por veículo"],
    ["67%", "36%", "fizeram 3 passagens ou mais"]] as [string, string, string][])
    .forEach(([com, sem, t], i) => {
      const x = 0.5 + i * 2.28;
      o += C(x, 1.6, 2.1, 1.95) +
        T("COM PLANO", x + 0.18, 1.74, 1.75, 0.18, 6.5, "var(--accent)", true, "left", "top", 1.3, `letter-spacing:${PT(0.8)};`) +
        T(com, x + 0.18, 1.92, 1.75, 0.52, 29, "var(--ink)", true, "left", "top", 1.05) +
        LINE(x + 0.18, 2.48, 1.74) +
        T("sem plano", x + 0.18, 2.56, 1.0, 0.2, 7.5, "var(--muted)") +
        T(sem, x + 1.0, 2.54, 0.92, 0.24, 12, "var(--muted)", true, "right") +
        T(t, x + 0.18, 2.9, 1.78, 0.58, 8.8, "var(--ink)", true, "left", "top", 1.3);
    });
  ([["+65%", "de ordens de serviço na oficina, comparando o mesmo trimestre de um ano para o outro"],
    ["74%", "dos atendimentos do mês vindos de clientes recorrentes"],
    ["NPS 95", "medido na operação de pós-venda, em escala de −100 a 100"]] as [string, string][])
    .forEach(([n, d], i) => {
      const x = 0.5 + i * 3.07, escuro = i === 0;
      o += C(x, 3.72, 2.85, 1.24, escuro ? "var(--ink)" : "var(--surface-2)", escuro ? "var(--ink)" : "var(--border)") +
        T(n, x + 0.22, 3.86, 2.4, 0.4, 20, escuro ? "var(--accent-bright)" : "var(--ink)", true) +
        T(d, x + 0.22, 4.3, 2.45, 0.62, 8.5, escuro ? "var(--soft)" : "var(--muted)", false, "left", "top", 1.3);
    });
  o += T("20 mil ordens de serviço, 4.767 veículos, 16 meses. O crescimento de ordens de serviço reflete a operação inteira.",
         0.5, 5.08, 9.0, 0.3, 8, "var(--muted)", false, "left", "top", 1.3, "font-style:italic;");
  return o;
}

function slideDetalhe(a: AssetsProposta) {
  let o = HEAD("O que cada ponto entrega", "Abrangência", undefined, a.logo);
  ([["Regras do plano", "Revisões cobertas, tetos, exclusões, carência por faixa de idade e política de aceitação."],
    ["Venda no balcão", "O vendedor descreve o veículo e o sistema mostra só os planos elegíveis, com preço e carência calculados."],
    ["Contrato digital", "Gerado do mesmo cadastro que o vendedor vê na tela e arquivado no ato da venda."],
    ["Cobrança recorrente", "Mensalidade em cartão, Pix ou boleto, com lembrete e conciliação automáticos."],
    ["Repasse automático", "Divisão do valor na liquidação: a loja recebe sua parte sem acerto manual."],
    ["Portal do cliente", "Situação da assinatura, contrato, segunda via e troca de cartão."],
    ["Comissão do vendedor", "Relatório de vendas por vendedor e por período, com cancelamentos."],
    ["Indicadores e integração", "Painéis por loja e por grupo, e API para consulta pelo DMS."]] as [string, string][])
    .forEach(([t, p], i) => {
      const x = 0.5 + (i % 2) * 4.6, y = 1.2 + Math.floor(i / 2) * 1.02;
      o += C(x, y, 4.4, 0.9) +
        A(x + 0.18, y + 0.17, 0.18, 0.18, "", `background:var(--accent);border-radius:${U(0.05)};`) +
        T(t, x + 0.45, y + 0.1, 3.8, 0.3, 10.5, "var(--ink)", true, "left", "middle") +
        T(p, x + 0.18, y + 0.42, 4.05, 0.46, 8, "var(--muted)", false, "left", "top", 1.3);
    });
  return o;
}

/** Só entra quando o grupo ainda vai escolher o modelo. */
function slideComparativo(a: AssetsProposta) {
  let o = HEAD("Os dois modelos, lado a lado", "A decisão do grupo",
    "Comparação ponto a ponto, para a decisão ser tomada com clareza.", a.logo) +
    A(0.5, 1.55, 9.0, 0.3, "", `background:var(--ink);border-radius:${U(0.05)} ${U(0.05)} 0 0;`) +
    T("Consultivo", 2.45, 1.55, 3.5, 0.3, 8.5, "#fff", true, "left", "middle") +
    T("Online", 6.0, 1.55, 3.4, 0.3, 8.5, "#fff", true, "left", "middle");
  let yy = 1.85;
  ([["Formato", "Encontros presenciais nos marcos, com acompanhamento semanal", "Sessões por vídeo, com formulários e material gravado"],
    ["Prazo até o go-live", "Cerca de 6 semanas", "Cerca de 3 semanas"],
    ["Desenho dos planos", "Feito em conjunto, a partir do diagnóstico dos custos da oficina", "Proposta da Veilig a partir de modelos, validada em uma sessão"],
    ["Treinamento", "Presencial por perfil, com simulação de balcão", "Online por perfil, ao vivo e gravado"],
    ["Go-live", "Time Veilig na loja na primeira semana de vendas", "Suporte remoto prioritário na primeira semana"],
    ["Acompanhamento", "90 dias, com revisão de preços aos 30 dias", "30 dias, com dois check-ins de resultado"]] as [string, string, string][])
    .forEach(([k, c1, c2], i) => {
      const h = c1.length > 50 || c2.length > 50 ? 0.52 : 0.4;
      if (i % 2 === 0) o += A(0.5, yy, 9.0, h, "", "background:var(--surface-2);");
      o += T(k, 0.6, yy, 1.8, h, 8.5, "var(--ink)", true, "left", "middle") +
           T(c1, 2.45, yy, 3.45, h, 8.5, "var(--body)", false, "left", "middle", 1.3) +
           T(c2, 6.0, yy, 3.4, h, 8.5, "var(--body)", false, "left", "middle", 1.3) +
           LINE(0.5, yy + h, 9.0);
      yy += h;
    });
  return o;
}

// ----------------------------------------------------------- HTML
export interface PartesProposta {
  /** Estilo + slides + navegação. Pode ir direto em dangerouslySetInnerHTML. */
  html: string;
  /** Script de navegação. Precisa ser inserido como <script>, senão não executa. */
  script: string;
}

export function renderProposta(e: EntradaProposta, meta: MetaProposta, assets: AssetsProposta): PartesProposta {
  const p = calcularProjecao(e);
  const r = calcularRoi(e, p);
  const M = modelos(e);
  const escolha = e.onboarding === "ambos";
  const ativo: Modelo | null = escolha ? null : (e.onboarding as Modelo);
  const feePct = `${num(e.fee)}%`;

  const sl: { id: string; cls: string; html: string }[] = [];
  sl.push({ id: "capa", cls: "dark", html: slideCapa(e, p, meta, assets) });
  sl.push({ id: "origem", cls: "", html: slideOrigem(assets) });
  sl.push({ id: "resultados", cls: "", html: slideResultados(assets) });
  sl.push({ id: "mandala", cls: "", html:
    HEAD("Os pontos que a Veilig toca na sua operação", "Abrangência", undefined, assets.logo) +
    A(0.5, 1.08, 9.0, 4.23, `<img src="${assets.mandala}" alt="Ciclo do plano">`,
      "display:flex;align-items:center;justify-content:center;") });
  sl.push({ id: "detalhe", cls: "", html: slideDetalhe(assets) });
  sl.push({ id: "escopo", cls: "", html: slideEscopo(e, p, meta, assets) });

  // ---- onboarding
  let impl: string;
  if (escolha) {
    impl = HEAD("Dois caminhos até a primeira venda", "Onboarding",
      "Os dois formatos terminam no mesmo lugar: planos no ar, time treinado e a primeira venda conferida de " +
      "ponta a ponta. Muda quanto a Veilig entra dentro da operação. A escolha é feita no aceite desta proposta.",
      assets.logo) +
      cardModelo(M.consultivo, "consultivo", true, false, 0.5, 1.5, 4.35, 3.3) +
      cardModelo(M.online, "online", true, false, 5.15, 1.5, 4.35, 3.3) +
      C(0.5, 4.94, 9.0, 0.46, "var(--ink)", "var(--ink)") +
      T('<b style="color:var(--accent-bright)">O recorrente da plataforma é o mesmo nos dois formatos.</b> ' +
        "A escolha altera apenas a implantação e o tempo até o go-live.",
        0.74, 4.94, 8.5, 0.46, 9.5, "#fff", false, "left", "middle");
  } else {
    const m = M[ativo as Modelo];
    impl = HEAD(`Onboarding ${m.nome}: ${m.prazo} até o go-live`, "Onboarding",
      `${m.modo}. Indicado para: ${m.indicado.toLowerCase()}.`, assets.logo) +
      cardModelo(m, ativo as Modelo, false, false, 0.5, 1.5, 4.35, 3.3) +
      C(5.15, 1.5, 4.35, 3.3, "var(--surface-2)", "var(--border)", 0.09) +
      T("O que vocês recebem no período", 5.39, 1.7, 3.9, 0.3, 12, "var(--ink)", true) +
      LI(["Planos desenhados com as regras do grupo e aprovados por vocês",
          `Ambiente das ${num(e.lojas)} lojas parametrizado pela Veilig`,
          "Conta de recebimento aberta e divisão do valor configurada",
          "Time treinado por perfil, do grupo ao vendedor",
          "Venda-teste conferida do balcão até o repasse",
          "Acompanhamento dos indicadores depois do go-live"], 5.39, 2.1, 3.95, 9.3) +
      C(0.5, 4.94, 9.0, 0.46, "var(--surface-2)", "var(--border)") +
      T("O go-live só acontece com planos e minuta do contrato aprovados, conta de recebimento aprovada, " +
        "venda-teste concluída com repasse conferido e time treinado por perfil.",
        0.74, 4.94, 8.5, 0.46, 9, "var(--ink)", false, "left", "middle");
  }
  sl.push({ id: "onboarding", cls: "", html: impl });
  if (escolha) sl.push({ id: "comparativo", cls: "", html: slideComparativo(assets) });

  // ---- projeção
  const etapas: [string, string, string][] = [
    ["Ticket da revisão", brl(e.ticket), "o que o cliente gasta hoje por revisão"],
    [`× ${p.revisoes.toLocaleString("pt-BR")} revisões/ano`, brl(e.ticket * p.revisoes),
     `frequência média — ${nomeSegmento(e.segmento)}`],
    ["× margem de 35%", brl(p.valorAnualPlano), "margem adotada na simulação"],
    ["÷ 12 meses", brlCent(p.mensalidadePlano), "a mensalidade que o cliente enxerga"],
  ];
  let pj = HEAD("Potencial de receita para o grupo", "Projeção",
    `A partir dos seus números, com margem de 35% sobre o ticket e adesão de ${pct(p.adesao)} — ` +
    (e.adesaoManual ? "taxa de adesão definida para este grupo." : "a faixa observada na base Veilig para esta mensalidade."), assets.logo);
  etapas.forEach(([k, v, d], i) => {
    const x = 0.5 + i * 2.28, dest = i === 3;
    pj += C(x, 1.62, 2.1, 1.35, dest ? "var(--ink)" : "var(--surface)", dest ? "var(--ink)" : "var(--border)") +
      T(k.toUpperCase(), x + 0.16, 1.74, 1.8, 0.3, 6.8, dest ? "var(--accent-bright)" : "var(--muted)", true, "left", "top", 1.2, `letter-spacing:${PT(0.6)};`) +
      T(v, x + 0.16, 2.04, 1.8, 0.4, 18, dest ? "#fff" : "var(--ink)", true) +
      T(d, x + 0.16, 2.45, 1.82, 0.46, 7.6, dest ? "var(--soft)" : "var(--muted)", false, "left", "top", 1.25) +
      (i < 3 ? T("›", x + 2.1, 2.15, 0.18, 0.3, 15, "var(--accent)", true, "center", "middle") : "");
  });
  pj += C(0.5, 3.1, 4.35, 1.88) +
    T(`Cenário com adesão de ${pct(p.adesao)}`, 0.74, 3.22, 3.9, 0.26, 11.5, "var(--ink)", true) +
    T("A carteira se forma mês a mês: o ano 1 é menor que o regime.", 0.74, 3.48, 3.95, 0.2, 8.3, "var(--muted)");
  ([["Novos clientes com plano por ano", num(p.planosAno)],
    ["Receita recebida no ano 1", brl(p.receitaAno1)],
    ["Receita anual, do 2º ano em diante", brl(p.receitaRegime)],
    ["Recorrência no 12º mês", brl(p.recorrencia12Mes) + "/mês"]] as [string, string][])
    .forEach(([k, v], i) => {
      const y = 3.74 + i * 0.32, dest = i === 2;
      if (i % 2 === 0) pj += A(0.66, y, 4.08, 0.3, "", "background:var(--surface-2);");
      pj += T(k, 0.76, y, 2.56, 0.3, 8.6, dest ? "var(--ink)" : "var(--muted)", dest, "left", "middle") +
            T(v, 3.16, y, 1.48, 0.3, 9.2, "var(--ink)", true, "right", "middle");
    });
  pj += C(5.15, 3.1, 4.35, 1.88, "var(--ink)", "var(--ink)") +
    T("O QUE ESTÁ FICANDO NA RUA HOJE", 5.39, 3.24, 3.9, 0.2, 7.5, "var(--accent-bright)", true, "left", "top", 1.3, `letter-spacing:${PT(1)};`) +
    T(brlLongo(p.deixadoNaRua), 5.39, 3.46, 3.9, 0.52, 29, "#fff", true) +
    T("por ano, considerando que metade dos clientes não volta para a revisão seguinte — " +
      `${num(p.clientesPerdidosAno)} clientes a um ticket de ${brl(e.ticket)}.`,
      5.39, 4.04, 3.95, 0.7, 9.3, "var(--soft)", false, "left", "top", 1.35) +
    T(`Capturar ${pct(p.adesao)} disso já significa ${brlLongo(p.receitaRegime)} por ano em regime.`,
      5.39, 4.7, 3.95, 0.22, 9, "var(--accent-bright)", true) +
    T("Projeção ilustrativa, não garantia de resultado. O preço e o escopo dos planos são definidos pela concessionária.",
      0.5, 5.08, 9.0, 0.3, 8, "var(--muted)", false, "left", "top", 1.3, "font-style:italic;");
  sl.push({ id: "projecao", cls: "", html: pj });

  // ---- recorrente
  let mz = HEAD("Investimento: recorrente da plataforma", "Investimento",
    "Igual nos dois formatos de onboarding. Cada loja entra na fatura quando entra em operação.", assets.logo) +
    C(0.5, 1.58, 4.35, 1.85, "var(--ink)", "var(--ink)") +
    T(`PACOTE ${esc(meta.pacote).toUpperCase()}`, 0.78, 1.74, 3.8, 0.2, 7.5, "var(--accent-bright)", true, "left", "top", 1.3, `letter-spacing:${PT(1)};`) +
    T(brl(e.recorrenteLoja), 0.78, 1.96, 2.0, 0.52, 32, "#fff", true) +
    T("por loja em<br>operação / mês", 2.5, 2.02, 2.1, 0.5, 9.5, "var(--soft)", false, "left", "top", 1.35) +
    LINE(0.78, 2.6, 3.8, "#2c5a64") +
    T(`<b style="color:var(--accent-bright)">+ ${feePct}</b> de taxa de sucesso sobre o valor líquido recebido ` +
      "dos clientes, retida automaticamente no repasse", 0.78, 2.72, 3.8, 0.58, 9.5, "#fff", false, "left", "top", 1.35) +
    C(5.15, 1.58, 4.35, 1.85) +
    T("Como o recorrente evolui", 5.39, 1.72, 3.9, 0.26, 11.5, "var(--ink)", true);
  ([["Durante o onboarding", "conforme ativação"],
    [`Grupo completo — ${num(e.lojas)} lojas`, brlCent(e.lojas * e.recorrenteLoja) + "/mês"],
    ["No ano cheio", brl(e.lojas * e.recorrenteLoja * 12)]] as [string, string][])
    .forEach(([k, v], i) => {
      const y = 2.08 + i * 0.4;
      if (i % 2 === 0) mz += A(5.31, y, 4.08, 0.38, "", "background:var(--surface-2);");
      mz += T(k, 5.39, y, 2.5, 0.38, 9.3, "var(--ink)", i === 1, "left", "middle") +
            T(v, 7.3, y, 2.0, 0.38, 9.5, i === 1 ? "var(--ink)" : "var(--muted)", true, "right", "middle");
    });
  ([["Loja só entra na fatura quando produz", "O recorrente de cada unidade começa no mês da ativação, não na assinatura."],
    ["A taxa de sucesso acompanha o resultado", `Os ${feePct} incidem apenas sobre o que for efetivamente recebido. Sem venda, não há taxa.`],
    ["Usuários ilimitados", "Não há cobrança por vendedor, por gestor ou por volume de assinaturas."]] as [string, string][])
    .forEach(([t, d], i) => {
      const x = 0.5 + i * 3.07;
      mz += C(x, 3.58, 2.85, 1.38, "var(--surface-2)") +
            T(t, x + 0.2, 3.7, 2.5, 0.48, 10, "var(--ink)", true, "left", "top", 1.3) +
            T(d, x + 0.2, 4.2, 2.5, 0.7, 8.5, "var(--muted)", false, "left", "top", 1.3);
    });
  mz += T(`Faturas com vencimento no dia ${num(meta.vencimentoDia ?? 10)} de cada mês, a partir do mês seguinte ao go-live. ` +
          "Recorrente reajustado anualmente pelo IPCA. Sem fidelidade: o contrato pode ser encerrado com aviso de 90 dias.",
          0.5, 5.08, 9.0, 0.3, 8, "var(--muted)", false, "left", "top", 1.3, "font-style:italic;");
  sl.push({ id: "recorrente", cls: "", html: mz });

  // ---- implantação (valores)
  let st = HEAD("Investimento: implantação", "Investimento",
    escolha ? "O valor da implantação depende do formato de onboarding que o grupo escolher."
            : `Valor fechado da implantação das ${num(e.lojas)} lojas, parcelado conforme o avanço do projeto.`,
    assets.logo);
  const lista: Modelo[] = ativo ? [ativo] : ["consultivo", "online"];
  lista.forEach((k, i) => {
    const m = M[k], x = lista.length === 1 ? 2.33 : 0.5 + i * 4.6, w = lista.length === 1 ? 5.34 : 4.4;
    st += C(x, 1.55, w, 2.75, "var(--surface)", i === 0 ? "var(--accent)" : "var(--border)", 0.09) +
      A(x, 1.55, w, 0.06, "", `background:${i === 0 ? "var(--accent)" : "var(--ink)"};`) +
      T(m.nome, x + 0.26, 1.76, 2.4, 0.34, 16, "var(--ink)", true) +
      T(m.setup > 0 ? brl(m.setup) : "Isento", x + 0.26, 2.14, 2.9, 0.48, 27, "var(--ink)", true) +
      T(m.setup > 0 ? "de implantação" : "nesta proposta", x + 3.0, 2.26, w - 3.2, 0.28, 9.5, "var(--muted)", false, "left", "middle") +
      LINE(x + 0.26, 2.72, w - 0.52);
    m.parcelas.forEach(([rot, val], j) => {
      const y = 2.84 + j * 0.34;
      st += T(rot, x + 0.26, y, w - 1.6, 0.32, 9, "var(--muted)", false, "left", "middle") +
            T(brl(val), x + w - 1.4, y, 1.14, 0.32, 9.3, "var(--ink)", true, "right", "middle");
    });
    st += T(m.nota, x + 0.26, 3.9, w - 0.52, 0.34, 8.5, "var(--muted)", false, "left", "top", 1.3, "font-style:italic;");
  });
  st += C(0.5, 4.46, 9.0, 0.84, "var(--surface-2)", "var(--border)") +
    T(`O recorrente da plataforma — ${brl(e.recorrenteLoja)} por loja em operação, mais ${feePct} ` +
      "sobre o valor líquido recebido — é o mesmo nos dois formatos e começa quando cada loja entra em operação.",
      0.74, 4.46, 8.5, 0.84, 9.3, "var(--ink)", false, "left", "middle", 1.35);
  sl.push({ id: "implantacao", cls: "", html: st });

  // ---- resumo financeiro
  let rs = HEAD("Resumo financeiro", "Anexo do contrato",
    "Consolidação dos valores desta proposta, para referência no instrumento contratual.", assets.logo);
  const linhas: string[][] = [
    ["Recorrente da plataforma", `Por loja em operação — pacote ${esc(meta.pacote)}`, brlCent(e.recorrenteLoja), "Mensal, a partir da ativação de cada loja"],
    ["Taxa de sucesso", "Sobre o valor líquido recebido dos clientes", feePct, "A cada liquidação, retida no repasse"],
  ];
  if (ativo) linhas.push([`Implantação ${M[ativo].nome.toLowerCase()}`, `${M[ativo].modo.split(",")[0]}, ${M[ativo].prazo}`,
    M[ativo].setup > 0 ? brlCent(M[ativo].setup) : "Isento",
    M[ativo].parcelas.length ? `Em ${M[ativo].parcelas.length} parcelas, conforme o cronograma` : "—"]);
  else {
    linhas.push(["Implantação consultiva", `Opção A — presencial, ${M.consultivo.prazo}`,
      M.consultivo.setup > 0 ? brlCent(M.consultivo.setup) : "Isento", "Em 3 parcelas, conforme o cronograma"]);
    linhas.push(["Implantação online", `Opção B — remota, ${M.online.prazo}`,
      M.online.setup > 0 ? brlCent(M.online.setup) : "Isento", "Em 2 parcelas, conforme o cronograma"]);
  }
  linhas.push(["Recorrente com o grupo completo", `${num(e.lojas)} lojas × ${brlCent(e.recorrenteLoja)}`,
               brlCent(e.lojas * e.recorrenteLoja), "Após a ativação de todas as lojas"]);
  const cols = [2.3, 2.9, 1.3, 2.5], heads = ["Item", "Base de cálculo", "Valor", "Quando incide"];
  rs += A(0.5, 1.5, 9.0, 0.32, "", `background:var(--ink);border-radius:${U(0.05)} ${U(0.05)} 0 0;`);
  let cx = 0.5;
  heads.forEach((h, j) => {
    rs += T(h, cx + 0.1, 1.5, cols[j] - 0.16, 0.32, 8.5, "#fff", true, j === 2 ? "right" : "left", "middle");
    cx += cols[j];
  });
  let yy = 1.82;
  linhas.forEach((l, i) => {
    const h = 0.42, dest = i === linhas.length - 1;
    rs += A(0.5, yy, 9.0, h, "", `background:${dest ? "var(--accent-soft)" : (i % 2 ? "var(--surface)" : "var(--surface-2)")};`);
    let x2 = 0.5;
    l.forEach((v, j) => {
      rs += T(v, x2 + 0.1, yy, cols[j] - 0.16, h, 8.5, "var(--ink)", j === 0 || j === 2, j === 2 ? "right" : "left", "middle", 1.3);
      x2 += cols[j];
    });
    rs += LINE(0.5, yy + h, 9.0);
    yy += h;
  });
  // Tarifas da instituição de pagamento, como na proposta escrita.
  const yT = yy + 0.2;
  rs += T("Tarifas da instituição de pagamento (Asaas)", 0.5, yT, 4.3, 0.24, 10, "var(--ink)", true) +
        T("Descontadas do valor pago pelo cliente final antes do repasse. Não compõem o valor da Veilig.",
          4.9, yT, 4.6, 0.24, 8.2, "var(--muted)", false, "left", "middle");
  TARIFAS.forEach(([meio, tarifa], i) => {
    const x = 0.5 + (i % 2) * 4.6, y = yT + 0.3 + Math.floor(i / 2) * 0.3;
    rs += A(x, y, 4.4, 0.28, "", i < 2 ? "background:var(--surface-2);" : "") +
          T(meio, x + 0.1, y, 1.6, 0.28, 8.3, "var(--ink)", false, "left", "middle") +
          T(tarifa, x + 1.7, y, 2.6, 0.28, 8.3, "var(--muted)", false, "right", "middle");
  });
  rs += T(ativo ? `Formato de onboarding desta proposta: ${M[ativo].nome}.`
                : "O formato de onboarding é escolhido no aceite desta proposta.",
          0.5, 5.12, 9.0, 0.26, 7.8, "var(--muted)", false, "left", "top", 1.3, "font-style:italic;");
  sl.push({ id: "resumo", cls: "", html: rs });

  // ---- condições
  let cd = HEAD("Condições comerciais", "Anexo do contrato",
    "Pontos que acompanham esta proposta e integram o contrato de prestação de serviços.", assets.logo);
  ([["Vigência", "Contrato mensal, sem prazo de fidelidade. Pode ser encerrado por qualquer das partes com aviso de 90 dias."],
    ["Reajuste", "O recorrente é reajustado anualmente pelo IPCA, a contar da assinatura."],
    ["Titularidade da cobrança", "A cobrança é emitida pela plataforma e dividida na liquidação, com repasse automático à conta da concessionária."],
    ["Operação fiscal", "A concessionária emite a nota do plano ao consumidor. A Veilig emite nota da taxa de sucesso e do recorrente."],
    ["Natureza do serviço", "A Veilig opera a plataforma e a intermediação de pagamentos. A manutenção é prestada pela concessionária."],
    ["Validade da proposta", `Esta proposta é válida até ${esc(meta.validaAte)}.`]] as [string, string][])
    .forEach(([t, d], i) => {
      const c = i % 2, lin = Math.floor(i / 2);
      const x = 0.5 + c * 4.6, y = 1.5 + lin * 1.2;
      cd += C(x, y, 4.4, 1.08, lin === 2 ? "var(--surface-2)" : "var(--surface)") +
            T(t, x + 0.22, y + 0.14, 3.9, 0.26, 11, "var(--ink)", true) +
            T(d, x + 0.22, y + 0.44, 3.98, 0.6, 8.5, "var(--muted)", false, "left", "top", 1.3);
    });
  cd += T("Em caso de divergência entre esta proposta e o contrato, prevalece o contrato. " +
          "As condições estão sujeitas à assinatura do contrato de licença de uso da plataforma Veilig.",
          0.5, 5.08, 9.0, 0.3, 8, "var(--muted)", false, "left", "top", 1.3, "font-style:italic;");
  sl.push({ id: "condicoes", cls: "", html: cd });

  sl.push({ id: "roi", cls: "", html: slideRoi(e, p, r, assets) });

  // ---- observações digitadas na proposta
  const obs = (meta.observacoes ?? "").trim();
  if (obs) {
    sl.push({ id: "observacoes", cls: "", html:
      HEAD("Observações", "Desta proposta", undefined, assets.logo) +
      C(0.5, 1.3, 9.0, 3.6, "var(--surface-2)") +
      A(0.8, 1.6, 8.4, "auto", `<span>${esc(obs).replace(/\n/g, "<br>")}</span>`,
        `font-size:${PT(11)};color:var(--ink);line-height:1.5;`) });
  }

  // ---- próximos passos
  const passos: [string, string][] = [
    ["Aceite desta proposta", "Pelo botão abaixo da apresentação ou respondendo ao e-mail."],
    escolha
      ? ["Escolha do formato de onboarding", "Consultivo, com a Veilig na operação, ou Online, mais rápido e remoto. A escolha é feita no aceite."]
      : ["Assinatura do contrato", "Esta proposta passa a integrar o contrato como Anexo I — Condições Comerciais."],
    ["Conta de recebimento e kickoff", "Abertura da conta em nome da concessionária e indicação do ponto focal."],
  ];
  let ac = A(7.8, -1.0, 3.4, 3.4, "", "background:var(--ink-deep);border-radius:50%;") +
    A(0.5, 0.48, 0.5, 0.5, `<img src="${assets.logo}" alt="">`, "display:flex;") +
    T("A decisão é de vocês", 0.5, 1.14, 6.4, 0.5, 26, "#fff", true) +
    T("Aceita a proposta, o kickoff acontece em até 15 dias.", 0.5, 1.7, 6.4, 0.3, 11, "var(--soft)");
  passos.forEach(([t, d], i) => {
    const y = 2.2 + i * 0.84;
    ac += A(0.5, y, 5.9, 0.72, "", `background:var(--ink-deep);border:${U(0.0075)} solid #2c5a64;border-radius:${U(0.07)};`) +
      NUM(i + 1, 0.7, y + 0.19) +
      T(t, 1.16, y + 0.08, 5.0, 0.28, 10.5, "#fff", true) +
      T(d, 1.16, y + 0.37, 5.1, 0.3, 8.5, "var(--soft)", false, "left", "top", 1.25);
  });
  ac += `<div class="a hit" tabindex="0" role="button" id="btn-aceitar" ` +
    `style="left:${U(6.65)};top:${U(2.2)};width:${U(2.85)};height:${U(2.2)};background:var(--accent-bright);` +
    `border-radius:${U(0.08)};display:flex;flex-direction:column;justify-content:center;padding:0 ${U(0.25)};">` +
    `<span style="font-size:${PT(16)};font-weight:700;color:var(--ink);line-height:1.25">Aceitar<br>proposta</span>` +
    `<span style="font-size:${PT(9)};color:var(--ink);line-height:1.3;margin-top:${U(0.12)}">${
      ativo ? `Onboarding ${M[ativo].nome.toLowerCase()}` : "Escolha o formato no aceite"}</span></div>` +
    T(`Veilig  ·  proposta ${esc(meta.numero)}  ·  ${esc(meta.responsavel)}  ·  válida até ${esc(meta.validaAte)}`,
      0.5, 4.95, 6.5, 0.25, 8.5, "#7fa6b0");
  sl.push({ id: "aceite", cls: "dark", html: ac });

  const slidesHtml = sl.map(s =>
    `<section class="slide ${s.cls}" data-id="${s.id}">${s.html}</section>`).join("");

  const barra = meta.previa ? `<div class="demo"><div class="in">
  <span class="demo-tag">Pré-visualização</span>
  <span class="demo-label">Onboarding desta proposta: <b>${escolha ? "o cliente escolhe no aceite" : M[ativo as Modelo].nome}</b></span>
</div></div>` : "";

  return {
    html: `${ESTILO}${barra}<div class="palco">${slidesHtml}</div>
<div class="nav">
  <button type="button" id="ant">‹ Anterior</button>
  <button type="button" id="prox">Próximo ›</button>
  <button type="button" id="baixar">Baixar PDF</button>
  <span class="conta" id="conta"></span>
  <div class="pontos" id="pontos"></div>
</div>`,
    script: SCRIPT,
  };
}

/** Página HTML completa e independente — usada fora do Next (testes, conferência). */
export function paginaProposta(e: EntradaProposta, meta: MetaProposta, assets: AssetsProposta): string {
  const { html, script } = renderProposta(e, meta, assets);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Proposta Veilig — ${esc(e.grupo)}</title></head><body>${html}` +
    `<script>${script}</script></body></html>`;
}

// ----------------------------------------------------------- estilo e script
const ESTILO = `<style>
:root{--page:#dfe8ea;--surface:#fff;--surface-2:#f4f7f8;--ink:#173b43;--ink-deep:#0e272d;
--body:#173b43;--muted:#5f7b82;--soft:#a9cdd6;--accent:#2a9cbb;--accent-bright:#4ec3e0;
--accent-soft:#e6f6fa;--border:#dce6e9;--ok:#1f8a5b;--f:"Noto Sans",system-ui,-apple-system,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--page);font-family:var(--f);color:var(--body);-webkit-font-smoothing:antialiased}
.palco{max-width:1180px;margin:0 auto;padding:18px max(16px,env(safe-area-inset-left,0px)) 0}
.demo{background:var(--ink-deep);color:#cfe6ec}
.demo .in{max-width:1180px;margin:0 auto;display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:11px max(16px,env(safe-area-inset-left,0px))}
.demo-tag{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--accent-bright);
border:1px solid rgba(78,195,224,.4);border-radius:99px;padding:4px 10px}
.demo-label{font-size:12.5px;color:#9dc2cc}
.slide{position:relative;container-type:inline-size;aspect-ratio:16/9;width:100%;background:var(--surface);
border-radius:10px;overflow:hidden;box-shadow:0 1px 2px rgba(14,39,45,.1),0 18px 44px rgba(14,39,45,.16)}
.slide.dark{background:var(--ink)}
.slide[hidden]{display:none!important}
.a{position:absolute;margin:0}.a>span{display:block;width:100%;line-height:inherit}
.a img{width:100%;height:100%;object-fit:contain;display:block}
.nav{max-width:1180px;margin:0 auto;display:flex;align-items:center;gap:14px;flex-wrap:wrap;
padding:14px max(16px,env(safe-area-inset-left,0px)) 22px}
.nav button{font:inherit;font-size:13.5px;font-weight:600;border:1px solid var(--border);background:var(--surface);
color:var(--ink);border-radius:8px;padding:9px 15px;cursor:pointer}
.nav button:disabled{opacity:.4;cursor:default}
.nav button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
#baixar{background:var(--ink);color:#fff;border-color:var(--ink)}
.conta{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}
.pontos{display:flex;gap:5px;flex-wrap:wrap;margin-left:auto}
.pontos i{width:7px;height:7px;border-radius:50%;background:#b9ccd1;display:block;cursor:pointer}
.pontos i.on{background:var(--accent);transform:scale(1.3)}
@media (max-width:640px){.pontos{display:none}}
.hit{cursor:pointer}.hit:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
@media print{
.demo,.nav{display:none!important}
.palco{max-width:none;margin:0;padding:0}
.slide{width:10in;height:5.625in;border-radius:0;box-shadow:none;break-after:page;page-break-after:always}
.slide:last-of-type{break-after:auto;page-break-after:auto}
.slide[hidden]{display:block!important}
.hit[data-escolher]{display:none!important}
#btn-aceitar{background:var(--accent-soft)!important}
#btn-aceitar span{color:var(--ink)!important}
body{background:#fff}}
@page{size:10in 5.625in;margin:0}
</style>`;

const SCRIPT = `
const slides=[...document.querySelectorAll('.slide')];let idx=0;
const conta=document.getElementById('conta'),pontos=document.getElementById('pontos');
function mostrar(i){idx=Math.max(0,Math.min(i,slides.length-1));
slides.forEach((s,j)=>s.hidden=j!==idx);
conta.textContent=(idx+1)+' / '+slides.length;
document.getElementById('ant').disabled=idx===0;
document.getElementById('prox').disabled=idx===slides.length-1;
pontos.innerHTML=slides.map((_,j)=>'<i class="'+(j===idx?'on':'')+'" data-i="'+j+'"></i>').join('');}
document.getElementById('ant').onclick=()=>mostrar(idx-1);
document.getElementById('prox').onclick=()=>mostrar(idx+1);
document.getElementById('baixar').onclick=()=>{slides.forEach(s=>s.hidden=false);
setTimeout(()=>{window.print();setTimeout(()=>mostrar(idx),300)},60)};
pontos.addEventListener('click',e=>{const i=e.target.dataset.i;if(i!==undefined)mostrar(+i)});
addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select'))return;
if(e.key==='ArrowRight'){e.preventDefault();mostrar(idx+1)}
if(e.key==='ArrowLeft'){e.preventDefault();mostrar(idx-1)}});
addEventListener('beforeprint',()=>slides.forEach(s=>s.hidden=false));
addEventListener('afterprint',()=>mostrar(idx));
/* Os botões não gravam nada: levam para o formulário de aceite, que já registra a escolha. */
function irParaAceite(modelo){
dispatchEvent(new CustomEvent('veilig:aceitar',{detail:{onboarding:modelo||null}}));}
function acionar(alvo){const b=alvo.closest('[data-escolher]');
if(b){irParaAceite(b.dataset.escolher);return true}
if(alvo.closest('#btn-aceitar')){irParaAceite(null);return true}
return false}
const palco=document.querySelector('.palco');
palco.addEventListener('click',e=>{acionar(e.target)});
palco.addEventListener('keydown',e=>{
if(e.key==='Enter'||e.key===' '){if(acionar(e.target))e.preventDefault()}});
mostrar(0);`;
