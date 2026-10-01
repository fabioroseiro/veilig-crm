import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, sql } from "drizzle-orm";
import { statusRealAssinaturaAsaas } from "@/lib/asaas";

export const dynamic = "force-dynamic";

// Webhook do Asaas: recebe eventos de pagamento e atualiza o status da
// assinatura. A rota é pública (o Asaas chama de fora), mas validamos um
// token secreto para garantir que o evento veio mesmo do Asaas.
//
// Segurança:
//  - ASAAS_WEBHOOK_TOKEN: configurado no painel do Asaas E aqui. O Asaas
//    manda no header "asaas-access-token"; se não bater, recusamos.
//  - Idempotência: cada evento tem um id; se já processamos, ignoramos.
//  - Responde 200 rápido (o Asaas reenvia se não receber 200).

// Mapeia o evento do Asaas para o nosso status de assinatura.
// IMPORTANTE: eventos "fortes" ditam o status diretamente (confirmação, atraso,
// estorno). Já PAYMENT_CREATED/PENDING são "fracos": a Asaas gera a PRÓXIMA
// cobrança da recorrência com 40 dias de antecedência, então esse evento NÃO
// significa que o cliente está devendo — significa só que existe uma cobrança
// futura. Se aplicássemos 'pendente' aqui, rebaixaríamos uma assinatura que
// está 'paga' no ciclo atual. Por isso os fracos são tratados à parte (recalculam
// o estado real consultando a Asaas em vez de forçar 'pendente').
function statusDoEvento(evento: string): string | null {
  switch (evento) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED":
      return "paga";
    case "PAYMENT_OVERDUE":
      return "atrasada";
    case "PAYMENT_DELETED":
    case "PAYMENT_REFUNDED":
    case "PAYMENT_REFUND_REQUESTED":
    case "PAYMENT_CHARGEBACK_REQUESTED":
      return "cancelada";
    default:
      return null; // evento que não muda status diretamente (ignora ou recalcula)
  }
}

// Eventos "fracos": não ditam status; disparam um RECÁLCULO do estado real.
function eventoFraco(evento: string): boolean {
  return (
    evento === "PAYMENT_CREATED" ||
    evento === "PAYMENT_PENDING" ||
    evento === "PAYMENT_AWAITING_RISK_ANALYSIS" ||
    evento === "PAYMENT_UPDATED"
  );
}

