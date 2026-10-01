/**
 * Envio de e-mail transacional (Resend).
 *
 * Toda a conversa com o provedor fica AQUI. Se um dia trocarmos de provedor
 * — Brevo, SES —, muda esta função e nada mais: quem envia só conhece
 * destinatário, assunto e conteúdo.
 *
 * ── Remetente ───────────────────────────────────────────────────────────
 *
 * O endereço é sempre da Veilig; o NOME é o da loja, quando houver. O cliente
 * vê "Rota B <nao-responda@envio.veilig.com.br>" — identifica de quem veio sem
 * fingir ser outro domínio.
 *
 * ── Nunca derruba quem chamou ───────────────────────────────────────────
 *
 * Devolve verdadeiro ou falso. Uma venda não pode falhar porque o e-mail não
 * saiu, e uma recuperação de senha precisa responder a mesma coisa tendo o
 * e-mail saído ou não.
 */

const REMETENTE_PADRAO =
  process.env.EMAIL_REMETENTE ?? "nao-responda@envio.veilig.com.br";

export type Email = {
  para: string;
  assunto: string;
  /** Conteúdo em HTML. O texto puro é derivado dele. */
  html: string;
  /** Nome exibido antes do endereço. Use o da loja quando fizer sentido. */
  nomeRemetente?: string;
  /** Para onde vai a resposta, se alguém responder. */
  responderPara?: string;
};

export async function enviarEmail(e: Email): Promise<boolean> {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) {
    // Ambiente sem chave (desenvolvimento local): registra e segue.
    console.error("[EMAIL] RESEND_API_KEY não configurada. Não enviado:", e.assunto);
    return false;
  }

  const nome = (e.nomeRemetente ?? "Veilig").replace(/["<>\r\n]/g, "").slice(0, 60);

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${nome} <${REMETENTE_PADRAO}>`,
        to: [e.para],
        subject: e.assunto,
        html: e.html,
        // Texto puro junto: alguns clientes de e-mail preferem, e a ausência
        // dele piora a entrega.
        text: e.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
        ...(e.responderPara ? { reply_to: e.responderPara } : {}),
      }),
    });

    if (!r.ok) {
      const detalhe = await r.text().catch(() => "");
      console.error("[EMAIL] recusado pelo provedor:", r.status, detalhe.slice(0, 300));
      return false;
    }
    return true;
  } catch (err: any) {
    console.error("[EMAIL] falha ao enviar:", err?.message);
    return false;
  }
}

/** Moldura comum: mesma identidade em todos os e-mails, num lugar só. */
export function molduraEmail(titulo: string, corpo: string, rodape?: string): string {
  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f7f8;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#173b43">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;padding:28px">
    <div style="font-size:18px;font-weight:700;letter-spacing:4px;color:#4ec3e0;margin-bottom:20px">VEILIG</div>
    <h1 style="font-size:19px;margin:0 0 14px">${titulo}</h1>
    ${corpo}
  </div>
  <p style="max-width:520px;margin:14px auto 0;font-size:12px;color:#6b7d82;text-align:center">
    ${rodape ?? "Mensagem automática — não responda este e-mail."}
  </p>
</body></html>`;
}
