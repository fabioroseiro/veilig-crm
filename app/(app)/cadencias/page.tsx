import Link from "next/link";
import { q, q1 } from "@/lib/db";
import { porte } from "@/lib/regras";
import { envioReal } from "@/lib/correio";
import { janelaDeEnvio } from "@/lib/cadencia";
import { PLANO_FRIO } from "@/lib/plano";
import * as C from "@/lib/acoes-cadencia";
import { Elegiveis } from "@/components/Elegiveis";
import { FormAcao, Enviar } from "@/components/FormAcao";
import { BotaoAcao } from "@/components/Seletor";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { fila: "Na fila", enviado: "Enviado", erro: "Erro", devolvido: "Voltou", cancelado: "Cancelado", simulado: "Simulado" };

export default async function Cadencias() {
  const cfg = Object.fromEntries((await q<{ chave: string; valor: unknown }>("SELECT chave, valor FROM config WHERE chave IN ('envio_ativo','limite_diario','remetente')")).map((l) => [l.chave, l.valor]));
  const ativo = cfg.envio_ativo === true;
  const limite = Number(cfg.limite_diario ?? 15);
  const remetente = (cfg.remetente as { email: string; nome: string })?.email;

  const [kpi] = await q<{ ativas: string; pausa: string; fila: string; hoje: string; resp7: string; devolvidos: string; erros: string }>(
    `SELECT (SELECT count(*) FROM cadencia WHERE status='ativa') AS ativas,
            (SELECT count(*) FROM cadencia WHERE status='pausa') AS pausa,
            (SELECT count(*) FROM envio WHERE status='fila') AS fila,
            (SELECT count(*) FROM envio WHERE status IN ('enviado','simulado') AND (enviado_em AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS hoje,
            (SELECT count(*) FROM atividade WHERE resumo LIKE 'Respondeu ao e-mail%' AND em > now() - interval '7 days') AS resp7,
            (SELECT count(*) FROM envio WHERE status='devolvido') AS devolvidos,
            (SELECT count(*) FROM envio WHERE status='erro') AS erros`);
  const pendentes = await q1<{ n: string }>("SELECT count(*) AS n FROM modelo_email WHERE NOT aprovado");

  // Descadastros: quem pediu para sair, como pediu e qual foi o último e-mail que recebeu antes disso.
  const saidas = await q<{ grupo_id: string; nome: string; contato: string | null; email: string; quando: string | null; como: string; toque: number | null }>(
    `SELECT g.id AS grupo_id, g.nome, c.nome AS contato, c.email,
            to_char(a.em AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI') AS quando,
            CASE WHEN a.resumo ILIKE '%link%' THEN 'Link do e-mail' WHEN a.resumo IS NULL THEN 'Não registrado' ELSE 'Respondeu pedindo para sair' END AS como,
            (SELECT e.toque FROM envio e WHERE e.contato_id = c.id AND e.status IN ('enviado','simulado')
               AND (a.em IS NULL OR e.enviado_em <= a.em) ORDER BY e.enviado_em DESC LIMIT 1) AS toque
       FROM contato c JOIN grupo g ON g.id = c.grupo_id
       LEFT JOIN LATERAL (SELECT em, resumo FROM atividade WHERE grupo_id = g.id AND tipo = 'email'
                            AND resumo ILIKE '%não receber e-mails%' ORDER BY em DESC LIMIT 1) a ON true
      WHERE c.email_status = 'descadastrado'
      ORDER BY a.em DESC NULLS LAST LIMIT 200`);
  const alcancados = await q1<{ n: string }>("SELECT count(DISTINCT contato_id) AS n FROM envio WHERE status IN ('enviado','simulado')");
  const taxaSaida = Number(alcancados?.n) ? (saidas.length / Number(alcancados?.n)) * 100 : 0;
  const porToque = saidas.reduce<Record<string, number>>((m, x) => { const k = x.toque ? String(x.toque) : "?"; m[k] = (m[k] || 0) + 1; return m; }, {});
  const caixa = await q1<{ lido_em: string | null }>("SELECT lido_em FROM caixa_estado WHERE caixa=$1", [remetente]);

  const elegiveis = await q<{ id: string; nome: string; num_lojas: number; contato: string | null; email: string; origem: string | null }>(
    `SELECT g.id, g.nome, g.num_lojas, c.nome AS contato, c.email, g.origem FROM grupo g
       JOIN contato c ON c.grupo_id = g.id AND c.principal AND c.email_status = 'ok'
      WHERE g.situacao='ativo' AND g.temperatura='frio' AND NOT g.estrategico AND g.etapa <= 2
        AND NOT EXISTS (SELECT 1 FROM cadencia k WHERE k.grupo_id = g.id AND k.status IN ('ativa','pausa','concluida'))
      ORDER BY g.num_lojas DESC, g.nome`);
  const ativas = await q<{ grupo_id: string; nome: string; porte: "A" | "B" | "C"; passo: number; ciclo: number; proximo_em: string | null; status: string; retomar_em: string | null; motivo: string | null }>(
    `SELECT k.grupo_id, g.nome, k.porte, k.passo, k.ciclo, to_char(k.proximo_em,'DD/MM') AS proximo_em, k.status, to_char(k.retomar_em,'DD/MM/YYYY') AS retomar_em, k.motivo
       FROM cadencia k JOIN grupo g ON g.id=k.grupo_id WHERE k.status IN ('ativa','pausa') ORDER BY k.proximo_em NULLS LAST, g.nome LIMIT 300`);
  const envios = await q<{ id: string; grupo_id: string; nome: string; para: string; assunto: string; status: string; erro: string | null; quando: string; toque: number | null }>(
    `SELECT e.id, e.grupo_id, g.nome, e.para, e.assunto, e.status, e.erro, e.toque,
            to_char(COALESCE(e.enviado_em, e.criado_em) AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI') AS quando
       FROM envio e JOIN grupo g ON g.id=e.grupo_id ORDER BY COALESCE(e.enviado_em, e.criado_em) DESC LIMIT 60`);

  return (
    <>
      <div className="topo">
        <div><h1>Cadências</h1><div className="muted">Cadência Frio por e-mail, enviada pela caixa {remetente}.</div></div>
        <FormAcao acao={async () => { "use server"; return C.rodarAgora(); }}><Enviar className="btn">Rodar agora</Enviar></FormAcao>
      </div>

      {!envioReal() && <div className="aviso atencao">Modo simulação: a variável ZOHO_SENHA_NATALIA não está configurada. Os e-mails são registrados como "simulado" e nada sai de verdade.</div>}
      {Number(pendentes?.n) > 0 && <div className="aviso atencao">{pendentes?.n} modelo(s) de e-mail ainda sem aprovação. Os leads que chegarem nesses toques ficam esperando. <Link href="/modelos">Ver modelos</Link></div>}

      <div className="caixa" style={{ marginBottom: 16, borderColor: ativo ? "var(--ok)" : "var(--line)" }}>
        <div className="linha" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0 }}>Envio automático: {ativo ? <span style={{ color: "var(--ok)" }}>ligado</span> : <span className="alerta">desligado</span>}</h2>
            <div className="muted" style={{ fontSize: 13 }}>
              Dias úteis, das 8h às 18h, até {limite} e-mails por dia, espaçados em rodadas a cada 20 minutos.
              {ativo && !janelaDeEnvio() ? " Agora está fora do horário de envio." : ""}
              {caixa?.lido_em ? ` Caixa lida pela última vez em ${new Date(caixa.lido_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.` : ""}
            </div>
          </div>
          <BotaoAcao className={`btn ${ativo ? "btn-perigo" : "btn-ink"}`} acao={C.ligarEnvio.bind(null, !ativo)}
            confirmar={ativo ? "Desligar o envio automático? Nada mais sai até ligar de novo." : "Ligar o envio automático? Os e-mails das cadências ativas começam a sair na próxima rodada."}>
            {ativo ? "Desligar" : "Ligar envio automático"}
          </BotaoAcao>
        </div>
        <FormAcao acao={C.salvarEnvio} className="linha">
          <label className="campo" style={{ margin: "12px 0 0" }}><span>Limite de e-mails por dia (comece com 15 e aumente aos poucos)</span>
            <input name="limite_diario" type="number" min={1} max={80} defaultValue={limite} style={{ width: 120 }} /></label>
          <div style={{ alignSelf: "flex-end" }}><Enviar className="btn btn-mini">Salvar limite</Enviar></div>
        </FormAcao>
      </div>

      <div className="grade" style={{ marginBottom: 16, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <div className="caixa kpi"><div className="k">Cadências ativas</div><div className="v num">{kpi.ativas}</div><div className="k">{kpi.pausa} em pausa</div></div>
        <div className="caixa kpi"><div className="k">E-mails hoje</div><div className="v num">{kpi.hoje} / {limite}</div><div className="k">{kpi.fila} na fila</div></div>
        <div className="caixa kpi"><div className="k">Respostas (7 dias)</div><div className="v num">{kpi.resp7}</div></div>
        <div className="caixa kpi"><div className="k">Descadastros</div><div className={`v num ${taxaSaida >= 2 ? "alerta" : ""}`}>{saidas.length}</div><div className="k">{taxaSaida.toFixed(1).replace(".", ",")}% de quem recebeu e-mail</div></div>
        <div className="caixa kpi"><div className="k">Voltaram / erros</div><div className={`v num ${Number(kpi.devolvidos) + Number(kpi.erros) ? "alerta" : ""}`}>{kpi.devolvidos} / {kpi.erros}</div></div>
      </div>

      <div className="caixa" style={{ marginBottom: 16 }}>
        <h2>Leads prontos para a cadência Frio ({elegiveis.length})</h2>
        <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>Frios, em Lead ou Contato feito, não estratégicos, com e-mail válido no contato principal e sem cadência anterior.</p>
        <Elegiveis leads={elegiveis.map((l) => ({ id: l.id, nome: l.nome, porte: porte(l.num_lojas), lojas: l.num_lojas, contato: l.contato, email: l.email, origem: l.origem }))}
          iniciar={C.iniciarSelecionados} />
      </div>

      <div className="caixa" style={{ marginBottom: 16 }}>
        <h2>Em andamento ({ativas.length})</h2>
        <div className="rolagem" style={{ maxHeight: 420, overflowY: "auto" }}>
          <table>
            <thead><tr><th>Grupo</th><th>Porte</th><th>Próximo toque</th><th>Quando</th><th>Observação</th><th></th></tr></thead>
            <tbody>{ativas.map((a) => {
              const p = PLANO_FRIO[a.porte][a.passo];
              return (
                <tr key={a.grupo_id}>
                  <td><Link href={`/grupos/${a.grupo_id}`}>{a.nome}</Link>{a.ciclo === 2 && <span className="tag" style={{ marginLeft: 6 }}>2º ciclo</span>}</td>
                  <td>{a.porte}</td>
                  <td>{a.status === "pausa" ? "Pausa" : p ? `${p.toque} · ${p.canal === "email" ? "e-mail" : p.canal === "ligacao" ? "ligação" : p.canal === "whatsapp" ? "WhatsApp" : "e-mail ou WhatsApp"}` : "—"}</td>
                  <td>{a.status === "pausa" ? `retoma ${a.retomar_em}` : a.proximo_em}</td>
                  <td className="alerta" style={{ fontSize: 13 }}>{a.motivo ?? ""}</td>
                  <td><BotaoAcao className="btn btn-mini btn-perigo" confirmar="Parar a cadência deste lead?" acao={C.pararUm.bind(null, a.grupo_id)}>Parar</BotaoAcao></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </div>

      <div className="caixa" style={{ marginBottom: 16 }}>
        <h2>Pediram para não receber e-mails ({saidas.length})</h2>
        {saidas.length === 0 ? <p className="muted">Ninguém se descadastrou até agora.</p> : (
          <>
            <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>
              Último e-mail recebido antes de sair: {Object.entries(porToque).sort((a, b) => Number(a[0]) - Number(b[0])).map(([t, n]) => `toque ${t}: ${n}`).join(" · ")}.
              Uma concentração num mesmo toque indica que aquele texto merece revisão. Acima de 2% de quem recebeu, vale olhar com atenção.
            </p>
            <div className="rolagem" style={{ maxHeight: 360, overflowY: "auto" }}>
              <table>
                <thead><tr><th>Quando</th><th>Grupo</th><th>Contato</th><th>Como pediu</th><th>Último toque recebido</th></tr></thead>
                <tbody>{saidas.map((x) => (
                  <tr key={x.grupo_id + x.email}>
                    <td className="num">{x.quando ?? "—"}</td>
                    <td><Link href={`/grupos/${x.grupo_id}`}>{x.nome}</Link></td>
                    <td style={{ fontSize: 13 }}>{x.contato ?? "—"}<div className="muted">{x.email}</div></td>
                    <td>{x.como}</td>
                    <td>{x.toque ? `Toque ${x.toque}` : "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="caixa">
        <h2>Últimos e-mails</h2>
        <div className="rolagem">
          <table>
            <thead><tr><th>Quando</th><th>Grupo</th><th>Para</th><th>Assunto</th><th>Situação</th><th></th></tr></thead>
            <tbody>{envios.map((e) => (
              <tr key={e.id}>
                <td className="num">{e.quando}</td>
                <td><Link href={`/grupos/${e.grupo_id}`}>{e.nome}</Link></td>
                <td style={{ fontSize: 13 }}>{e.para}</td>
                <td style={{ fontSize: 13 }}>{e.toque ? `${e.toque}. ` : ""}{e.assunto}</td>
                <td className={e.status === "erro" || e.status === "devolvido" ? "alerta" : ""}>{STATUS[e.status]}{e.erro ? <div style={{ fontSize: 12 }}>{e.erro}</div> : null}</td>
                <td>{e.status === "erro" && <BotaoAcao acao={C.reenviar.bind(null, e.id)}>Tentar de novo</BotaoAcao>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </>
  );
}
