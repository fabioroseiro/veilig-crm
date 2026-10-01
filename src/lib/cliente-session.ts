// Sessão do CLIENTE final — circuito separado do Auth.js dos funcionários.
// Usa um cookie assinado (HMAC) com o id da credencial do cliente. Simples e
// isolado: o cliente nunca toca no fluxo de autenticação dos funcionários.

import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE = "veilig_cliente";
const SEGREDO = process.env.AUTH_SECRET || "dev-secret-troque";

function assina(valor: string): string {
  const h = crypto.createHmac("sha256", SEGREDO).update(valor).digest("hex");
  return `${valor}.${h}`;
}

function verifica(assinado: string): string | null {
  const i = assinado.lastIndexOf(".");
  if (i < 0) return null;
  const valor = assinado.slice(0, i);
  const h = assinado.slice(i + 1);
  const esperado = crypto.createHmac("sha256", SEGREDO).update(valor).digest("hex");
  // comparação em tempo constante
  if (h.length !== esperado.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(h), Buffer.from(esperado))) return null;
  return valor;
}

// cria a sessão (após login válido)
export async function criarSessaoCliente(authId: string) {
  const jar = await cookies();
  jar.set(COOKIE, assina(authId), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 dias
  });
}

// lê o id da credencial do cliente logado (ou null)
export async function getClienteAuthId(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  return verifica(raw);
}

export async function encerrarSessaoCliente() {
  const jar = await cookies();
  jar.delete(COOKIE);
}
