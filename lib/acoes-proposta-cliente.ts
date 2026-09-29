"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { q } from "./db";
import { lerConfig } from "./config";
import { aplicarEtapa, closerId } from "./funil";
import { hojeISO } from "./regras";
import { envioReal, transportador } from "./correio";
import { urlApp } from "./mensagem";
import { propostaPorToken, remetenteProposta, type Proposta } from "./proposta";
import { onboardingDe, ONBOARDING } from "./proposta-tipos";
import { dataExtenso } from "./proposta-conteudo";

/**
 * Ações do cliente na página pública da proposta (/p/<token>). Não exigem login:
 * o token longo e aleatório é a chave. Só valem para propostas enviadas.
 */
type Estado = { ok?: string; erro?: string } | null | undefined;
const s = (f: FormData, k: string, max = 200) => { const v = f.get(k); return typeof v === "string" ? v.trim().slice(0, max) : ""; };

async function registrar(grupoId: string, tipo: string, resumo: string, detalhe?: string | null) {
  await q("INSERT INTO atividade (grupo_id, tipo, resumo, detalhe) VALUES ($1,$2,$3,$4)", [grupoId, tipo, resumo, detalhe ?? null]);
}

/** Avisa o closer por e-mail (pela própria caixa das propostas). Falha no aviso não impede o registro. */
async function avisarCloser(p: Proposta, assunto: string, texto: string) {
  try {
    const rem = await remetenteProposta();
    const cfg = await lerConfig();
    if (!envioReal(rem.email)) return;
    const destino = cfg.closer_email || rem.email;
    await transportador(rem.email).sendMail({
      from: { name: "CRM Veilig", address: rem.email }, to: destino, subject: assunto,
      text: `${texto}\n\nAbrir no CRM: ${urlApp()}/grupos/${p.grupo_id}/propostas/${p.id}`,
    });
  } catch (e) {
    console.error("[proposta] aviso ao closer:", e);
  }
}

async function ipCliente() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

export async function aceitarProposta(token: string, _: Estado, f: FormData): Promise<Estado> {
  const p = await propostaPorToken(token);
  if (!p || !["enviada", "prazo_pedido"].includes(p.status)) return { erro: "Esta proposta não está disponível para aceite." };
  if (p.validade < hojeISO()) return { erro: "A validade desta proposta terminou. Use a opção de pedir mais prazo." };
  const nome = s(f, "nome", 120), cargo = s(f, "cargo", 120), email = s(f, "email", 160).toLowerCase();
  if (nome.length < 3 || cargo.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { erro: "Preencha nome, cargo e e-mail." };
  if (f.get("concordo") !== "on") return { erro: "Marque a confirmação para aceitar." };
  const ofertado = onboardingDe(p.dados);
  const escolha = f.get("onboarding");
  if (ofertado === "ambos" && escolha !== "consultivo" && escolha !== "online") return { erro: "Escolha o formato de onboarding." };
  const formato = ofertado === "ambos" ? (escolha as "consultivo" | "online") : ofertado;

  const aceite = { nome, cargo, email, ip: await ipCliente(), ...(ofertado === "ambos" ? { onboarding: formato } : {}) };
  const r = await q<{ id: string }>("UPDATE proposta SET status='aceita', aceita_em=now(), aceite=$2, atualizado_em=now() WHERE id=$1 AND status IN ('enviada','prazo_pedido') RETURNING id", [p.id, aceite]);
  if (!r.length) return { erro: "Esta proposta não está disponível para aceite." };

  await registrar(p.grupo_id, "email", `Proposta ${p.numero} aceita por ${nome} (${cargo}). Onboarding ${ONBOARDING[formato].nome}`, `E-mail: ${email}\nIP: ${aceite.ip ?? "—"}`);
  await q("UPDATE grupo SET ultimo_sinal=now() WHERE id=$1", [p.grupo_id]);
  await q("UPDATE tarefa SET feita_em=now(), resultado='Proposta aceita' WHERE grupo_id=$1 AND feita_em IS NULL AND titulo LIKE $2", [p.grupo_id, `Acompanhar a proposta ${p.numero}%`]);
  await aplicarEtapa(p.grupo_id, 6, null, true);
  await q(`INSERT INTO tarefa (grupo_id, tipo, titulo, texto, vence_em, usuario_id) VALUES ($1,'email',$2,$3,$4,$5)`,
    [p.grupo_id, `Enviar o contrato: proposta ${p.numero} aceita`, `Aceite de ${nome} (${cargo}), ${email}. Onboarding ${ONBOARDING[formato].nome}. Enviar o contrato com o Anexo I — Condições Comerciais preenchido com os valores da proposta e agendar o kickoff.`,
      hojeISO(), await closerId()]);
  await avisarCloser(p, `Proposta aceita: ${p.dados.empresa} (${p.numero})`,
    `${nome} (${cargo}, ${email}) aceitou a proposta ${p.numero} da ${p.dados.empresa}, com onboarding ${ONBOARDING[formato].nome}. Próximo passo: enviar o contrato.`);
  revalidatePath(`/p/${token}`); revalidatePath(`/grupos/${p.grupo_id}`);
  return { ok: "Proposta aceita. Obrigado! Vamos enviar o contrato para assinatura em seguida." };
}

export async function pedirPrazo(token: string, _: Estado, f: FormData): Promise<Estado> {
  const p = await propostaPorToken(token);
  if (!p || !["enviada", "prazo_pedido"].includes(p.status)) return { erro: "Esta proposta não está disponível." };
  const data = s(f, "data", 10), motivo = s(f, "motivo", 1000), nome = s(f, "nome", 120);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data <= hojeISO()) return { erro: "Escolha uma data futura." };
  if (nome.length < 3) return { erro: "Informe o seu nome." };
  const pedido = { data, motivo, nome, em: new Date().toISOString() };
  await q("UPDATE proposta SET status='prazo_pedido', prazo_pedido=$2, atualizado_em=now() WHERE id=$1", [p.id, pedido]);
  await registrar(p.grupo_id, "email", `${nome} pediu mais prazo para a proposta ${p.numero}, até ${dataExtenso(data)}`, motivo || null);
  await q("UPDATE grupo SET ultimo_sinal=now() WHERE id=$1", [p.grupo_id]);
  await q(`INSERT INTO tarefa (grupo_id, tipo, titulo, texto, vence_em, usuario_id) VALUES ($1,'outro',$2,$3,$4,$5)`,
    [p.grupo_id, `Responder o pedido de prazo da proposta ${p.numero} (até ${dataExtenso(data)})`, motivo || null, hojeISO(), await closerId()]);
  await avisarCloser(p, `Pedido de prazo: ${p.dados.empresa} (${p.numero})`,
    `${nome} pediu para estender a proposta ${p.numero} da ${p.dados.empresa} até ${dataExtenso(data)}.${motivo ? `\nMotivo: ${motivo}` : ""}\nPara aceitar, prorrogue a validade no CRM.`);
  revalidatePath(`/p/${token}`); revalidatePath(`/grupos/${p.grupo_id}`);
  return { ok: "Pedido registrado. Vamos confirmar a nova data com você." };
}