export async function POST(req: Request) {
  // 1. valida o token (se configurado)
  const tokenEsperado = process.env.ASAAS_WEBHOOK_TOKEN || "";
  if (tokenEsperado) {
    const tokenRecebido = req.headers.get("asaas-access-token") || "";
    if (tokenRecebido !== tokenEsperado) {
      // não revela detalhe; só recusa
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // 2. parse do corpo
  let evt: any;
  try {
    evt = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const evento: string = evt?.event || "";
  const pagamento = evt?.payment || {};
  const asaasSubId: string | undefined = pagamento?.subscription;
  const eventId: string | undefined = evt?.id || pagamento?.id;

  // sempre respondemos 200 para o Asaas não ficar reenviando; o processamento
  // é resiliente e registra o que der.
  try {
    let novoStatus = statusDoEvento(evento);

    // ── ACEITE DO CONTRATO ──────────────────────────────────────────────
    // No contrato de adesão, o aceite É o pagamento da primeira mensalidade.
    // Este é o único momento em que a data, o id da cobrança e o meio de
    // pagamento existem — a assinatura é criada com billingType UNDEFINED, e
    // o cliente escolhe na hora de pagar.
    //
    // A função grava UMA VEZ e ignora os pagamentos seguintes: sem isso, a
    // data do aceite viraria "data do último pagamento" e o contrato não
    // ── Espelho local da cobrança ──────────────────────────────────────
    //
    // Grava em QUALQUER evento de pagamento, não só na confirmação: a cobrança
    // criada, a vencida e a cancelada também interessam — é isso que permite
    // reconstruir o histórico sem consultar a Asaas.
    //
    // Fora do fluxo de aceite de propósito: se falhar, o aceite não pode ser
    // perdido. O espelho se corrige na próxima passagem.
    if (asaasSubId && pagamento?.id) {
      try {
        await db.execute(
          sql`SELECT registrar_cobranca(
                ${pagamento.id},
                ${asaasSubId},
                ${pagamento?.value ?? null},
                ${pagamento?.netValue ?? null},
                ${pagamento?.billingType ?? null},
                ${pagamento?.status ?? "UNKNOWN"},
                ${pagamento?.dateCreated ?? null}::timestamptz,
                ${pagamento?.dueDate ?? null}::date,
                ${pagamento?.paymentDate ?? pagamento?.confirmedDate ?? null}::timestamptz,
                ${pagamento?.creditDate ?? null}::timestamptz
              )`
        );
      } catch (e: any) {
        console.error("[WEBHOOK] falha ao espelhar cobrança:", e?.message);
      }
    }

    // Estorno — inclusive os feitos À MÃO no painel da Asaas.
    //
    // É a rede de segurança: sem isto, um estorno feito fora do sistema
    // deixaria o MRR contando receita devolvida e a comissão paga por venda
    // desfeita. Foi exatamente o que aconteceu no primeiro caso real.
    if (evento === "PAYMENT_REFUNDED" && asaasSubId) {
      try {
        await db.execute(
          sql`SELECT registrar_estorno_por_pagamento(
                ${asaasSubId},
                ${pagamento?.value ?? null},
                ${"Estorno registrado pela Asaas"}
              )`
        );
      } catch (e: any) {
        console.error("[WEBHOOK] falha ao registrar estorno:", e?.message);
      }
    }

    // Cobrança apagada na Asaas: registra para o histórico não mentir.
    if (evento === "PAYMENT_DELETED" && pagamento?.id) {
      try {
        await db.execute(sql`SELECT marcar_cobranca_cancelada(${pagamento.id})`);
      } catch (e: any) {
        console.error("[WEBHOOK] falha ao marcar cobrança cancelada:", e?.message);
      }
    }

    // provaria nada.
    if (
      asaasSubId &&
      (evento === "PAYMENT_CONFIRMED" || evento === "PAYMENT_RECEIVED")
    ) {
      try {
        const pagoEm =
          pagamento?.confirmedDate ||
          pagamento?.paymentDate ||
          pagamento?.clientPaymentDate ||
          null;
        // Guarda o valor LÍQUIDO junto com o aceite.
        //
        // O split da Asaas incide sobre o netValue, não sobre o bruto — a taxa
        // sai antes da divisão. Sem este número, o painel projeta uma receita
        // que não chega na conta.
        await db.execute(
          sql`SELECT registrar_valores_pagamento(
                ${asaasSubId},
                ${pagamento?.value ?? null},
                ${pagamento?.netValue ?? null},
                ${pagamento?.billingType ?? null}
              )`
        );

        await db.execute(
          sql`SELECT registrar_aceite_contrato(
                ${asaasSubId},
                ${pagamento?.id ?? null},
                ${pagamento?.billingType ?? null},
                ${pagoEm}::timestamptz
              )`
        );
      } catch (e: any) {
        // Não derruba o webhook: a atualização de status é mais crítica que o
        // registro do aceite, e o erro fica no log para investigação.
        console.error("[WEBHOOK] falha ao registrar aceite:", e?.message);
      }
    }

    // Evento fraco (nova cobrança futura criada, etc.): não rebaixa. Recalcula o
    // estado real consultando a Asaas. Assim, se o ciclo atual está pago, continua
    // 'paga'; se de fato há algo em aberto/vencido, reflete corretamente.
    if (!novoStatus && eventoFraco(evento) && asaasSubId) {
      novoStatus = await statusRealAssinaturaAsaas(asaasSubId);
    }

    // só agimos se temos um status a aplicar e a assinatura do Asaas
    if (novoStatus && asaasSubId) {
      // idempotência simples: registra o evento; se já existe, não reprocessa
      const jaProcessado = eventId
        ? await db
            .select({ id: schema.webhookEvents.id })
            .from(schema.webhookEvents)
            .where(eq(schema.webhookEvents.eventId, eventId))
            .limit(1)
        : [];

      if (!eventId || jaProcessado.length === 0) {
        // atualiza o status da assinatura (conexão base; sem tenant no webhook,
        // por isso usamos uma função SECURITY DEFINER para contornar o RLS).
        await db.execute(
          sql`SELECT atualizar_status_assinatura(${asaasSubId}, ${novoStatus})`
        );

        // registra o evento processado (idempotência)
        if (eventId) {
          await db.insert(schema.webhookEvents).values({
            eventId,
            evento,
            asaasSubscriptionId: asaasSubId,
            novoStatus,
          });
        }
      }
    }
  } catch (e: any) {
    console.error("[WEBHOOK] erro ao processar:", e?.message);
    // ainda assim respondemos 200 para não gerar reenvio infinito; o erro fica no log
  }

  return NextResponse.json({ received: true });
}
