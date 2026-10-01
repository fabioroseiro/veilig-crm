import { q, q1 } from "@/lib/db";
import { ETAPAS, hojeISO, somaDias } from "@/lib/regras";
import { planoDe, NOME_CADENCIA, PAUSA_DIAS, type Passo, type TipoCadencia } from "@/lib/plano";

/**
 * "Onde estamos com este lead": etapa do funil, os toques do ciclo atual da cadência
 * (feitos, o próximo e os que vêm depois, com datas) e a ordem dos contatos no rodízio.
 * Só leitura: os controles continuam nos blocos de cadência, contatos e tarefas.
 */

type Cad = { id: string; tipo: TipoCadencia; status: string; porte: "A" | "B" | "C"; passo: number; ciclo: number;
  proximo_em: string | null; retomar_em: string | null; motivo: string | null };
type Envio = { chave: string; status: string; contato_id: string | null; quando: string };
type Tarefa = { titulo: string; feita_em: string | null; resultado: string | null; quando: string };
type ContatoJ = { id: string; nome: string | null; email: string | null; email_status: string; principal: boolean; primeiro_envio: string | null };

const CANAL: Record<string, string> = { email: "E-mail", ligacao: "Ligação", whatsapp: "WhatsApp", email_ou_whatsapp: "E-mail ou WhatsApp" };
const ddmm = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().slice(0, 2).join("/") : "");
const STATUS_ENVIO: Record<string, { txt: string; cls: string }> = {
  enviado: { txt: "enviado", cls: "feito" }, simulado: { txt: "simulado", cls: "feito" }, fila: { txt: "na fila", cls: "atual" },
  devolvido: { txt: "voltou", cls: "falha" }, erro: { txt: "erro", cls: "falha" }, cancelado: { txt: "cancelado", cls: "pulado" },
};

