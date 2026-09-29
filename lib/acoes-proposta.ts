"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, q1 } from "./db";
import { exigirUsuario } from "./auth";
import { lerConfig } from "./config";
import { aplicarEtapa, closerId } from "./funil";
import { hojeISO, somaDias } from "./regras";
import { envioReal, transportador } from "./correio";
import { urlApp } from "./mensagem";
import {
  novaProposta, propostaPorId, remetenteProposta, tabela, type Proposta,
} from "./proposta";
import { conteudoProposta, dataExtenso } from "./proposta-conteudo";
import { PACOTES_PROPOSTA, OPCOES_ONBOARDING, ONBOARDING, onboardingDe, type Onboarding, type DadosProposta, type Pacote } from "./proposta-tipos";
import { gerarPdfProposta } from "./proposta-pdf";

type Estado = { ok?: string; erro?: string } | null | undefined;
const s = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" ? v.trim() : ""; };
const n = (f: FormData, k: string) => { const v = Number(s(f, k).replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) ? v : NaN; };

async function registrar(grupoId: string, tipo: string, resumo: string, usuarioId: string | null, detalhe?: string | null) {
  await q("INSERT INTO atividade (grupo_id, tipo, resumo, detalhe, usuario_id) VALUES ($1,$2,$3,$4,$5)", [grupoId, tipo, resumo, detalhe ?? null, usuarioId]);
}
const atualizar = (p: { id: string; grupo_id: string }) => {
  revalidatePath(`/grupos/${p.grupo_id}`); revalidatePath(`/grupos/${p.grupo_id}/propostas/${p.id}`); revalidatePath("/hoje"); revalidatePath("/funil");
};
export const linkProposta = async (token: string) => `${urlApp()}/p/${token}`;

export async function criarProposta(grupoId: string) {
  const u = await exigirUsuario();
  const id = await novaProposta(grupoId, u.id);
  redirect(`/grupos/${grupoId}/propostas/${id}`);
}

