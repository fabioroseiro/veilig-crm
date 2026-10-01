import { db } from "@/db";
import { sql } from "drizzle-orm";
import { asaas } from "@/lib/asaas";

/**
 * Carga inicial do espelho de cobranças.
 *
 * A tabela nasce vazia, e as mensalidades já pagas não estão em lugar nenhum —
 * sem isto, a primeira apuração de comissão recorrente sairia incompleta.
 *
 * Roda UMA vez, sob demanda. Com pouco mais de vinte assinaturas é rápido; com
 * 40 lojas seria bem mais caro, por isso vale fazer agora.
 *
 * Idempotente: a gravação é por `asaas_payment_id`, então rodar duas vezes não
 * duplica nada — só atualiza.
 */
export async function importarHistoricoCobrancas(): Promise<{
  assinaturas: number;
  cobrancas: number;
  falhas: number;
  mensagem: string;
}> {
  let assinaturas = 0;
  let cobrancas = 0;
  let falhas = 0;

  const r = await db.execute(sql`SELECT * FROM assinaturas_para_importar_cobrancas()`);
  const linhas = (Array.isArray(r) ? r : (r as any).rows) as any[];

  for (const l of linhas) {
    assinaturas++;
    try {
      const resp = await asaas<any>(
        "GET",
        `/subscriptions/${l.asaas_subscription_id}/payments`
      );
      for (const p of (resp?.data ?? []) as any[]) {
        try {
          await db.execute(
            sql`SELECT registrar_cobranca(
                  ${p.id},
                  ${l.asaas_subscription_id},
                  ${p.value ?? null},
                  ${p.netValue ?? null},
                  ${p.billingType ?? null},
                  ${p.status ?? "UNKNOWN"},
                  ${p.dateCreated ?? null}::timestamptz,
                  ${p.dueDate ?? null}::date,
                  ${p.paymentDate ?? p.confirmedDate ?? null}::timestamptz,
                  ${p.creditDate ?? null}::timestamptz
                )`
          );
          cobrancas++;
        } catch (e: any) {
          console.error("[IMPORT] falha ao gravar", p.id, ":", e?.message);
          falhas++;
        }
      }
    } catch (e: any) {
      console.error("[IMPORT] falha ao ler", l.asaas_subscription_id, ":", e?.message);
      falhas++;
    }
  }

  return {
    assinaturas,
    cobrancas,
    falhas,
    mensagem: `${assinaturas} assinatura(s) · ${cobrancas} cobrança(s) importada(s)${
      falhas ? ` · ${falhas} falha(s)` : ""
    }`,
  };
}
