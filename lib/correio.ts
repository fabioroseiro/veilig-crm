import "server-only";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";

/**
 * Conexão com a caixa do Zoho (região .com): envio por SMTP e leitura por IMAP.
 * Sem a senha da caixa, o envio fica em modo simulação (não sai nada).
 */
// Servidores do Zoho (região .com). As variáveis CORREIO_* só existem para testes locais.
const SMTP = { host: process.env.CORREIO_SMTP_HOST || "smtp.zoho.com", port: Number(process.env.CORREIO_SMTP_PORT || 465), secure: process.env.CORREIO_SMTP_PORT ? false : true };
const IMAP = { host: process.env.CORREIO_IMAP_HOST || "imap.zoho.com", port: Number(process.env.CORREIO_IMAP_PORT || 993), secure: process.env.CORREIO_IMAP_PORT ? false : true };

/**
 * Senha de app de cada caixa, pelo primeiro nome do endereço:
 * natalia@… → ZOHO_SENHA_NATALIA; fabio.roseiro@… → ZOHO_SENHA_FABIO.
 */
export function senhaDaCaixa(usuario: string) {
  const nome = usuario.split("@")[0].split(/[._-]/)[0].toUpperCase();
  return process.env[`ZOHO_SENHA_${nome}`] || null;
}
export const envioReal = (usuario = "natalia@vendas.veilig.com.br") => !!senhaDaCaixa(usuario);

export function transportador(usuario: string) {
  const senha = senhaDaCaixa(usuario);
  if (!senha) return nodemailer.createTransport({ jsonTransport: true });
  return nodemailer.createTransport({ ...SMTP, auth: { user: usuario, pass: senha }, connectionTimeout: 15000, socketTimeout: 20000 });
}

export function caixa(usuario: string) {
  const senha = senhaDaCaixa(usuario);
  if (!senha) return null;
  return new ImapFlow({ ...IMAP, auth: { user: usuario, pass: senha }, logger: false, socketTimeout: 30000 });
}
