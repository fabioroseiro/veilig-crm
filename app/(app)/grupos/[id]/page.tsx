import Link from "next/link";
import { notFound } from "next/navigation";
import { q, q1 } from "@/lib/db";
import { lerConfig } from "@/lib/config";
import * as A from "@/lib/acoes";
import { ETAPAS, PACOTES, SEGMENTOS, TEMPERATURAS, TIPOS_TAREFA, brl, dataBR, diasDesde, hojeISO, linkWhatsApp, ponderado, porte, potencial, preencher } from "@/lib/regras";
import { FormAcao, Enviar } from "@/components/FormAcao";
import { Seletor, BotaoAcao } from "@/components/Seletor";

export const dynamic = "force-dynamic";

type Grupo = { id: string; nome: string; tipo: string; origem: string | null; origem_interna: string | null; segmento: string | null;
  marcas: string | null; num_lojas: number; entregas_mes: number | null; etapa: number; situacao: string; pausado_ate: string | null;
  perdido_motivo: string | null; temperatura: string; estrategico: boolean; responsavel_id: string | null; pacote: string;
  ultimo_sinal: string | null; diagnostico: Record<string, string | null>; observacoes: string | null; criado_em: string };
type Contato = { id: string; nome: string | null; cargo: string | null; email: string | null; email_status: string; email_sugestao: string | null;
  whatsapp: string | null; telefone: string | null; principal: boolean };

const STATUS_EMAIL: Record<string, string> = { ok: "", corrigir: "e-mail com erro", ausente: "sem e-mail", devolvido: "e-mail voltou", descadastrado: "pediu para sair" };
const TIPOS_ATIV: Record<string, string> = { nota: "Nota", whatsapp: "WhatsApp", ligacao: "Ligação", email: "E-mail", reuniao: "Reunião", etapa: "Etapa", temperatura: "Temperatura", sistema: "Sistema" };