/** Salva o rascunho. Ao trocar o pacote, recorrente e prazo seguem a tabela (se não tiverem sido mudados à mão). */
export async function salvarProposta(id: string, _: Estado, f: FormData): Promise<Estado> {
  await exigirUsuario();
  const p = await propostaPorId(id);
  if (!p) return { erro: "Proposta não encontrada." };
  if (p.status !== "rascunho") return { erro: "Proposta já enviada. Para mudar, crie uma nova versão." };
  const [t, cfg] = await Promise.all([tabela(), lerConfig()]);
  const pacote = (s(f, "pacote") in PACOTES_PROPOSTA ? s(f, "pacote") : "essencial") as Pacote;
  let recorrente = n(f, "recorrente_loja");
  if (pacote !== p.dados.pacote) {
    const padraoAntigo = cfg.precos[p.dados.pacote] ?? t.recorrente[p.dados.pacote];
    if (recorrente === padraoAntigo) recorrente = cfg.precos[pacote] ?? t.recorrente[pacote];
  }
  const d: DadosProposta = {
    empresa: s(f, "empresa"), contato_nome: s(f, "contato_nome"), contato_cargo: s(f, "contato_cargo"), contato_email: s(f, "contato_email").toLowerCase(),
    marcas: s(f, "marcas"), lojas: Math.round(n(f, "lojas")), vendas_loja: Math.round(n(f, "vendas_loja")), ticket: n(f, "ticket"),
    pacote, recorrente_loja: recorrente, setup_total: n(f, "setup_total"), setup_obs: s(f, "setup_obs"), fee: n(f, "fee"),
    onboarding: (s(f, "onboarding") in OPCOES_ONBOARDING ? s(f, "onboarding") : "online") as Onboarding,
    vencimento_dia: Math.round(n(f, "vencimento_dia")), mostrar_simulacao: f.get("mostrar_simulacao") === "on", observacoes: s(f, "observacoes"),
  };
  const validade = s(f, "validade");
  const erros: string[] = [];
  if (d.empresa.length < 2) erros.push("nome do grupo");
  if (!(d.lojas >= 1)) erros.push("nº de lojas");
  if (!(d.vendas_loja >= 1)) erros.push("entregas por loja");
  if (!(d.ticket >= 1)) erros.push("ticket de revisão");
  if (!(d.recorrente_loja >= 0)) erros.push("recorrente por loja");
  if (!(d.setup_total >= 0)) erros.push("setup");
  if (!(d.fee >= 0 && d.fee <= 100)) erros.push("taxa de sucesso");
  if (!(d.vencimento_dia >= 1 && d.vencimento_dia <= 28)) erros.push("dia de vencimento (1 a 28)");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validade) || validade < hojeISO()) erros.push("validade (data futura)");
  if (d.contato_email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.contato_email)) erros.push("e-mail do contato");
  if (erros.length) return { erro: `Confira: ${erros.join(", ")}.` };
  await q("UPDATE proposta SET dados=$2, validade=$3, atualizado_em=now() WHERE id=$1", [id, d, validade]);
  atualizar(p);
  return { ok: "Proposta salva." };
}

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function htmlEmail(texto: string, link: string, rem: { nome: string; email: string; whatsapp?: string }) {
  const botao = `<a href="${link}" style="display:inline-block;background:#173b43;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">Ver a proposta</a>`;
  // O navegador envia as quebras de linha do formulário como \r\n: normaliza antes de separar os parágrafos.
  const paragrafos = texto.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => {
    // O marcador vira o botão; o texto ao redor dele continua no e-mail.
    const html = p.split("[Link da proposta]").map((t) => escapar(t.trim()).replace(/\n/g, "<br>")).join(`</p><p style="margin:0 0 16px">${botao}</p><p style="margin:0 0 14px">`);
    return `<p style="margin:0 0 14px">${html}</p>`.replace(/<p style="margin:0 0 14px"><\/p>/g, "");
  }).join("");
  const assinatura = [rem.nome, "Veilig · veilig.com.br", ...(rem.whatsapp ? [`WhatsApp ${rem.whatsapp}`] : [])].map(escapar).join("<br>");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body><div lang="pt-BR" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#173b43;max-width:600px">${paragrafos}<p style="margin:18px 0 0;color:#58707a;font-size:14px">${assinatura}</p></div></body></html>`;
}

