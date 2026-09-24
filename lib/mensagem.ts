import "server-only";

/** Monta o e-mail final: campos preenchidos, assinatura e rodapé de descadastro. */

const SITE_PLANOS: Record<string, string> = {
  motos: "veilig.com.br/planos/motos", leves: "veilig.com.br/planos/leves",
  pesados: "veilig.com.br/planos/pesados", agricolas: "veilig.com.br/planos/agricolas",
};

export type Dados = { nome?: string | null; grupo: string; origem?: string | null; segmento?: string | null };

function primeiroNome(nome?: string | null) {
  const p = (nome || "").trim().split(/\s+/)[0] || "";
  return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : "";
}

export function preencherTexto(modelo: string, d: Dados) {
  const nome = primeiroNome(d.nome);
  return modelo
    .replace(/Olá, \[Nome\]\./g, nome ? `Olá, ${nome}.` : "Olá.")
    .replace(/\[Nome\]/g, nome)
    .replace(/\[Grupo\]/g, d.grupo)
    .replace(/\[Origem\]/g, d.origem || "Fenabrave")
    .replace(/\[Link dos planos\]/g, SITE_PLANOS[d.segmento || ""] || "veilig.com.br/planos");
}

/** Campos que ficaram sem preencher (para não mandar "[Grupo]" para um cliente). */
export function camposFaltando(texto: string) {
  return [...new Set(texto.match(/\[[^\]\n]{2,30}\]/g) || [])];
}

const enc = new TextEncoder();
async function hmac(dados: string) {
  const segredo = process.env.SESSION_SECRET || "";
  const k = await crypto.subtle.importKey("raw", enc.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode("sair:" + dados)));
  return Buffer.from(sig).toString("base64url").slice(0, 22);
}
export async function tokenSair(contatoId: string) { return `${contatoId}.${await hmac(contatoId)}`; }
export async function lerTokenSair(token: string) {
  const [id, sig] = token.split(".");
  if (!id || !sig || !/^[0-9a-f-]{36}$/.test(id)) return null;
  return (await hmac(id)) === sig ? id : null;
}

export function urlApp() {
  return (process.env.APP_URL || "https://crm.veilig.com.br").replace(/\/$/, "");
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const linkar = (s: string) => s.replace(/\b(veilig\.com\.br[^\s,)]*)/g, '<a href="https://$1">$1</a>');

export type Remetente = { email: string; nome: string; whatsapp?: string | null };

/** "(11) 98640-5185" → "5511986405185" para o link do WhatsApp. */
const zapLink = (tel: string) => "55" + tel.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");

export async function montarEmail(corpo: string, remetente: Remetente, contatoId: string | null) {
  const remetenteNome = remetente.nome;
  const linkSair = contatoId ? `${urlApp()}/sair/${await tokenSair(contatoId)}` : `${urlApp()}/sair/teste`;
  const zap = remetente.whatsapp ? `WhatsApp ${remetente.whatsapp}` : "";
  const assinatura = `${remetenteNome}\nVeilig · veilig.com.br${zap ? `\n${zap}` : ""}`;
  const texto = `${corpo}\n\n${assinatura}\n\n--\nSe não quiser receber novas mensagens, responda "não" ou acesse: ${linkSair}`;
  const paragrafos = corpo.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${linkar(esc(p)).replace(/\n/g, "<br>")}</p>`).join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1d2b2f">${paragrafos}` +
    `<p style="margin:18px 0 0">${esc(remetenteNome)}<br>Veilig · <a href="https://veilig.com.br">veilig.com.br</a>` +
    (remetente.whatsapp ? `<br>WhatsApp <a href="https://wa.me/${zapLink(remetente.whatsapp)}">${esc(remetente.whatsapp)}</a>` : "") + `</p>` +
    `<p style="margin:24px 0 0;font-size:12px;color:#6b7c80">Se não quiser receber novas mensagens, responda "não" ou <a href="${linkSair}" style="color:#6b7c80">clique aqui</a>.</p></div>`;
  return { texto, html, linkSair };
}