export default async function Ficha({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const g = await q1<Grupo>("SELECT *, to_char(pausado_ate,'YYYY-MM-DD') AS pausado_ate FROM grupo WHERE id=$1", [id]);
  if (!g) notFound();
  const [contatos, lojas, atividades, tarefas, usuarios, cfg] = await Promise.all([
    q<Contato>("SELECT * FROM contato WHERE grupo_id=$1 ORDER BY principal DESC, criado_em", [id]),
    q<{ id: string; nome_fantasia: string | null; razao_social: string | null; cidade: string | null; uf: string | null }>(
      "SELECT id, nome_fantasia, razao_social, cidade, uf FROM loja WHERE grupo_id=$1 ORDER BY uf, cidade", [id]),
    q<{ id: string; tipo: string; resumo: string; detalhe: string | null; em: string; usuario: string | null }>(
      "SELECT a.id, a.tipo, a.resumo, a.detalhe, a.em, u.nome AS usuario FROM atividade a LEFT JOIN usuario u ON u.id=a.usuario_id WHERE a.grupo_id=$1 ORDER BY a.em DESC LIMIT 150", [id]),
    q<{ id: string; tipo: string; titulo: string; texto: string | null; vence_em: string; usuario: string | null }>(
      "SELECT t.id, t.tipo, t.titulo, t.texto, to_char(t.vence_em,'YYYY-MM-DD') AS vence_em, u.nome AS usuario FROM tarefa t LEFT JOIN usuario u ON u.id=t.usuario_id WHERE t.grupo_id=$1 AND t.feita_em IS NULL ORDER BY t.vence_em", [id]),
    q<{ id: string; nome: string }>("SELECT id, nome FROM usuario ORDER BY nome"),
    lerConfig(),
  ]);
  const pot = potencial(g.num_lojas, g.pacote, cfg.precos, cfg.lojas_piloto);
  const pond = ponderado(pot, g.etapa, g.situacao);
  const temp = TEMPERATURAS[g.temperatura as keyof typeof TEMPERATURAS];
  const principal = contatos.find((c) => c.principal) ?? contatos[0];
  const hoje = hojeISO();
  const d = g.diagnostico || {};
  const dias = diasDesde(g.ultimo_sinal);

  return (
    <>
      <div className="topo">
        <div>
          <div className="muted" style={{ fontSize: 13 }}><Link href="/funil">Funil</Link> / {ETAPAS[g.etapa].nome}</div>
          <h1>{g.nome}</h1>
          <div className="linha">
            <span className="tag porte">Porte {porte(g.num_lojas)} · {g.num_lojas} loja{g.num_lojas > 1 ? "s" : ""}</span>
            <span className="temp"><i style={{ background: temp.cor }} />{temp.nome}</span>
            {g.estrategico && <span className="tag estr">Cliente Estratégico</span>}
            {g.situacao === "pausado" && <span className="tag">Pausado até {dataBR(g.pausado_ate + "T12:00:00")}</span>}
            {g.situacao === "perdido" && <span className="tag">Perdido</span>}
            <span className="muted" style={{ fontSize: 13 }}>{dias == null ? "Ainda sem resposta" : `Último sinal há ${dias} dia${dias === 1 ? "" : "s"}`}</span>
          </div>
        </div>
        <div className="caixa kpi" style={{ padding: "10px 16px" }}>
          <div className="k">Potencial recorrente ({PACOTES[g.pacote]})</div>
          <div className="v num">{brl(pot)}<span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>/mês</span></div>
          <div className="k">Ponderado: {brl(pond)}{porte(g.num_lojas) === "A" ? ` · piloto de ${Math.min(cfg.lojas_piloto, g.num_lojas)} lojas` : ""}</div>
        </div>
      </div>

      <div className="ficha">
        <div className="grade">
          <div className="caixa">
            <h2>Situação</h2>
            <div className="grade g3">
              <Seletor rotulo="Etapa" valor={String(g.etapa)} acao={async (v) => { "use server"; await A.mudarEtapa(id, Number(v)); }}
                opcoes={Object.entries(ETAPAS).map(([k, e]) => ({ v: k, nome: `${k}. ${e.nome}` }))} />
              <Seletor rotulo="Temperatura" valor={g.temperatura} acao={async (v) => { "use server"; await A.mudarTemperatura(id, v); }}
                opcoes={Object.entries(TEMPERATURAS).map(([k, t]) => ({ v: k, nome: t.nome }))} />
              <Seletor rotulo="Responsável" valor={g.responsavel_id ?? ""} acao={async (v) => { "use server"; await A.mudarResponsavel(id, v); }}
                opcoes={[...(g.responsavel_id ? [] : [{ v: "", nome: "—" }]), ...usuarios.map((u) => ({ v: u.id, nome: u.nome }))]} />
            </div>
            <div className="linha">
              <BotaoAcao acao={A.alternarEstrategico.bind(null, id)}>{g.estrategico ? "Tirar de Estratégico" : "Marcar como Estratégico"}</BotaoAcao>
              {g.situacao !== "ativo" && <BotaoAcao className="btn btn-mini btn-ink" acao={A.reativar.bind(null, id)}>Reativar lead</BotaoAcao>}
            </div>
            {g.situacao === "perdido" && <div className="aviso atencao">Motivo da perda: {g.perdido_motivo}</div>}
            {g.situacao === "ativo" && (
              <div className="grade g2" style={{ marginTop: 14 }}>
                <details><summary className="btn btn-mini">Pausar até uma data</summary>
                  <form action={A.pausar.bind(null, id)} className="caixa" style={{ marginTop: 8 }}>
                    <label className="campo"><span>Retomar em</span><input type="date" name="ate" min={hoje} required /></label>
                    <label className="campo"><span>Motivo (opcional)</span><input name="motivo" placeholder="Ex.: pediu retorno depois do fechamento do mês" /></label>
                    <button className="btn btn-ink btn-mini" type="submit">Pausar</button>
                  </form>
                </details>
                <details><summary className="btn btn-mini btn-perigo">Marcar como perdido</summary>
                  <form action={A.perder.bind(null, id)} className="caixa" style={{ marginTop: 8 }}>
                    <label className="campo"><span>Motivo (obrigatório)</span><input name="motivo" required placeholder="Perda sem motivo não ensina nada" /></label>
                    <button className="btn btn-mini btn-perigo" type="submit">Confirmar perda</button>
                  </form>
                </details>
              </div>
            )}
          </div>

          <div className="caixa">
            <h2>Registrar um toque</h2>
            <FormAcao acao={A.registrarToque.bind(null, id)} limpar>
              <div className="grade g3">
                <label className="campo"><span>Canal</span>
                  <select name="tipo" defaultValue="whatsapp"><option value="whatsapp">WhatsApp</option><option value="ligacao">Ligação</option><option value="email">E-mail</option><option value="reuniao">Reunião</option><option value="nota">Nota</option></select>
                </label>
              </div>
              <label className="campo"><span>O que aconteceu?</span><textarea name="resumo" required /></label>
              <label className="check" style={{ marginBottom: 10 }}><input type="checkbox" name="respondeu" /> O lead respondeu (atualiza o último sinal e volta para Quente)</label>
              <Enviar>Registrar</Enviar>
            </FormAcao>
          </div>

          <div className="caixa">
            <h2>Próxima ação</h2>
            <FormAcao acao={A.criarTarefa.bind(null, id)} limpar>
              <div className="grade g3">
                <label className="campo"><span>Canal</span>
                  <select name="tipo" defaultValue="whatsapp"><option value="whatsapp">WhatsApp</option><option value="ligacao">Ligação</option><option value="email">E-mail</option><option value="outro">Outra ação</option></select>
                </label>
                <label className="campo"><span>Quando</span><input type="date" name="vence_em" defaultValue={hoje} min={hoje} /></label>
                <label className="campo"><span>Quem</span>
                  <select name="usuario_id" defaultValue={g.responsavel_id ?? ""}>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select>
                </label>
              </div>
              <label className="campo"><span>Ação</span><input name="titulo" required placeholder="Ex.: Confirmar agenda de terça" /></label>
              <label className="campo"><span>Mensagem pronta (opcional; aceita [Nome] e [Grupo])</span><textarea name="texto" /></label>
              <Enviar>Agendar</Enviar>
            </FormAcao>
          </div>

          <div className="caixa">
            <h2>Histórico</h2>
            <ul className="historico">
              {atividades.map((a) => (
                <li key={a.id}>
                  <div className="quando">{new Date(a.em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })} · {TIPOS_ATIV[a.tipo] ?? a.tipo}{a.usuario ? ` · ${a.usuario}` : ""}</div>
                  <div>{a.resumo}</div>
                  {a.detalhe && <div className="det">{a.detalhe}</div>}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grade">
          <div className="caixa">
            <h2>Contatos</h2>
            {contatos.map((c) => (
              <div key={c.id} className="contato">
                <div className="linha" style={{ justifyContent: "space-between" }}>
                  <div>
                    <strong>{c.nome || "Sem nome"}</strong>{c.principal && <span className="tag" style={{ marginLeft: 6 }}>principal</span>}
                    {c.cargo && <div className="muted" style={{ fontSize: 13 }}>{c.cargo}</div>}
                    <div style={{ fontSize: 13 }}>{c.email ?? <span className="muted">sem e-mail</span>}{STATUS_EMAIL[c.email_status] && c.email_status !== "ausente" && <span className="alerta"> · {STATUS_EMAIL[c.email_status]}</span>}</div>
                    <div style={{ fontSize: 13 }} className="muted">{c.telefone ?? ""}{c.telefone && !c.whatsapp ? " · sem WhatsApp válido" : ""}</div>
                  </div>
                  <div className="linha">
                    {c.whatsapp && <a className="btn btn-zap btn-mini" target="_blank" rel="noopener" href={linkWhatsApp(c.whatsapp)!}>WhatsApp</a>}
                  </div>
                </div>
                {c.email_sugestao && <div className="aviso atencao">Você quis dizer <strong>{c.email_sugestao}</strong>? <BotaoAcao acao={A.aplicarSugestaoEmail.bind(null, id, c.id)}>Corrigir</BotaoAcao></div>}
                <details style={{ marginTop: 6 }}>
                  <summary className="muted" style={{ fontSize: 13, cursor: "pointer" }}>Editar</summary>
                  <FormAcao acao={A.salvarContato.bind(null, id)}>
                    <input type="hidden" name="id" value={c.id} />
                    <div className="grade g2">
                      <label className="campo"><span>Nome</span><input name="nome" defaultValue={c.nome ?? ""} /></label>
                      <label className="campo"><span>Cargo</span><input name="cargo" defaultValue={c.cargo ?? ""} /></label>
                      <label className="campo"><span>E-mail</span><input name="email" type="email" defaultValue={c.email ?? ""} /></label>
                      <label className="campo"><span>Celular (com DDD)</span><input name="whatsapp" defaultValue={c.whatsapp ? `${c.whatsapp.slice(2, 4)} ${c.whatsapp.slice(4)}` : c.telefone ?? ""} /></label>
                    </div>
                    <div className="linha">
                      <Enviar>Salvar</Enviar>
                      {!c.principal && <BotaoAcao acao={A.definirPrincipal.bind(null, id, c.id)}>Tornar principal</BotaoAcao>}
                      <BotaoAcao className="btn btn-mini btn-perigo" confirmar="Remover este contato?" acao={A.removerContato.bind(null, id, c.id)}>Remover</BotaoAcao>
                    </div>
                  </FormAcao>
                </details>
              </div>
            ))}
            <details style={{ marginTop: 10 }}>
              <summary className="btn btn-mini">Adicionar contato</summary>
              <FormAcao acao={A.salvarContato.bind(null, id)} limpar>
                <div className="grade g2" style={{ marginTop: 10 }}>
                  <label className="campo"><span>Nome</span><input name="nome" required /></label>
                  <label className="campo"><span>Cargo</span><input name="cargo" /></label>
                  <label className="campo"><span>E-mail</span><input name="email" type="email" /></label>
                  <label className="campo"><span>Celular (com DDD)</span><input name="whatsapp" /></label>
                </div>
                <Enviar>Adicionar</Enviar>
              </FormAcao>
            </details>
          </div>

          <div className="caixa">
            <h2>Ações pendentes</h2>
            {tarefas.length === 0 ? <p className="alerta">Sem próxima ação agendada.</p> : tarefas.map((t) => {
              const texto = t.texto ? preencher(t.texto, { nome: principal?.nome, grupo: g.nome, origem: g.origem }) : null;
              return (
                <div key={t.id} className="contato">
                  <div><strong>{t.titulo}</strong></div>
                  <div className="muted" style={{ fontSize: 13 }}>{TIPOS_TAREFA[t.tipo]} · <span className={t.vence_em < hoje ? "vencida" : ""}>{dataBR(t.vence_em + "T12:00:00")}</span>{t.usuario ? ` · ${t.usuario}` : ""}</div>
                  {texto && <div className="msg" style={{ background: "var(--soft)", borderRadius: 8, padding: 8, fontSize: 13, whiteSpace: "pre-wrap", marginTop: 6 }}>{texto}</div>}
                  <div className="linha" style={{ marginTop: 6 }}>
                    {principal?.whatsapp && t.tipo === "whatsapp" && <a className="btn btn-zap btn-mini" target="_blank" rel="noopener" href={linkWhatsApp(principal.whatsapp, texto)!}>WhatsApp</a>}
                    <BotaoAcao acao={A.adiarTarefa.bind(null, t.id, 1)}>+1 dia</BotaoAcao>
                    <BotaoAcao className="btn btn-mini btn-perigo" confirmar="Excluir esta ação?" acao={A.excluirTarefa.bind(null, t.id)}>Excluir</BotaoAcao>
                    <Link className="btn btn-mini" href="/hoje">Concluir na tela Hoje</Link>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="caixa">
            <h2>Dados do grupo e diagnóstico</h2>
            <FormAcao acao={A.salvarGrupo.bind(null, id)}>
              <label className="campo"><span>Nome</span><input name="nome" defaultValue={g.nome} required /></label>
              <div className="grade g2">
                <label className="campo"><span>Tipo</span><input name="tipo" defaultValue={g.tipo} /></label>
                <label className="campo"><span>Segmento</span>
                  <select name="segmento" defaultValue={g.segmento ?? ""}><option value="">—</option>{Object.entries(SEGMENTOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                </label>
                <label className="campo"><span>Origem (pode aparecer nas mensagens)</span><input name="origem" defaultValue={g.origem ?? ""} /></label>
                <label className="campo"><span>Origem interna (nunca aparece)</span><input name="origem_interna" defaultValue={g.origem_interna ?? ""} /></label>
                <label className="campo"><span>Nº de lojas</span><input name="num_lojas" type="number" min={1} defaultValue={g.num_lojas} /></label>
                <label className="campo"><span>Entregas de veículos/mês (grupo)</span><input name="entregas_mes" type="number" min={0} defaultValue={g.entregas_mes ?? ""} /></label>
                <label className="campo"><span>Pacote provável</span>
                  <select name="pacote" defaultValue={g.pacote}>{Object.entries(PACOTES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                </label>
                <label className="campo"><span>Marcas</span><input name="marcas" defaultValue={g.marcas ?? ""} /></label>
              </div>
              <h2 style={{ marginTop: 10 }}>Diagnóstico</h2>
              <div className="grade g2">
                <label className="campo"><span>Decisor final</span><input name="diag_decisor" defaultValue={d.decisor ?? ""} /></label>
                <label className="campo"><span>Retenção na 2ª revisão (%)</span><input name="diag_retencao_2a" defaultValue={d.retencao_2a ?? ""} /></label>
                <label className="campo"><span>Planos vendidos hoje / mês</span><input name="diag_planos_hoje" defaultValue={d.planos_hoje ?? ""} /></label>
                <label className="campo"><span>Ticket médio de revisão (R$)</span><input name="diag_ticket_revisao" defaultValue={d.ticket_revisao ?? ""} /></label>
                <label className="campo"><span>Entregas de novos / mês por loja</span><input name="diag_entregas_loja" defaultValue={d.entregas_loja ?? ""} /></label>
                <label className="campo"><span>Data do próximo passo</span><input type="date" name="diag_data_proximo_passo" defaultValue={d.data_proximo_passo ?? ""} /></label>
              </div>
              <label className="campo"><span>Próximo passo acordado</span><input name="diag_proximo_passo" defaultValue={d.proximo_passo ?? ""} /></label>
              <label className="campo"><span>Observações</span><textarea name="observacoes" defaultValue={g.observacoes ?? ""} /></label>
              <Enviar>Salvar dados</Enviar>
            </FormAcao>
          </div>

          {lojas.length > 0 && (
            <div className="caixa">
              <h2>Lojas ({lojas.length})</h2>
              <details open={lojas.length <= 6}>
                <summary className="muted" style={{ cursor: "pointer", fontSize: 13 }}>Ver lojas</summary>
                <table><tbody>{lojas.map((l) => (
                  <tr key={l.id}><td>{l.nome_fantasia || l.razao_social}</td><td className="muted">{l.cidade}{l.uf ? `/${l.uf}` : ""}</td></tr>
                ))}</tbody></table>
              </details>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
