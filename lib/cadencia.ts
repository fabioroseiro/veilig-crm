import "server-only";
import { randomUUID } from "crypto";
import { simpleParser } from "mailparser";
import { q, q1 } from "./db";
import { PAUSA_DIAS, PLANO_FRIO, type Passo } from "./plano";
import { camposFaltando, montarEmail, preencherTexto, urlApp } from "./mensagem";
import { caixa, envioReal, transportador } from "./correio";
import { hojeISO, porte as calcPorte, somaDias } from "./regras";

import type { Remetente } from "./mensagem";

async function cfg() {
  const linhas = await q<{ chave: string; valor: unknown }>("SELECT chave, valor FROM config WHERE chave IN ('envio_ativo','limite_diario','remetente')");
  const m = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
  return {
    ativo: m.envio_ativo === true,
    limite: Number(m.limite_diario ?? 15),
    remetente: (m.remetente as Remetente) ?? { email: "natalia@vendas.veilig.com.br", nome: "Natália Artale" },
  };
}

/** Hora e dia da semana em São Paulo. */
function agoraSP() {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false, weekday: "short" }).formatToParts(new Date());
  const hora = Number(p.find((x) => x.type === "hour")?.value ?? 0) % 24;
  const dia = p.find((x) => x.type === "weekday")?.value ?? "";
  return { hora, util: !["Sat", "Sun"].includes(dia) };
}
export const janelaDeEnvio = () => { const a = agoraSP(); return a.util && a.hora >= 8 && a.hora < 18; };

async function atividade(grupoId: string, tipo: string, resumo: string, detalhe?: string | null) {
  await q("INSERT INTO atividade (grupo_id, tipo, resumo, detalhe) VALUES ($1,$2,$3,$4)", [grupoId, tipo, resumo, detalhe ?? null]);
}

// ---------------- Início e parada ----------------

type Elegivel = { id: string; num_lojas: number };

