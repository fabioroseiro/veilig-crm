/**
 * Sessão por cookie assinado (HMAC-SHA256). Usa Web Crypto, então funciona
 * igual no middleware (edge) e nas rotas do servidor.
 */
export const COOKIE = "crm_sessao";
const DURACAO_S = 60 * 60 * 24 * 14; // 14 dias

const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function chave() {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo || segredo.length < 32) throw new Error("SESSION_SECRET ausente ou curto (mínimo 32 caracteres)");
  return crypto.subtle.importKey("raw", enc.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function assinar(dados: string) {
  return b64(await crypto.subtle.sign("HMAC", await chave(), enc.encode(dados)));
}

export async function criarToken(usuarioId: string) {
  const exp = Math.floor(Date.now() / 1000) + DURACAO_S;
  const dados = `${usuarioId}.${exp}`;
  return { token: `${dados}.${await assinar(dados)}`, maxAge: DURACAO_S };
}

/** Devolve o id do usuário se o token for válido e não expirado. */
export async function lerToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [id, exp, assinatura] = partes;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return null;
  const esperado = await assinar(`${id}.${exp}`);
  if (esperado.length !== assinatura.length) return null;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ assinatura.charCodeAt(i);
  return diff === 0 ? id : null;
}
