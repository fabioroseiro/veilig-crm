import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Saúde das rotinas automáticas — webhook, cron diário e régua.
 *
 * Sem isso, uma falha só aparecia por sintoma: cliente reclamando de status
 * errado, número estranho no painel. Aqui ela aparece no dia.
 *
 * ── Os limites, e por quê ───────────────────────────────────────────────
 *
 * CRON: roda uma vez ao dia. Mais de 26 horas sem sucesso é atraso de verdade
 * (24h + folga de agendamento). Execução iniciada há mais de 1 hora e nunca
 * concluída é interrupção — já aconteceu, em silêncio.
 *
 * WEBHOOK: com poucos clientes, dias sem evento podem ser normais. Por isso só
 * alerta depois de 7 dias. A Asaas pausa a fila após 15 falhas e não reenvia
 * sozinha — esse silêncio prolongado é o sintoma.
 */

type Nivel = "ok" | "atencao" | "erro";

const cores: Record<Nivel, { fundo: string; borda: string; rotulo: string }> = {
  ok: { fundo: "rgba(52,168,83,.08)", borda: "#34a853", rotulo: "Normal" },
  atencao: { fundo: "rgba(184,134,11,.10)", borda: "#b8860b", rotulo: "Atenção" },
  erro: { fundo: "rgba(211,51,51,.08)", borda: "#d33", rotulo: "Falha" },
};

function ha(data: Date | null): string {
  if (!data) return "nunca";
  const min = Math.floor((Date.now() - new Date(data).getTime()) / 60000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} dias`;
}

const horas = (d: Date | null) => (d ? (Date.now() - new Date(d).getTime()) / 36e5 : Infinity);

export async function SaudeSistema() {
  let s: any = null;
  try {
    const r = await db.execute(sql`SELECT * FROM saude_sistema()`);
    s = (Array.isArray(r) ? r : (r as any).rows)[0] ?? null;
  } catch (e: any) {
    // Sem a migração, o quadro diz isso em vez de sumir: um monitor que some
    // em silêncio é pior que nenhum.
    return (
      <div className="banner banner-error" style={{ marginBottom: 16 }}>
        Monitoramento indisponível: {String(e?.message ?? "erro")}. Confira se a
        migração MIGRAR_MONITORAMENTO.sql rodou neste ambiente.
      </div>
    );
  }

  // ── Cron diário ──
  let cron: { nivel: Nivel; texto: string };
  if (!s?.ultimo_cron_inicio) {
    cron = { nivel: "atencao", texto: "Nenhuma execução registrada ainda. A primeira ocorre na próxima madrugada." };
  } else if (!s.ultimo_cron_fim && horas(s.ultimo_cron_inicio) > 1) {
    cron = { nivel: "erro", texto: `Iniciou ${ha(s.ultimo_cron_inicio)} e não terminou — provavelmente foi interrompido.` };
  } else if (s.ultimo_cron_ok === false) {
    cron = { nivel: "erro", texto: `Falhou ${ha(s.ultimo_cron_fim)}: ${s.ultimo_cron_erro ?? "sem detalhe"}` };
  } else if (horas(s.ultimo_cron_sucesso) > 26) {
    cron = { nivel: "erro", texto: `Último sucesso ${ha(s.ultimo_cron_sucesso)}. Deveria rodar todo dia.` };
  } else if (s.ultimo_cron_erro) {
    cron = { nivel: "atencao", texto: `Rodou ${ha(s.ultimo_cron_fim)}, com erro parcial: ${s.ultimo_cron_erro}` };
  } else {
    cron = { nivel: "ok", texto: `Rodou ${ha(s.ultimo_cron_fim)}. ${s.ultimo_cron_resumo ?? ""}` };
  }

  // ── Webhook ──
  let webhook: { nivel: Nivel; texto: string };
  if (!s?.ultimo_webhook) {
    webhook = { nivel: "atencao", texto: "Nenhum evento recebido da Asaas até agora." };
  } else if (horas(s.ultimo_webhook) > 24 * 7) {
    webhook = {
      nivel: "atencao",
      texto: `Último evento ${ha(s.ultimo_webhook)}. Confira no painel da Asaas se a fila de webhooks não foi pausada.`,
    };
  } else {
    webhook = {
      nivel: "ok",
      texto: `Último evento ${ha(s.ultimo_webhook)} · ${s.webhooks_24h} nas últimas 24 h · ${s.webhooks_7d} em 7 dias.`,
    };
  }

  // ── Pendências da régua ──
  const pend = Number(s?.pendencias_exclusao ?? 0);
  const regua: { nivel: Nivel; texto: string } =
    pend > 0
      ? { nivel: "erro", texto: `${pend} cobrança(s) precisam ser apagadas à mão na Asaas.` }
      : { nivel: "ok", texto: "Nenhuma cobrança pendente de exclusão." };

  const itens = [
    { titulo: "Rotina diária (ressync e régua)", ...cron },
    { titulo: "Webhook da Asaas", ...webhook },
    { titulo: "Exclusões de cobrança", ...regua },
  ];

  return (
    <>
      <div className="section-label" style={{ marginTop: 8 }}>Saúde do sistema</div>
      <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
        {itens.map((i) => {
          const c = cores[i.nivel];
          return (
            <div
              key={i.titulo}
              style={{
                background: c.fundo,
                borderLeft: `3px solid ${c.borda}`,
                borderRadius: 6,
                padding: "10px 14px",
                fontSize: 14,
              }}
            >
              <strong>{i.titulo}</strong>{" "}
              <span style={{ color: c.borda, fontWeight: 600 }}>· {c.rotulo}</span>
              <div style={{ marginTop: 2 }}>{i.texto}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
