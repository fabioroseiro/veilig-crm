import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ressincronizarStatusCore } from "@/lib/ressync";
import { executarRegua, retentarExclusoes } from "@/lib/executar-regua";

// Rota chamada pelo Vercel Cron (1x/dia) para ressincronizar o status das
// assinaturas com a Asaas automaticamente — assim, se algum webhook se perder,
// no máximo em 24h o sistema se autocorrige, sem depender do botão manual.
//
// Segurança: o Vercel envia o header Authorization: Bearer ${CRON_SECRET}.
// Só executamos se o segredo bater. Sem isso, qualquer um poderia disparar.
export const dynamic = "force-dynamic";
// A conta Vercel é Pro, que permite até 800s. O limite de 60 era NOSSO, não
// da plataforma — e era ele que matava o cron em silêncio conforme a base
// crescia. O processamento em lotes (src/lib/lotes.ts) tem orçamento próprio
// de 240s + 60s, bem abaixo deste teto, para terminar por decisão e não por
// execução interrompida.
export const maxDuration = 400;

// Registro da execução para o monitoramento. NUNCA pode derrubar o cron: se a
// tabela não existir (migração esquecida), a rotina segue normalmente.
async function registrarInicio(): Promise<number | null> {
  try {
    const r = await db.execute(sql`SELECT cron_iniciar('diario') AS id`);
    return Number((Array.isArray(r) ? r : (r as any).rows)[0]?.id) || null;
  } catch (e: any) {
    console.error("[CRON] não registrou o início:", e?.message);
    return null;
  }
}

async function registrarFim(id: number | null, ok: boolean, resumo: string, erro: string | null) {
  if (!id) return;
  try {
    await db.execute(sql`SELECT cron_concluir(${id}::bigint, ${ok}, ${resumo}, ${erro})`);
  } catch (e: any) {
    console.error("[CRON] não registrou o fim:", e?.message);
  }
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  // se CRON_SECRET estiver configurado, exige o header correto
  if (secret) {
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // Início registrado ANTES de qualquer trabalho: se a execução for morta no
  // meio, o registro fica sem fim — e o painel acusa.
  const execId = await registrarInicio();

  try {
    // ORDEM IMPORTA: ressync primeiro, régua depois.
    //
    // O ressync traz os status da Asaas para o que é real. A régua decide em
    // cima disso. Invertendo, a régua trabalharia com status desatualizado —
    // e poderia suspender alguém que pagou ontem.
    const r = await ressincronizarStatusCore();

    // A régua NÃO pode derrubar o cron: se ela falhar, o ressync já rodou e
    // isso é o mais importante. O erro fica registrado na resposta.
    let regua: any = null;
    let reguaErro: string | null = null;
    try {
      regua = await executarRegua();
      const retry = await retentarExclusoes();
      if (retry.resolvidas > 0 || retry.falhas > 0) {
        regua.retentativas = retry;
      }
    } catch (e: any) {
      reguaErro = String(e?.message ?? e);
      console.error("[CRON] falha na régua de inadimplência:", reguaErro);
    }

    const resumo = [
      (r as any)?.message ?? "ressync executado",
      regua?.mensagem ? `régua: ${regua.mensagem}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    // Régua com erro não é execução perdida — o ressync rodou. Fica "ok" com o
    // erro anotado, e o painel mostra os dois.
    await registrarFim(execId, true, resumo, reguaErro ? `régua: ${reguaErro}` : null);

    return NextResponse.json({ ...r, regua, reguaErro });
  } catch (e: any) {
    const msg = String(e?.message || e);
    await registrarFim(execId, false, "falhou", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
