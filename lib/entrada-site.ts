import "server-only";
import { q, q1 } from "./db";
import { normalizarCelular, analisarEmail } from "./contatos";
import { parar } from "./cadencia";
import { COMO_CONHECEU, hojeISO, SEGMENTOS } from "./regras";

/** O que o site envia a cada simulação ou contato. */
export type LeadSite = {
  tipo: "simulacao" | "contato";
  nome: string;
  empresa: string;
  whatsapp: string;
  email: string;
  segmento?: string | null;   // motos | leves | pesados | agricolas | outro
  marca?: string | null;
  lojas?: number | null;
  mensagem?: string | null;
  linhas?: [string, string][]; // números da simulação, já formatados, na ordem do e-mail
  destaques?: { rua?: string; mensal?: string } | null;
  origem?: { referrer?: string; utm?: string; landing?: string } | null;
  como_conheceu?: string | null;
};

const txt = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** "JOAO DA SILVA" → "Joao da Silva" (só mexe em nome todo em maiúsculas ou minúsculas). */
function capitalizar(nome: string) {
  if (nome !== nome.toUpperCase() && nome !== nome.toLowerCase()) return nome;
  return nome.toLowerCase().split(/\s+/).map((p, i) =>
    i > 0 && ["da", "de", "do", "das", "dos", "e"].includes(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

/** Valida e limpa o que chegou do site. Devolve null se faltar o essencial. */
export function lerLeadSite(b: Record<string, unknown> | null): LeadSite | null {
  if (!b) return null;
  const tipo = b.tipo === "contato" ? "contato" : b.tipo === "simulacao" ? "simulacao" : null;
  const lead: LeadSite = {
    tipo: tipo!,
    nome: capitalizar(txt(b.nome, 120)),
    empresa: txt(b.empresa, 160),
    whatsapp: txt(b.whatsapp, 30),
    email: txt(b.email, 160).toLowerCase(),
    segmento: txt(b.segmento, 20) || null,
    marca: txt(b.marca, 60) || null,
    lojas: Number.isFinite(Number(b.lojas)) && Number(b.lojas) >= 1 ? Math.min(500, Math.round(Number(b.lojas))) : null,
    mensagem: txt(b.mensagem, 4000) || null,
    linhas: Array.isArray(b.linhas)
      ? (b.linhas as unknown[]).slice(0, 30).filter((l): l is [string, string] => Array.isArray(l) && l.length === 2).map(([k, v]) => [txt(k, 80), txt(v, 80)])
      : [],
    destaques: b.destaques && typeof b.destaques === "object"
      ? { rua: txt((b.destaques as Record<string, unknown>).rua, 40), mensal: txt((b.destaques as Record<string, unknown>).mensal, 40) } : null,
    como_conheceu: COMO_CONHECEU.includes(txt(b.como_conheceu, 60)) ? txt(b.como_conheceu, 60) : null,
    origem: b.origem && typeof b.origem === "object"
      ? { referrer: txt((b.origem as Record<string, unknown>).referrer, 300), utm: txt((b.origem as Record<string, unknown>).utm, 200), landing: txt((b.origem as Record<string, unknown>).landing, 200) } : null,
  };
  if (!tipo || lead.nome.length < 2 || lead.empresa.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email)) return null;
  if (lead.segmento && !(lead.segmento in SEGMENTOS)) lead.segmento = null;
  return lead;
}

/** Nome comparável: sem acento, sem pontuação, sem "grupo"/"ltda", minúsculo. */
const comparavel = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\b(grupo|ltda|s\/?a|me|eireli|concessionaria)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

async function sdrId() {
  const r = await q1<{ id: string }>(
    "SELECT u.id FROM usuario u JOIN config c ON c.chave='sdr_email' WHERE lower(u.email) = lower(c.valor #>> '{}')");
  return r?.id ?? null;
}

async function primeiroNomeRemetente() {
  const r = await q1<{ nome: string | null }>("SELECT valor->>'nome' AS nome FROM config WHERE chave='remetente'");
  return (r?.nome || "Natália").split(" ")[0];
}

/** Mensagem de WhatsApp pronta para o primeiro contato, com os números que o lead viu no site. */
function mensagemWhatsApp(l: LeadSite, remetente: string) {
  const primeiro = l.nome.split(" ")[0];
  const nome = primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
  if (l.tipo === "simulacao") {
    const numeros = l.destaques?.rua && l.destaques?.mensal
      ? ` Pelos dados informados, a ${l.empresa} deixa ${l.destaques.rua} por ano em revisões fora da oficina, e a mensalidade sugerida para o plano ficou em ${l.destaques.mensal}.`
      : "";
    return `Olá, ${nome}! Aqui é a ${remetente}, da Veilig. Recebi a simulação que você fez no nosso site.${numeros} Posso te mostrar como chegamos nesses números e como ficariam os planos para a sua operação? Qual o melhor horário para conversarmos?`;
  }
  return `Olá, ${nome}! Aqui é a ${remetente}, da Veilig. Recebi a sua mensagem pelo nosso site e queria entender melhor o cenário da ${l.empresa}. Qual o melhor horário para conversarmos?`;
}

function detalhe(l: LeadSite) {
  const partes: string[] = [];
  if (l.linhas?.length) partes.push(...l.linhas.map(([k, v]) => `${k}: ${v}`));
  if (l.mensagem) partes.push(`Mensagem: ${l.mensagem}`);
  partes.push(`Contato: ${l.nome} · ${l.whatsapp || "sem WhatsApp"} · ${l.email}`);
  if (l.como_conheceu) partes.push(`Como conheceu a Veilig: ${l.como_conheceu}`);
  const o = l.origem;
  if (o?.utm) partes.push(`Campanha: ${o.utm}`);
  partes.push(`Veio de: ${o?.referrer || "acesso direto"}`);
  if (o?.landing) partes.push(`Primeira página: ${o.landing}`);
  return partes.join("\n");
}

/**
 * Registra no CRM o lead que veio do site: acha o grupo (por e-mail, WhatsApp ou nome)
 * ou cria um novo, para a cadência automática, deixa o lead Morno e cria a tarefa do dia.
 */
export async function receberLeadSite(l: LeadSite) {
  const celular = normalizarCelular(l.whatsapp);
  const email = analisarEmail(l.email);
  const hoje = hojeISO();
  const sdr = await sdrId();
  const oque = l.tipo === "simulacao" ? "Simulação feita no site" : "Mensagem pelo formulário do site";

  // 1) Acha o contato ou o grupo.
  let contato = await q1<{ id: string; grupo_id: string; whatsapp: string | null }>(
    "SELECT id, grupo_id, whatsapp FROM contato WHERE lower(email) = $1 ORDER BY criado_em LIMIT 1", [l.email]);
  if (!contato && celular) {
    contato = await q1("SELECT id, grupo_id, whatsapp FROM contato WHERE whatsapp = $1 ORDER BY criado_em LIMIT 1", [celular]);
  }
  let grupoId: string | null = contato?.grupo_id ?? null;
  if (!grupoId) {
    const alvo = comparavel(l.empresa);
    if (alvo) {
      const grupos = await q<{ id: string; nome: string }>("SELECT id, nome FROM grupo");
      grupoId = grupos.find((g) => comparavel(g.nome) === alvo)?.id ?? null;
    }
  }

  let novo = false;
  if (!grupoId) {
    // 2a) Grupo novo.
    const g = await q1<{ id: string }>(
      `INSERT INTO grupo (nome, origem_interna, segmento, marcas, num_lojas, temperatura, responsavel_id, ultimo_sinal, como_conheceu)
       VALUES ($1, $2, $3, $4, $5, 'morno', $6, now(), $7) RETURNING id`,
      [l.empresa, l.tipo === "simulacao" ? "Site (simulador)" : "Site (contato)", l.segmento, l.marca, l.lojas ?? 1, sdr, l.como_conheceu ?? null]);
    grupoId = g!.id;
    novo = true;
    await q("INSERT INTO atividade (grupo_id, tipo, resumo) VALUES ($1, 'sistema', $2)", [grupoId, `Lead criado pelo site (${l.tipo === "simulacao" ? "simulador" : "formulário de contato"})`]);
  } else {
    // 2b) Grupo existente: reativa, esquenta e para a cadência automática.
    const g = (await q1<{ situacao: string; temperatura: string; responsavel_id: string | null; segmento: string | null; marcas: string | null }>(
      "SELECT situacao, temperatura, responsavel_id, segmento, marcas FROM grupo WHERE id=$1", [grupoId]))!;
    if (g.situacao !== "ativo") {
      await q("UPDATE grupo SET situacao='ativo', perdido_motivo=NULL, pausado_ate=NULL WHERE id=$1", [grupoId]);
      await q("INSERT INTO atividade (grupo_id, tipo, resumo) VALUES ($1, 'sistema', $2)", [grupoId, `Lead reativado: voltou pelo site (estava ${g.situacao})`]);
    }
    if (g.temperatura === "frio" || g.temperatura === "oscilante") {
      await q("UPDATE grupo SET temperatura='morno' WHERE id=$1", [grupoId]);
      await q("INSERT INTO atividade (grupo_id, tipo, resumo) VALUES ($1, 'temperatura', $2)", [grupoId, `Temperatura ${g.temperatura === "frio" ? "Frio" : "Oscilante"} → Morno (veio pelo site)`]);
    }
    await q(`UPDATE grupo SET ultimo_sinal=now(), atualizado_em=now(),
               responsavel_id = COALESCE(responsavel_id, $2), segmento = COALESCE(segmento, $3), marcas = COALESCE(marcas, $4),
               como_conheceu = COALESCE(como_conheceu, $5)
             WHERE id=$1`, [grupoId, sdr, l.segmento, l.marca, l.como_conheceu ?? null]);
    await parar(grupoId, "o lead entrou em contato pelo site");
  }

  // 3) Contato: atualiza o existente ou cria um novo como principal (é quem está engajado).
  if (contato) {
    if (!contato.whatsapp && celular) await q("UPDATE contato SET whatsapp=$2 WHERE id=$1", [contato.id, celular]);
    await q("UPDATE contato SET principal = (id = $2) WHERE grupo_id=$1", [grupoId, contato.id]);
  } else {
    const c = await q1<{ id: string }>(
      `INSERT INTO contato (grupo_id, nome, email, email_status, email_sugestao, whatsapp, telefone, principal)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING id`,
      [grupoId, l.nome, email.email, email.status, email.sugestao ?? null, celular, l.whatsapp || null]);
    await q("UPDATE contato SET principal = (id = $2) WHERE grupo_id=$1", [grupoId, c!.id]);
  }

  // 4) Histórico com os números e a origem.
  await q("INSERT INTO atividade (grupo_id, tipo, resumo, detalhe) VALUES ($1, 'site', $2, $3)",
    [grupoId, `${oque} por ${l.nome}`, detalhe(l)]);

  // 5) Tarefa do dia (uma só, mesmo que o lead envie mais de uma vez).
  const aberta = await q1<{ id: string }>(
    "SELECT id FROM tarefa WHERE grupo_id=$1 AND feita_em IS NULL AND titulo LIKE 'Lead do site:%' LIMIT 1", [grupoId]);
  const texto = mensagemWhatsApp(l, await primeiroNomeRemetente());
  const titulo = `Lead do site: falar hoje com ${l.nome} (${l.tipo === "simulacao" ? "fez a simulação" : "mandou mensagem"})`;
  if (aberta) {
    await q("UPDATE tarefa SET titulo=$2, texto=$3, vence_em=$4 WHERE id=$1", [aberta.id, titulo, texto, hoje]);
  } else {
    const resp = await q1<{ responsavel_id: string | null }>("SELECT responsavel_id FROM grupo WHERE id=$1", [grupoId]);
    await q(`INSERT INTO tarefa (grupo_id, tipo, titulo, texto, vence_em, usuario_id) VALUES ($1,$2,$3,$4,$5,$6)`,
      [grupoId, celular ? "whatsapp" : "email", titulo, texto, hoje, resp?.responsavel_id ?? sdr]);
  }
  return { grupoId, novo };
}
