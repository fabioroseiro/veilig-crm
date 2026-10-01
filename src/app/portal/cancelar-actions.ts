"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getClienteAuthId } from "@/lib/cliente-session";
import { apagarCobrancasDaAssinatura } from "@/lib/apagar-cobrancas";
import { cancelarAssinaturaAsaas } from "@/lib/asaas";

export type CancelState = { ok: boolean; message: string };

// Cancelamento pelo PRÓPRIO CLIENTE (portal). Verifica posse via função
// SECURITY DEFINER (o cliente só cancela a própria assinatura), avisa a Asaas
// primeiro e só então marca 'cancelada'.
export async function cancelarAssinaturaCliente(
  subscriptionId: string,
  _prev: CancelState,
  _formData: FormData
): Promise<CancelState> {
  const authId = await getClienteAuthId();
  if (!authId) return { ok: false, message: "Sessão expirada. Entre novamente." };

  // resolve person_id
  const credR = await db.execute(sql`SELECT * FROM customer_auth_by_id(${authId})`);
  const cred = (Array.isArray(credR) ? credR : (credR as any).rows)[0] as
    | { person_id: string }
    | undefined;
  if (!cred) return { ok: false, message: "Cliente não encontrado." };

  // confere posse e pega o id da Asaas
  const subR = await db.execute(
    sql`SELECT * FROM assinatura_do_cliente_para_cancelar(${cred.person_id}, ${subscriptionId})`
  );
  const sub = (Array.isArray(subR) ? subR : (subR as any).rows)[0] as
    | { id: string; asaas_subscription_id: string | null; status: string }
    | undefined;

  if (!sub) return { ok: false, message: "Assinatura não encontrada." };
  if (sub.status === "cancelada") return { ok: true, message: "Esta assinatura já estava cancelada." };

  // 1) avisa a Asaas primeiro
  if (sub.asaas_subscription_id) {
    try {
      await cancelarAssinaturaAsaas(sub.asaas_subscription_id);

      // Mesma razão do cancelamento pela loja: a assinatura inativa não gera
      // novas cobranças, mas as já geradas continuariam chegando ao cliente.
      // `sub.id` pode não vir na função SECURITY DEFINER — nesse caso passamos
      // o id que o próprio chamador já tem. Sem isso, a pendência ficaria sem
      // assinatura vinculada e ninguém saberia de quem é.
      await apagarCobrancasDaAssinatura(
        (sub as any).id ?? subscriptionId,
        sub.asaas_subscription_id
      );
    } catch (e: any) {
      // Falha ao cancelar na Asaas mexe com dinheiro: se ficarmos sem o
      // motivo, é impossível saber se o cliente segue sendo cobrado.
      console.error("[CANCELAMENTO] Asaas recusou:", e?.message);
      return {
        ok: false,
        message: "Não foi possível cancelar agora. Nada foi alterado — tente novamente em instantes.",
      };
    }
  }

  // 2) marca cancelada (só a própria, pela função com posse)
  try {
    await db.execute(sql`SELECT marcar_assinatura_cancelada(${cred.person_id}, ${subscriptionId})`);

    // Origem 'cliente': foi ele quem cancelou, pelo portal. É o que distingue
    // desistência de cancelamento feito pela loja — e de cancelamento por
    // inadimplência, que a régua marca.
    await db.execute(
      sql`SELECT registrar_origem_cancelamento(${subscriptionId}::uuid, 'cliente', NULL)`
    );
  } catch {
    return { ok: false, message: "A cobrança foi interrompida, mas houve um erro ao atualizar. Fale com a loja." };
  }

  revalidatePath("/portal");
  return { ok: true, message: "Assinatura cancelada. Não haverá renovação; o período já pago é preservado." };
}
