"use server";

import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { enviarEmail, molduraEmail } from "@/lib/email";

export type PedidoResult = { enviado: boolean; message: string };

/**
 * Pede o link de redefinição.
 *
 * A RESPOSTA É SEMPRE A MESMA, exista o e-mail ou não. Uma tela que diz
 * "e-mail não encontrado" vira um detector de quem tem conta no sistema.
 *
 * O link leva um token aleatório; no banco guardamos só o hash dele.
 */
export async function pedirRecuperacao(formData: FormData): Promise<PedidoResult> {
  const email = String(formData.get("email") || "").trim();
  const resposta: PedidoResult = {
    enviado: true,
    message:
      "Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha. " +
      "Ele vale por 30 minutos.",
  };

  if (!email || !email.includes("@")) {
    return { enviado: false, message: "Informe um e-mail válido." };
  }

  try {
    const token = crypto.randomBytes(32).toString("base64url");
    const hash = crypto.createHash("sha256").update(token).digest("hex");

    const r = await db.execute(sql`SELECT * FROM criar_token_senha(${email}, ${hash})`);
    const linha = (Array.isArray(r) ? r : (r as any).rows)[0] as
      | { email: string; nome: string }
      | undefined;

    // Sem conta ativa, ou pedidos demais em pouco tempo: nada é enviado, e a
    // tela diz a mesma coisa.
    if (!linha?.email) return resposta;

    const base = process.env.APP_URL ?? "https://app.veilig.com.br";
    const link = `${base}/redefinir-senha?token=${encodeURIComponent(token)}`;
    const primeiro = String(linha.nome ?? "").split(" ")[0];

    await enviarEmail({
      para: linha.email,
      assunto: "Redefinir sua senha do Veilig",
      html: molduraEmail(
        "Redefinir sua senha",
        `<p style="margin:0 0 12px">${primeiro ? `Olá, ${primeiro}.` : "Olá."} Recebemos um pedido para redefinir a senha do seu acesso ao Veilig.</p>
         <p style="margin:0 0 20px">O link abaixo vale por <strong>30 minutos</strong> e só pode ser usado uma vez.</p>
         <p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#173b43;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Criar nova senha</a></p>
         <p style="margin:0;font-size:13px;color:#6b7d82">Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.</p>`
      ),
    });
  } catch (e: any) {
    // Falha de envio ou de banco não pode revelar nada nem travar a tela.
    console.error("[SENHA] falha no pedido de recuperação:", e?.message);
  }

  return resposta;
}
