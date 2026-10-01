import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { enviarEmail, molduraEmail } from "@/lib/email";

/**
 * E-mail de boas-vindas ao cliente, logo após a venda.
 *
 * Leva um LINK para ele criar a própria senha — não a senha em si. O clique
 * prova que o endereço existe e é dele, então primeiro acesso e verificação de
 * e-mail acontecem no mesmo gesto.
 *
 * O acesso pelo WhatsApp continua: este e-mail é a rede de segurança para
 * quando o vendedor esquece, não o substituto.
 *
 * NUNCA derruba a venda. Se falhar, a venda está feita e o vendedor tem a
 * senha provisória na tela.
 */
export async function enviarBoasVindas(params: {
  personId: string;
  loja: string | null;
  plano: string | null;
  veiculo: string | null;
  carenciaAte: string | null;
}): Promise<boolean> {
  try {
    const token = crypto.randomBytes(32).toString("base64url");
    const hash = crypto.createHash("sha256").update(token).digest("hex");

    const r = await db.execute(
      sql`SELECT * FROM criar_token_boas_vindas(${params.personId}::uuid, ${hash})`
    );
    const l = (Array.isArray(r) ? r : (r as any).rows)[0] as
      | { email: string; nome: string }
      | undefined;

    // Sem e-mail no cadastro não há o que enviar — e a ficha do cliente passa
    // a mostrar isso como pendência.
    if (!l?.email) return false;

    const base = process.env.APP_URL ?? "https://app.veilig.com.br";
    const link = `${base}/portal/redefinir-senha?token=${encodeURIComponent(token)}`;
    const primeiro = String(l.nome ?? "").split(" ")[0];

    // O plano NÃO vale ainda: o contrato só se efetiva com o primeiro
    // pagamento (cláusula de aceite). Dizer "já pode ser utilizado" antes
    // disso é promessa que o contrato não sustenta — e gera reclamação na
    // primeira visita à oficina.
    const carencia = params.carenciaAte
      ? `<div style="background:rgba(184,134,11,.12);border-left:3px solid #b8860b;border-radius:6px;padding:12px 14px;margin:0 0 18px">
           <strong>Quando você poderá usar o plano</strong><br>
           Primeiro, confirme a contratação pagando a primeira mensalidade.
           Depois disso, o plano poderá ser utilizado a partir de
           <strong>${String(params.carenciaAte).slice(0, 10).split("-").reverse().join("/")}</strong>,
           conforme o período de carência previsto no seu contrato.
         </div>`
      : `<div style="background:rgba(184,134,11,.12);border-left:3px solid #b8860b;border-radius:6px;padding:12px 14px;margin:0 0 18px">
           <strong>Quando você poderá usar o plano</strong><br>
           Assim que o pagamento da primeira mensalidade for confirmado. Seu plano
           não tem período de carência.
         </div>`;

    return await enviarEmail({
      para: l.email,
      nomeRemetente: params.loja ?? "Veilig",
      assunto: "Seu plano de manutenção — próximos passos",
      html: molduraEmail(
        "Bem-vindo ao seu plano",
        `<p style="margin:0 0 12px">${primeiro ? `Olá, ${primeiro}.` : "Olá."} Seu plano${
          params.plano ? ` <strong>${params.plano}</strong>` : ""
        }${
          params.veiculo ? ` para o veículo <strong>${params.veiculo}</strong>` : ""
        } foi contratado.</p>
         ${carencia}
         <p style="margin:0 0 12px">Crie sua senha para acompanhar faturas, contrato e situação do plano:</p>
         <p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#173b43;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Criar minha senha</a></p>
         <p style="margin:0;font-size:13px;color:#6b7d82">O link vale por 7 dias. Se expirar, use "Esqueci minha senha" no portal.</p>`,
        `${params.loja ?? ""} — plano de manutenção`
      ),
    });
  } catch (e: any) {
    console.error("[BOAS-VINDAS] falha ao enviar:", e?.message);
    return false;
  }
}

/**
 * Boas-vindas para usuário do PAINEL (vendedor, gestor de loja, gestor de
 * grupo).
 *
 * Mesma ideia do e-mail do cliente: link para a pessoa criar a própria senha,
 * em vez da senha em si. A entrega pelo WhatsApp continua — isto é a rede de
 * segurança para quando quem cadastrou esquece de repassar.
 *
 * Nunca derruba o cadastro: o usuário já foi criado e a senha provisória está
 * na tela de quem o criou.
 */
export async function enviarBoasVindasUsuario(params: {
  userId: string;
  papel: string;
  loja: string | null;
}): Promise<boolean> {
  try {
    const token = crypto.randomBytes(32).toString("base64url");
    const hash = crypto.createHash("sha256").update(token).digest("hex");

    const r = await db.execute(
      sql`SELECT * FROM criar_token_boas_vindas_usuario(${params.userId}::uuid, ${hash})`
    );
    const l = (Array.isArray(r) ? r : (r as any).rows)[0] as
      | { email: string; nome: string }
      | undefined;
    if (!l?.email) return false;

    const base = process.env.APP_URL ?? "https://app.veilig.com.br";
    const link = `${base}/redefinir-senha?token=${encodeURIComponent(token)}`;
    const primeiro = String(l.nome ?? "").split(" ")[0];

    return await enviarEmail({
      para: l.email,
      assunto: "Seu acesso ao Veilig",
      html: molduraEmail(
        "Seu acesso ao Veilig",
        `<p style="margin:0 0 12px">${primeiro ? `Olá, ${primeiro}.` : "Olá."} Foi criado um acesso para você no Veilig${
          params.loja ? `, na ${params.loja}` : ""
        }, como <strong>${params.papel}</strong>.</p>
         <p style="margin:0 0 12px">Crie sua senha para entrar:</p>
         <p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#173b43;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Criar minha senha</a></p>
         <p style="margin:0 0 12px;font-size:13px;color:#6b7d82">O link vale por 7 dias. Se expirar, use "Esqueci minha senha" na tela de entrada.</p>
         <p style="margin:0;font-size:13px;color:#6b7d82">Seu login é este e-mail.</p>`
      ),
    });
  } catch (e: any) {
    console.error("[BOAS-VINDAS] falha ao enviar para usuário:", e?.message);
    return false;
  }
}
