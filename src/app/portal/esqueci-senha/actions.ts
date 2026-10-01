"use server";

import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { enviarEmail, molduraEmail } from "@/lib/email";

export type PedidoCliente = { ok: boolean; message: string };

/**
 * Mascara o e-mail: o cliente reconhece o endereço, ninguém descobre qual é.
 * f••••@g••••.com.br
 */
function mascarar(email: string): string {
  const [usuario, dominio] = String(email).split("@");
  if (!dominio) return "seu e-mail";
  const m = (s: string, manter: number) =>
    s.length <= manter ? s + "•••" : s.slice(0, manter) + "•".repeat(Math.min(6, s.length - manter));
  const partes = dominio.split(".");
  return `${m(usuario, 1)}@${m(partes[0], 1)}.${partes.slice(1).join(".")}`;
}

/**
 * O cliente pede pelo CPF, porque é assim que ele entra.
 *
 * "CPF sem cadastro" e "cadastro sem e-mail" dão a MESMA resposta: a tela
 * nunca confirma se um CPF tem plano. Mas quem tem e-mail vê para onde o link
 * foi, senão ficaria esperando algo que nunca chega.
 */
export async function pedirRecuperacaoCliente(formData: FormData): Promise<PedidoCliente> {
  const cpf = String(formData.get("cpf") || "").replace(/\D/g, "");
  if (cpf.length !== 11) return { ok: false, message: "Informe um CPF válido." };

  const semEmail: PedidoCliente = {
    ok: true,
    message:
      "Não encontramos um e-mail para esse CPF. Procure a concessionária onde você " +
      "contratou o plano para receber um novo acesso.",
  };

  try {
    const token = crypto.randomBytes(32).toString("base64url");
    const hash = crypto.createHash("sha256").update(token).digest("hex");

    const r = await db.execute(sql`SELECT * FROM criar_token_senha_cliente(${cpf}, ${hash})`);
    const l = (Array.isArray(r) ? r : (r as any).rows)[0] as
      | { situacao: string; email: string | null; nome: string | null }
      | undefined;

    if (!l || l.situacao !== "enviado" || !l.email) return semEmail;

    const base = process.env.APP_URL ?? "https://app.veilig.com.br";
    const link = `${base}/portal/redefinir-senha?token=${encodeURIComponent(token)}`;
    const primeiro = String(l.nome ?? "").split(" ")[0];

    await enviarEmail({
      para: l.email,
      assunto: "Redefinir a senha do seu plano",
      html: molduraEmail(
        "Redefinir sua senha",
        `<p style="margin:0 0 12px">${primeiro ? `Olá, ${primeiro}.` : "Olá."} Recebemos um pedido para redefinir a senha do portal do seu plano de manutenção.</p>
         <p style="margin:0 0 20px">O link abaixo vale por <strong>30 minutos</strong> e só pode ser usado uma vez.</p>
         <p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#173b43;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Criar nova senha</a></p>
         <p style="margin:0;font-size:13px;color:#6b7d82">Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.</p>`
      ),
    });

    return {
      ok: true,
      message: `Enviamos um link para ${mascarar(l.email)}. Ele vale por 30 minutos.`,
    };
  } catch (e: any) {
    console.error("[PORTAL] falha no pedido de recuperação:", e?.message);
    return semEmail;
  }
}