/** Inicia a cadência Frio. Só entra quem está elegível agora (confere de novo no servidor). */
export async function iniciar(grupoIds: string[], usuarioId: string) {
  if (grupoIds.length === 0) return 0;
  const ok = await q<Elegivel>(
    `SELECT g.id, g.num_lojas FROM grupo g
       JOIN contato c ON c.grupo_id = g.id AND c.principal AND c.email_status = 'ok'
      WHERE g.id = ANY($1) AND g.situacao = 'ativo' AND g.temperatura = 'frio' AND NOT g.estrategico AND g.etapa <= 2
        AND NOT EXISTS (SELECT 1 FROM cadencia k WHERE k.grupo_id = g.id AND k.status IN ('ativa','pausa','concluida'))`, [grupoIds]);
  const hoje = hojeISO();
  for (const g of ok) {
    await q(`INSERT INTO cadencia (grupo_id, porte, proximo_em, iniciada_por) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [g.id, calcPorte(g.num_lojas), hoje, usuarioId]);
    await atividade(g.id, "sistema", `Cadência Frio iniciada (porte ${calcPorte(g.num_lojas)})`);
  }
  return ok.length;
}

export async function parar(grupoId: string, motivo: string) {
  const r = await q<{ id: string }>("UPDATE cadencia SET status='parada', motivo=$2, atualizado_em=now() WHERE grupo_id=$1 AND status IN ('ativa','pausa') RETURNING id", [grupoId, motivo]);
  if (r.length) {
    await q("UPDATE envio SET status='cancelado', erro=$2 WHERE cadencia_id = ANY($1) AND status='fila'", [r.map((x) => x.id), motivo]);
    await atividade(grupoId, "sistema", `Cadência parada: ${motivo}`);
  }
  return r.length > 0;
}

// ---------------- Avanço dos toques ----------------

type Cad = { id: string; grupo_id: string; ciclo: number; porte: "A" | "B" | "C"; passo: number;
  nome: string; origem: string | null; segmento: string | null; temperatura: string; situacao: string; estrategico: boolean; etapa: number;
  responsavel_id: string | null; contato_id: string | null; contato_nome: string | null; email: string | null; email_status: string | null; whatsapp: string | null };

async function modelo(chave: string) {
  return q1<{ assunto: string; corpo: string; aprovado: boolean }>("SELECT assunto, corpo, aprovado FROM modelo_email WHERE chave=$1", [chave]);
}

async function tarefa(c: Cad, tipo: string, titulo: string, texto: string | null) {
  await q(`INSERT INTO tarefa (grupo_id, tipo, titulo, texto, vence_em, usuario_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [c.grupo_id, tipo, titulo, texto, hojeISO(), c.responsavel_id]);
}

/** Executa o toque atual de uma cadência. Devolve false se precisa esperar (ex.: modelo não aprovado). */
async function executar(c: Cad, p: Passo): Promise<boolean> {
  const dados = { nome: c.contato_nome, grupo: c.nome, origem: c.origem, segmento: c.segmento };
  const emailOk = c.email && c.email_status === "ok";
  const prefixo = `Toque ${p.toque} da cadência Frio`;

  if (p.canal === "ligacao" || p.canal === "whatsapp") {
    await tarefa(c, p.canal, `${prefixo}: ${p.titulo?.replace(/^(Ligação|WhatsApp): /, "")}`, null);
    return true;
  }
  let chave = p.chave!;
  if (chave === "frio_1" && c.ciclo === 2) chave = "frio_1_ciclo2";
  const m = await modelo(chave);
  if (!m) { await atividade(c.grupo_id, "sistema", `${prefixo}: modelo ${chave} não encontrado`); return true; }
  if (!m.aprovado) {
    await q("UPDATE cadencia SET motivo=$2 WHERE id=$1", [c.id, `Aguardando aprovação do modelo "${chave}"`]);
    return false;
  }
  const corpo = preencherTexto(m.corpo, dados);

  if (!emailOk) {
    if (p.canal === "email_ou_whatsapp") await tarefa(c, "whatsapp", `${prefixo}: mensagem por WhatsApp (sem e-mail válido)`, corpo);
    else await atividade(c.grupo_id, "sistema", `${prefixo}: e-mail não enviado (contato sem e-mail válido)`);
    return true;
  }

  let assunto = preencherTexto(m.assunto, dados);
  let emResposta: string | null = null;
  if (p.responde) {
    const ant = await q1<{ assunto: string; message_id: string | null }>(
      "SELECT assunto, message_id FROM envio WHERE cadencia_id=$1 AND chave=$2 AND status IN ('enviado','simulado') ORDER BY enviado_em DESC LIMIT 1", [c.id, p.responde === "frio_1" && c.ciclo === 2 ? "frio_1_ciclo2" : p.responde]);
    if (ant) { assunto = ant.assunto.startsWith("Re: ") ? ant.assunto : `Re: ${ant.assunto}`; emResposta = ant.message_id; }
    else { const base = await modelo(p.responde); assunto = preencherTexto(base?.assunto ?? assunto, dados); }
  }
  const faltando = camposFaltando(assunto + corpo);
  if (faltando.length) {
    await atividade(c.grupo_id, "sistema", `${prefixo}: e-mail não enviado, campos sem preencher ${faltando.join(", ")}`);
    return true;
  }
  await q(`INSERT INTO envio (cadencia_id, grupo_id, contato_id, chave, toque, para, assunto, corpo, em_resposta_a) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [c.id, c.grupo_id, c.contato_id, chave, p.toque, c.email, assunto, corpo, emResposta]);
  return true;
}

export async function processarPassos() {
  const hoje = hojeISO();
  // Retoma as pausas vencidas: segundo ciclo (o primeiro já passou) ou arquivo.
  const pausas = await q<{ id: string; grupo_id: string; ciclo: number; ok: boolean }>(
    `SELECT k.id, k.grupo_id, k.ciclo, (g.situacao='ativo' AND g.temperatura='frio' AND NOT g.estrategico) AS ok
       FROM cadencia k JOIN grupo g ON g.id = k.grupo_id WHERE k.status='pausa' AND k.retomar_em <= $1`, [hoje]);
  for (const k of pausas) {
    if (!k.ok) { await q("UPDATE cadencia SET status='parada', motivo='Lead mudou de situação durante a pausa' WHERE id=$1", [k.id]); continue; }
    await q("UPDATE cadencia SET status='ativa', ciclo=2, passo=0, proximo_em=$2, retomar_em=NULL, motivo=NULL, atualizado_em=now() WHERE id=$1", [k.id, hoje]);
    await atividade(k.grupo_id, "sistema", "Cadência Frio retomada: segundo ciclo");
  }

  const cads = await q<Cad>(
    `SELECT k.id, k.grupo_id, k.ciclo, k.porte, k.passo, g.nome, g.origem, g.segmento, g.temperatura, g.situacao, g.estrategico, g.etapa,
            g.responsavel_id, c.id AS contato_id, c.nome AS contato_nome, c.email, c.email_status, c.whatsapp
       FROM cadencia k JOIN grupo g ON g.id = k.grupo_id
       LEFT JOIN contato c ON c.grupo_id = g.id AND c.principal
      WHERE k.status = 'ativa' AND k.proximo_em <= $1
      ORDER BY k.proximo_em, k.criado_em LIMIT 150`, [hoje]);

  let feitos = 0;
  for (const c of cads) {
    // O lead saiu do perfil da cadência (respondeu, avançou, virou estratégico): para.
    if (c.situacao !== "ativo" || c.temperatura !== "frio" || c.estrategico || c.etapa > 2) {
      await parar(c.grupo_id, c.estrategico ? "marcado como Estratégico" : c.situacao !== "ativo" ? `lead ${c.situacao}` : c.etapa > 2 ? "lead avançou no funil" : "temperatura mudou");
      continue;
    }
    const plano = PLANO_FRIO[c.porte];
    const p = plano[c.passo];
    if (!p) { await q("UPDATE cadencia SET status='concluida' WHERE id=$1", [c.id]); continue; }
    if (!(await executar(c, p))) continue;
    feitos++;
    const prox = plano[c.passo + 1];
    if (prox) {
      await q("UPDATE cadencia SET passo=passo+1, proximo_em=$2, motivo=NULL, atualizado_em=now() WHERE id=$1", [c.id, somaDias(hoje, prox.dia - p.dia)]);
    } else if (c.ciclo === 1) {
      const retomar = somaDias(hoje, PAUSA_DIAS[c.porte]);
      await q("UPDATE cadencia SET status='pausa', passo=passo+1, proximo_em=NULL, retomar_em=$2, atualizado_em=now() WHERE id=$1", [c.id, retomar]);
      await atividade(c.grupo_id, "sistema", `Primeiro ciclo da cadência Frio concluído. Retoma em ${retomar.split("-").reverse().join("/")}`);
    } else {
      await q("UPDATE cadencia SET status='concluida', passo=passo+1, proximo_em=NULL, atualizado_em=now() WHERE id=$1", [c.id]);
      await q("UPDATE grupo SET situacao='perdido', perdido_motivo='Arquivado: dois ciclos da cadência Frio sem resposta', atualizado_em=now() WHERE id=$1", [c.grupo_id]);
      await atividade(c.grupo_id, "sistema", "Arquivado: dois ciclos da cadência Frio sem resposta");
    }
  }
  return { pausasRetomadas: pausas.length, toques: feitos };
}

// ---------------- Envio ----------------

const POR_RODADA = 3; // espaça os envios ao longo do dia, como uma pessoa faria

export async function enviarFila(forcarHorario = false) {
  const c = await cfg();
  if (!forcarHorario && !janelaDeEnvio()) return { enviados: 0, motivo: "fora do horário comercial" };
  const hoje = hojeISO();
  const feitos = await q1<{ n: string }>(
    "SELECT count(*) AS n FROM envio WHERE status IN ('enviado','simulado') AND (enviado_em AT TIME ZONE 'America/Sao_Paulo')::date = $1", [hoje]);
  const restante = Math.max(0, c.limite - Number(feitos?.n ?? 0));
  if (restante === 0) return { enviados: 0, motivo: "limite diário atingido" };

  const fila = await q<{ id: string; grupo_id: string; contato_id: string | null; para: string; assunto: string; corpo: string; em_resposta_a: string | null;
    cad_status: string | null; email_status: string | null }>(
    `SELECT e.id, e.grupo_id, e.contato_id, e.para, e.assunto, e.corpo, e.em_resposta_a, k.status AS cad_status, ct.email_status
       FROM envio e LEFT JOIN cadencia k ON k.id = e.cadencia_id LEFT JOIN contato ct ON ct.id = e.contato_id
      WHERE e.status = 'fila' ORDER BY e.criado_em LIMIT $1`, [Math.min(POR_RODADA, restante)]);

  const t = transportador(c.remetente.email);
  const real = envioReal();
  let enviados = 0;
  for (const e of fila) {
    if (e.cad_status && e.cad_status !== "ativa" || (e.email_status && e.email_status !== "ok")) {
      await q("UPDATE envio SET status='cancelado', erro='Cadência parada ou e-mail inválido antes do envio' WHERE id=$1", [e.id]);
      continue;
    }
    const { texto, html, linkSair } = await montarEmail(e.corpo, c.remetente, e.contato_id);
    const messageId = `<${randomUUID()}@${c.remetente.email.split("@")[1]}>`;
    try {
      await t.sendMail({
        from: { name: c.remetente.nome, address: c.remetente.email },
        to: e.para, subject: e.assunto, text: texto, html, messageId,
        ...(e.em_resposta_a ? { inReplyTo: e.em_resposta_a, references: [e.em_resposta_a] } : {}),
        headers: { "List-Unsubscribe": `<mailto:${c.remetente.email}?subject=descadastrar>, <${linkSair}>` },
      });
      await q("UPDATE envio SET status=$2, message_id=$3, enviado_em=now(), erro=NULL WHERE id=$1", [e.id, real ? "enviado" : "simulado", messageId]);
      await atividade(e.grupo_id, "email", `${real ? "E-mail enviado" : "E-mail simulado (sem senha do Zoho)"}: ${e.assunto}`, e.corpo);
      enviados++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await q("UPDATE envio SET status='erro', erro=$2 WHERE id=$1", [e.id, msg.slice(0, 500)]);
      console.error("[envio] falhou:", e.para, msg);
      if (/auth|login|credential|535/i.test(msg)) break; // senha errada: não adianta insistir
    }
  }
  return { enviados, real };
}

// ---------------- Leitura das respostas ----------------

const DEVOLUCAO = /mailer-daemon|postmaster|mail delivery subsystem/i;
const ASSUNTO_DEVOLUCAO = /undeliver|delivery status|n[ãa]o entregue|falha na entrega|returned mail|delivery failure|failure notice/i;
const DESCADASTRO = /^\s*(n[ãa]o|nao obrigad|n[ãa]o tenho interesse|pare|parar|remover|remova|descadastr)/i;

export async function lerRespostas() {
  const c = await cfg();
  const cx = caixa(c.remetente.email);
  if (!cx) return { lidas: 0, motivo: "leitura desligada (sem senha do Zoho)" };
  let lidas = 0, respostas = 0, devolvidos = 0, descadastros = 0;
  await cx.connect();
  try {
    const box = await cx.mailboxOpen("INBOX", { readOnly: true });
    const est = await q1<{ uidvalidity: string | null; ultimo_uid: string }>("SELECT uidvalidity, ultimo_uid FROM caixa_estado WHERE caixa=$1", [c.remetente.email]);
    const validade = Number(box.uidValidity);
    // Primeira leitura (ou caixa recriada): começa daqui para frente, sem reprocessar o passado.
    if (!est || Number(est.uidvalidity) !== validade) {
      await q(`INSERT INTO caixa_estado (caixa, uidvalidity, ultimo_uid, lido_em) VALUES ($1,$2,$3,now())
               ON CONFLICT (caixa) DO UPDATE SET uidvalidity=EXCLUDED.uidvalidity, ultimo_uid=EXCLUDED.ultimo_uid, lido_em=now()`,
        [c.remetente.email, validade, Number(box.uidNext) - 1]);
      return { lidas: 0, motivo: "caixa marcada como ponto de partida" };
    }
    let maior = Number(est.ultimo_uid);
    if (Number(box.uidNext) - 1 <= maior) return { lidas: 0 };
    for await (const msg of cx.fetch(`${maior + 1}:*`, { uid: true, envelope: true, source: true }, { uid: true })) {
      if (Number(msg.uid) <= maior) continue;
      maior = Math.max(maior, Number(msg.uid));
      lidas++;
      if (lidas > 60) break;
      const de = (msg.envelope?.from?.[0]?.address || "").toLowerCase();
      const assunto = msg.envelope?.subject || "";
      if (!de || de === c.remetente.email.toLowerCase()) continue;
      const bruto = msg.source ? msg.source.toString("utf8").slice(0, 200000) : "";

      if (DEVOLUCAO.test(de) || ASSUNTO_DEVOLUCAO.test(assunto)) {
        const enderecos = [...new Set((bruto.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []).map((x) => x.toLowerCase()))];
        const env = await q<{ id: string; grupo_id: string; contato_id: string | null; para: string }>(
          `SELECT id, grupo_id, contato_id, para FROM envio WHERE status='enviado' AND lower(para) = ANY($1) AND enviado_em > now() - interval '15 days'`, [enderecos]);
        for (const e of env) {
          await q("UPDATE envio SET status='devolvido' WHERE id=$1", [e.id]);
          if (e.contato_id) await q("UPDATE contato SET email_status='devolvido' WHERE id=$1", [e.contato_id]);
          await atividade(e.grupo_id, "sistema", `E-mail voltou (endereço inválido): ${e.para}. A cadência segue só por WhatsApp e ligação.`);
          devolvidos++;
        }
        continue;
      }

      const contatos = await q<{ id: string; grupo_id: string; nome: string | null; responsavel_id: string | null; situacao: string; temperatura: string }>(
        `SELECT c.id, c.grupo_id, c.nome, g.responsavel_id, g.situacao, g.temperatura FROM contato c JOIN grupo g ON g.id = c.grupo_id WHERE lower(c.email) = $1`, [de]);
      if (contatos.length === 0) continue;
      let texto = "";
      try { const p = await simpleParser(bruto); texto = (p.text || "").split(/\n\s*(Em .{5,120}escreveu:|On .{5,120}wrote:|-----Original|De: )/)[0].trim(); } catch {}
      const trecho = texto.slice(0, 1500);
      const pediuSair = /descadastr/i.test(assunto) || (trecho.length > 0 && trecho.length < 60 && DESCADASTRO.test(trecho));
      for (const ct of contatos) {
        if (pediuSair) {
          await q("UPDATE contato SET email_status='descadastrado' WHERE id=$1", [ct.id]);
          await parar(ct.grupo_id, "pediu para não receber e-mails");
          await atividade(ct.grupo_id, "email", `${ct.nome ?? de} pediu para não receber e-mails`, trecho || assunto);
          descadastros++;
        } else {
          await parar(ct.grupo_id, "o lead respondeu");
          await q("UPDATE grupo SET ultimo_sinal=now(), temperatura = CASE WHEN situacao='ativo' THEN 'quente' ELSE temperatura END, atualizado_em=now() WHERE id=$1", [ct.grupo_id]);
          await atividade(ct.grupo_id, "email", `Respondeu ao e-mail: ${assunto}`, trecho || null);
          if (ct.temperatura !== "quente") await atividade(ct.grupo_id, "temperatura", "Temperatura → Quente (respondeu ao e-mail)");
          await q(`INSERT INTO tarefa (grupo_id, tipo, titulo, texto, vence_em, usuario_id) VALUES ($1,'email',$2,$3,$4,$5)`,
            [ct.grupo_id, `Responder o e-mail de ${ct.nome ?? de}`, trecho || null, hojeISO(), ct.responsavel_id]);
          respostas++;
        }
      }
    }
    await q("UPDATE caixa_estado SET ultimo_uid=$2, lido_em=now() WHERE caixa=$1", [c.remetente.email, maior]);
  } finally {
    await cx.logout().catch(() => {});
  }
  return { lidas, respostas, devolvidos, descadastros };
}

/** Uma rodada completa: respostas primeiro (para não mandar e-mail a quem acabou de responder). */
export async function rodar(opcoes: { forcarHorario?: boolean } = {}) {
  const c = await cfg();
  const r: Record<string, unknown> = { ativo: c.ativo, url: urlApp() };
  try { r.respostas = await lerRespostas(); } catch (e) { r.erroLeitura = e instanceof Error ? e.message : String(e); console.error("[cadencia] leitura:", e); }
  if (!c.ativo) return { ...r, motivo: "envio automático desligado" };
  if (!agoraSP().util && !opcoes.forcarHorario) return { ...r, motivo: "fim de semana" };
  r.passos = await processarPassos();
  r.envio = await enviarFila(opcoes.forcarHorario);
  return r;
}