/** Envia a proposta pela caixa do closer, com o PDF anexo e o link para aceite. */
export async function enviarProposta(id: string, _: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  const p = await propostaPorId(id);
  if (!p) return { erro: "Proposta não encontrada." };
  if (!["rascunho", "enviada", "prazo_pedido"].includes(p.status)) return { erro: "Esta proposta não pode mais ser enviada." };
  if (p.validade < hojeISO()) return { erro: "A validade já passou. Prorrogue antes de enviar." };
  const para = s(f, "para").toLowerCase();
  const cc = s(f, "cc").toLowerCase();
  const assunto = s(f, "assunto");
  const mensagem = s(f, "mensagem").replace(/\r\n?/g, "\n");
  const valido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
  if (!valido(para)) return { erro: "Informe um e-mail válido para o envio." };
  const ccs = cc ? cc.split(/[,;\s]+/).filter(Boolean) : [];
  if (ccs.some((e) => !valido(e))) return { erro: "Confira os e-mails em cópia." };
  if (!assunto || !mensagem.includes("[Link da proposta]")) return { erro: "A mensagem precisa ter assunto e o marcador [Link da proposta]." };

  const rem = await remetenteProposta();
  if (!envioReal(rem.email)) return { erro: `A caixa ${rem.email} ainda não está ligada ao CRM (falta a senha de app do Zoho na Vercel). Baixe o PDF e use "Marquei como enviada".` };
  const link = await linkProposta(p.token);
  const c = conteudoProposta(p.dados, p.numero, hojeISO(), p.validade, rem);
  const pdf = await gerarPdfProposta(c);
  try {
    await transportador(rem.email).sendMail({
      from: { name: rem.nome, address: rem.email },
      to: para, cc: ccs.length ? ccs : undefined, replyTo: rem.email,
      subject: assunto,
      text: `${mensagem.replace("[Link da proposta]", link)}\n\n${rem.nome}\nVeilig · veilig.com.br`,
      html: htmlEmail(mensagem, link, rem),
      attachments: [{ filename: `Proposta Veilig ${p.numero}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
  } catch (e) {
    console.error("[proposta] envio:", e);
    return { erro: `O Zoho recusou o envio: ${e instanceof Error ? e.message : String(e)}` };
  }
  await posEnvio(p, u.id, para + (ccs.length ? ` (cópia: ${ccs.join(", ")})` : ""), mensagem.replace("[Link da proposta]", link));
  return { ok: `Proposta enviada para ${para}.` };
}

/** Para quando a proposta foi enviada fora do CRM (PDF pelo e-mail do Fabio, por exemplo). */
export async function marcarEnviada(id: string, _: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  const p = await propostaPorId(id);
  if (!p || p.status !== "rascunho") return { erro: "Só um rascunho pode ser marcado como enviado." };
  await posEnvio(p, u.id, s(f, "para") || p.dados.contato_email || "fora do CRM", null);
  return { ok: "Marcada como enviada." };
}

async function posEnvio(p: Proposta, usuarioId: string, para: string, mensagem: string | null) {
  const primeira = p.status === "rascunho";
  await q("UPDATE proposta SET status=CASE WHEN status='rascunho' THEN 'enviada' ELSE status END, enviada_em=COALESCE(enviada_em, now()), enviada_para=$2, atualizado_em=now() WHERE id=$1",
    [p.id, para]);
  await registrar(p.grupo_id, "email", `Proposta ${p.numero} ${primeira ? "enviada" : "reenviada"} para ${para}`, usuarioId, mensagem);
  await q("UPDATE grupo SET pacote=$2, num_lojas=$3 WHERE id=$1", [p.grupo_id, p.dados.pacote, p.dados.lojas]);
  await aplicarEtapa(p.grupo_id, 4, usuarioId, true);
  if (primeira) {
    const resp = (await closerId()) ?? usuarioId;
    await q(`INSERT INTO tarefa (grupo_id, tipo, titulo, vence_em, usuario_id) VALUES ($1,'ligacao',$2,$3,$4)`,
      [p.grupo_id, `Acompanhar a proposta ${p.numero}: confirmar recebimento e tirar dúvidas`, somaDias(hojeISO(), 3), resp]);
  }
  atualizar(p);
}

export async function prorrogarProposta(id: string, _: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  const p = await propostaPorId(id);
  if (!p || !["enviada", "prazo_pedido", "rascunho"].includes(p.status)) return { erro: "Esta proposta não pode ser prorrogada." };
  const nova = s(f, "validade");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nova) || nova <= hojeISO()) return { erro: "Informe uma data futura." };
  await q("UPDATE proposta SET validade=$2, status=CASE WHEN status='prazo_pedido' THEN 'enviada' ELSE status END, atualizado_em=now() WHERE id=$1", [id, nova]);
  await q("UPDATE tarefa SET feita_em=now(), resultado='Prazo prorrogado' WHERE grupo_id=$1 AND feita_em IS NULL AND titulo LIKE $2", [p.grupo_id, `Responder o pedido de prazo da proposta ${p.numero}%`]);
  await registrar(p.grupo_id, "sistema", `Validade da proposta ${p.numero} prorrogada até ${dataExtenso(nova)}`, u.id);
  atualizar(p);
  return { ok: `Nova validade: ${dataExtenso(nova)}. O link já mostra a data nova.` };
}

export async function cancelarProposta(id: string) {
  const u = await exigirUsuario();
  const p = await propostaPorId(id);
  if (!p || p.status === "aceita" || p.status === "cancelada") return;
  await q("UPDATE proposta SET status='cancelada', atualizado_em=now() WHERE id=$1", [id]);
  await registrar(p.grupo_id, "sistema", `Proposta ${p.numero} cancelada`, u.id);
  atualizar(p);
}

/** Copia a proposta para um novo rascunho e cancela a anterior (o link antigo deixa de aceitar). */
export async function novaVersao(id: string) {
  const u = await exigirUsuario();
  const p = await propostaPorId(id);
  if (!p) return;
  const nova = await novaProposta(p.grupo_id, u.id);
  const t = await tabela();
  await q("UPDATE proposta SET dados=$2, validade=$3 WHERE id=$1", [nova, p.dados, somaDias(hojeISO(), t.validade_dias)]);
  if (p.status !== "aceita" && p.status !== "cancelada") {
    await q("UPDATE proposta SET status='cancelada', atualizado_em=now() WHERE id=$1", [id]);
    await registrar(p.grupo_id, "sistema", `Proposta ${p.numero} substituída por uma nova versão`, u.id);
  }
  atualizar(p);
  redirect(`/grupos/${p.grupo_id}/propostas/${nova}`);
}

export async function mensagemPadrao(p: Proposta) {
  const primeiro = (p.dados.contato_nome || "").trim().split(/\s+/)[0] || "";
  const nome = primeiro ? primeiro[0].toUpperCase() + primeiro.slice(1).toLowerCase() : "";
  return {
    assunto: `Proposta Veilig — ${p.dados.empresa}`,
    mensagem: `Olá${nome ? `, ${nome}` : ""}!\n\nConforme conversamos, segue a proposta da Veilig para a operação de planos de manutenção da ${p.dados.empresa}. O PDF está anexo e, pelo link abaixo, você pode ver a proposta, aceitar as condições ou pedir mais prazo, se precisar.\n\n[Link da proposta]\n\nA proposta é válida até ${dataExtenso(p.validade)}. Fico à disposição para qualquer dúvida.`,
  };
}

/** Aceite recebido fora do link (resposta por e-mail, WhatsApp ou reunião). */
export async function registrarAceite(id: string, _: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  const p = await propostaPorId(id);
  if (!p || !["enviada", "prazo_pedido"].includes(p.status)) return { erro: "Só uma proposta enviada pode ser marcada como aceita." };
  const nome = s(f, "nome"), cargo = s(f, "cargo"), como = s(f, "como");
  if (nome.length < 3) return { erro: "Informe quem aceitou." };
  await q("UPDATE proposta SET status='aceita', aceita_em=now(), aceite=$2, atualizado_em=now() WHERE id=$1",
    [id, { nome, cargo, email: s(f, "email"), ip: null, registrado_por: u.nome, como, ...formatoEscolhido(p, f) }]);
  const fmt = formatoEscolhido(p, f).onboarding;
  await registrar(p.grupo_id, "email", `Proposta ${p.numero} aceita por ${nome}${cargo ? ` (${cargo})` : ""}${como ? `, por ${como}` : ""}${fmt ? `. Onboarding ${ONBOARDING[fmt].nome}` : ""}`, u.id);
  await q("UPDATE tarefa SET feita_em=now(), resultado='Proposta aceita' WHERE grupo_id=$1 AND feita_em IS NULL AND titulo LIKE $2", [p.grupo_id, `Acompanhar a proposta ${p.numero}%`]);
  await aplicarEtapa(p.grupo_id, 6, u.id, true);
  await q(`INSERT INTO tarefa (grupo_id, tipo, titulo, vence_em, usuario_id) VALUES ($1,'email',$2,$3,$4)`,
    [p.grupo_id, `Enviar o contrato: proposta ${p.numero} aceita`, hojeISO(), (await closerId()) ?? u.id]);
  atualizar(p);
  return { ok: "Aceite registrado." };
}

/** Quando a proposta oferecia os dois formatos, guarda o que o cliente escolheu. */
function formatoEscolhido(p: Proposta, f: FormData): { onboarding?: "consultivo" | "online" } {
  if (onboardingDe(p.dados) !== "ambos") return {};
  const v = f.get("onboarding");
  return v === "consultivo" || v === "online" ? { onboarding: v } : {};
}