export async function Jornada({ grupoId, etapa }: { grupoId: string; etapa: number }) {
  const cad = await q1<Cad>(
    `SELECT id, tipo, status, porte, passo, ciclo, to_char(proximo_em,'YYYY-MM-DD') AS proximo_em, to_char(retomar_em,'YYYY-MM-DD') AS retomar_em, motivo
       FROM cadencia WHERE grupo_id=$1 ORDER BY criado_em DESC LIMIT 1`, [grupoId]);
  const [envios, tarefas, contatos, propostas] = await Promise.all([
    cad ? q<Envio>(`SELECT chave, status, contato_id, to_char(coalesce(enviado_em, criado_em) AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS quando
                      FROM envio WHERE cadencia_id=$1 ORDER BY criado_em`, [cad.id]) : Promise.resolve([] as Envio[]),
    q<Tarefa>(`SELECT titulo, to_char(feita_em AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS feita_em, resultado,
                      to_char(criado_em AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS quando
                 FROM tarefa WHERE grupo_id=$1 AND titulo LIKE 'Toque % da cadência%' ORDER BY criado_em`, [grupoId]),
    q<ContatoJ>(`SELECT c.id, c.nome, c.email, c.email_status, c.principal,
                        (SELECT to_char(min(e.criado_em) AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') FROM envio e
                          WHERE e.contato_id=c.id AND e.chave IN ('frio_1','frio_1_ciclo2') AND e.status IN ('fila','enviado','simulado')) AS primeiro_envio
                   FROM contato c WHERE c.grupo_id=$1 ORDER BY c.criado_em, c.id`, [grupoId]),
    q<{ numero: string; status: string; aberturas: number }>("SELECT numero, status, aberturas FROM proposta WHERE grupo_id=$1 AND status <> 'cancelada' ORDER BY criado_em DESC LIMIT 1", [grupoId]),
  ]);
  const hoje = hojeISO();
  const principal = contatos.find((c) => c.principal) ?? null;

  // ---------- Toques do ciclo atual
  let resumo = "Sem cadência automática neste lead.";
  let passos: { p: Passo; estado: string; detalhe: string }[] = [];
  if (cad) {
    const plano = planoDe(cad.tipo, cad.porte);
    const nome = NOME_CADENCIA[cad.tipo];
    const doContato = (c: string) => envios.filter((e) => e.contato_id === principal?.id && (e.chave === c || (c === "frio_1" && e.chave === "frio_1_ciclo2"))).at(-1);
    const tarefaDo = (t: number) => tarefas.filter((x) => x.titulo.startsWith(`Toque ${t} da cadência`)).at(-1);
    passos = plano.map((p, i) => {
      // Em pausa, o principal já é o contato do próximo ciclo: mostra o ciclo que vem, com datas estimadas.
      if (cad.status === "pausa") return { p, estado: "futuro", detalhe: cad.retomar_em ? `~${ddmm(somaDias(cad.retomar_em, p.dia))}` : "" };
      if (i < cad.passo) {
        if (p.canal === "ligacao" || p.canal === "whatsapp") {
          const t = tarefaDo(p.toque);
          return t?.feita_em ? { p, estado: "feito", detalhe: `feito ${ddmm(t.feita_em)}` } : t ? { p, estado: "pendente", detalhe: `pendente desde ${ddmm(t.quando)}` } : { p, estado: "pulado", detalhe: "sem registro" };
        }
        const e = doContato(p.chave!);
        if (!e) {
          const t = p.canal === "email_ou_whatsapp" ? tarefaDo(p.toque) : undefined;
          return t ? { p, estado: t.feita_em ? "feito" : "pendente", detalhe: t.feita_em ? `WhatsApp ${ddmm(t.feita_em)}` : "WhatsApp pendente" } : { p, estado: "pulado", detalhe: "não enviado" };
        }
        const s = STATUS_ENVIO[e.status] ?? { txt: e.status, cls: "feito" };
        return { p, estado: s.cls, detalhe: `${s.txt} ${ddmm(e.quando)}` };
      }
      if (cad.status === "ativa" && i === cad.passo) return { p, estado: "atual", detalhe: cad.proximo_em ? (cad.proximo_em <= hoje ? "hoje" : ddmm(cad.proximo_em)) : "" };
      if (cad.status === "ativa" && cad.proximo_em) {
        return { p, estado: "futuro", detalhe: `~${ddmm(somaDias(cad.proximo_em, p.dia - plano[cad.passo].dia))}` };
      }
      return { p, estado: cad.status === "ativa" ? "futuro" : "pulado", detalhe: "" };
    });
    const quem = principal ? (principal.nome || principal.email || "contato principal") : "sem contato principal";
    resumo =
      cad.status === "ativa" ? `Cadência ${nome} em andamento com ${quem}${cad.ciclo >= 2 ? ` · ${cad.ciclo}º ciclo` : ""} · toque ${Math.min(cad.passo + 1, plano.length)} de ${plano.length}`
      : cad.status === "pausa" && cad.ciclo === 0 ? `Cadência Frio agendada: começa em ${ddmm(cad.retomar_em)}, depois do Morno`
      : cad.status === "pausa" ? `Ciclo ${cad.ciclo} concluído sem resposta. Pausa de ${PAUSA_DIAS[cad.porte]} dias: novo ciclo com ${quem} em ${ddmm(cad.retomar_em)}`
      : cad.status === "concluida" ? `Cadência ${nome} concluída`
      : `Cadência ${nome} parada${cad.motivo ? `: ${cad.motivo}` : ""}`;
  }

  // ---------- Ordem dos contatos (rodízio da Frio)
  const tentados = contatos.filter((c) => c.primeiro_envio && !c.principal).sort((a, b) => a.primeiro_envio!.localeCompare(b.primeiro_envio!));
  const fila = contatos.filter((c) => !c.primeiro_envio && !c.principal && c.email && c.email_status === "ok");
  const fora = contatos.filter((c) => !c.principal && !c.primeiro_envio && !(c.email && c.email_status === "ok"));
  const motivoFora: Record<string, string> = { ausente: "sem e-mail", corrigir: "e-mail a corrigir", devolvido: "e-mail voltou", descadastrado: "pediu para sair" };
  const nomeC = (c: ContatoJ) => c.nome || c.email || "Sem nome";

  return (
    <div className="caixa jornada">
      <div className="linha" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0 }}>Onde estamos</h2>
        {propostas[0] && <span className="muted" style={{ fontSize: 13 }}>Proposta {propostas[0].numero}: {propostas[0].status === "aceita" ? "aceita" : propostas[0].status === "prazo_pedido" ? "pediu mais prazo" : propostas[0].status === "enviada" ? `enviada${propostas[0].aberturas ? `, aberta ${propostas[0].aberturas}×` : ", ainda não aberta"}` : "rascunho"}</span>}
      </div>

      <ol className="j-funil" aria-label="Etapa do funil">
        {Object.entries(ETAPAS).map(([n, e]) => {
          const k = Number(n);
          return <li key={n} className={k < etapa ? "feito" : k === etapa ? "atual" : ""}>{e.nome}</li>;
        })}
      </ol>

      <p className="j-resumo">{resumo}</p>
      {passos.length > 0 && (
        <ol className="j-toques" aria-label="Toques do ciclo atual">
          {passos.map(({ p, estado, detalhe }) => (
            <li key={p.toque} className={`j-toque ${estado}`} title={p.titulo ?? CANAL[p.canal]}>
              <span className="n">{p.toque}</span>
              <span className="c">{CANAL[p.canal]}</span>
              <span className="d">{detalhe}</span>
            </li>
          ))}
        </ol>
      )}

      {cad?.tipo === "frio" && contatos.length > 1 && (
        <div className="j-contatos">
          <span className="muted">Contatos:</span>
          {tentados.map((c) => <span key={c.id} className="j-pessoa feito" title={`Recebeu a cadência a partir de ${ddmm(c.primeiro_envio)}`}>{nomeC(c)} <small>já tentado</small></span>)}
          {principal && <span className="j-pessoa atual">{nomeC(principal)} <small>agora</small></span>}
          {fila.map((c, i) => <span key={c.id} className="j-pessoa">{nomeC(c)} <small>{i === 0 ? "próximo" : "na fila"}</small></span>)}
          {fora.map((c) => <span key={c.id} className="j-pessoa fora">{nomeC(c)} <small>{motivoFora[c.email_status] ?? "fora do rodízio"}</small></span>)}
        </div>
      )}
    </div>
  );
}
