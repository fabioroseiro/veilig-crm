"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/session";
import { sincronizarAssinaturaAsaas } from "@/lib/sincronizar-asaas";

/**
 * Refaz a cobrança de uma venda que falhou na Asaas.
 *
 * O padrão do sistema é: a venda é salva primeiro; se a Asaas recusar, a venda
 * não se perde, só fica marcada com o motivo. Faltava a outra metade — depois
 * de corrigir o dado (um CPF inválido, por exemplo), o vendedor precisa de um
 * jeito de tentar de novo sem refazer a venda inteira.
 */
export async function reprocessarCobranca(subId: string) {
  const ctx = await getSessionContext();
  if (!["veilig_admin", "group_admin", "store_manager", "store_admin"].includes(ctx.role)) {
    return;
  }
  await sincronizarAssinaturaAsaas(ctx, subId);
  revalidatePath("/clientes");
}
