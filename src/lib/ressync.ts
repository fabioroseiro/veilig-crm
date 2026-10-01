import { sql } from "drizzle-orm";
import { db } from "@/db";
import { statusRealAssinaturaAsaas, linkFaturaAtualAsaas } from "@/lib/asaas";
import { processarEmLotes } from "@/lib/lotes";

export type ResyncResult = {
  ok: boolean;
  verificadas: number;
  corrigidas: number;
  falhas: number;
  linksRepostos: number;
  message: string;
};

// Núcleo da ressincronização, SEM depender de sessão de usuário. Usa funções
// SECURITY DEFINER (assinaturas_para_ressincronizar / atualizar_status_assinatura)
// para ler e escrever contornando o RLS — igual ao webhook. Serve tanto para o
// botão manual (Veilig admin) quanto para o cron diário.
export async function ressincronizarStatusCore(): Promise<ResyncResult> {
  // lista assinaturas com id na Asaas e que não estão canceladas
  const r = await db.execute(sql`SELECT * FROM assinaturas_para_ressincronizar()`);
  const subs = (Array.isArray(r) ? r : (r as any).rows) as {
    id: string;
    asaas_subscription_id: string;
    status: string;
  }[];

  let verificadas = 0;
  let corrigidas = 0;
  let falhas = 0;
  let linksRepostos = 0;

  // Em LOTES PARALELOS, não em série. Antes cada assinatura esperava a
  // resposta da Asaas antes de começar a próxima; a partir de ~120 assinaturas
  // a função era morta por tempo, em silêncio, e os status paravam de ser
  // corrigidos sem nenhum sinal.
  const comId = subs.filter((s) => !!s.asaas_subscription_id);

  const loteStatus = await processarEmLotes(
    comId,
    async (s) => {
      verificadas++;
      const real = await statusRealAssinaturaAsaas(s.asaas_subscription_id);
      if (real === null) {
        falhas++; // não conseguiu consultar; não mexe
        return;
      }

      if (real !== s.status) {
        try {
          await db.execute(
            sql`SELECT atualizar_status_assinatura(${s.asaas_subscription_id}, ${real})`
          );
          corrigidas++;
        } catch {
          falhas++;
        }
      }
    },
    { tamanhoLote: 8, orcamentoMs: 240_000 }
  );

  // ── Reposição de links de pagamento ────────────────────────────────────
  // A Asaas cria a assinatura e gera a primeira cobrança em momentos
  // diferentes. Quando a consulta na hora da venda volta vazia, a assinatura
  // fica sem link e o cliente não sabe como pagar. Aqui a cobrança já existe.
  //
  // Roda sem contexto de tenant (cron), então usa SECURITY DEFINER como o resto
  // do ressync.
  try {
    const semLink = await db.execute(sql`SELECT * FROM assinaturas_sem_link_pagamento()`);
    const pendentes = (Array.isArray(semLink) ? semLink : (semLink as any).rows) as {
      id: string;
      asaas_subscription_id: string;
    }[];
    const loteLinks = await processarEmLotes(
      pendentes.filter((p) => !!p.asaas_subscription_id),
      async (p) => {
        const link = await linkFaturaAtualAsaas(p.asaas_subscription_id);
        if (!link) return;
        try {
          await db.execute(sql`SELECT repor_link_pagamento(${p.id}::uuid, ${link})`);
          linksRepostos++;
        } catch {
          // não é crítico: o status é o principal deste processo
        }
      },
      // Orçamento menor: o status é a prioridade, e o que sobrar aqui é
      // reposto na execução de amanhã.
      { tamanhoLote: 8, orcamentoMs: 60_000 }
    );
    if (loteLinks.esgotou) {
      console.warn(`[RESSYNC] tempo esgotado nos links; ${loteLinks.restantes} ficaram para a próxima.`);
    }
  } catch (e: any) {
    console.error("[RESSYNC] falha ao repor links:", e?.message);
  }

  return {
    ok: true,
    verificadas,
    corrigidas,
    falhas,
    linksRepostos,
    message:
      (corrigidas > 0
        ? `${corrigidas} assinatura(s) corrigida(s) de ${verificadas} verificada(s).`
        : `Tudo já estava sincronizado (${verificadas} verificada(s)).`) +
      (linksRepostos > 0 ? ` ${linksRepostos} link(s) de pagamento reposto(s).` : "") +
      (falhas > 0 ? ` ${falhas} não puderam ser consultadas.` : "") +
      // Transparência: sem isto, um ressync interrompido pareceria completo.
      (loteStatus.esgotou
        ? ` Tempo esgotado: ${loteStatus.restantes} assinatura(s) ficaram para a próxima execução.`
        : ""),
  };
}
