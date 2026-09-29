import Link from "next/link";
import { notFound } from "next/navigation";
import { q1 } from "@/lib/db";
import { propostaPorId, remetenteProposta, emitidaISO, vencida } from "@/lib/proposta";
import { PACOTES_PROPOSTA, STATUS_PROPOSTA, ONBOARDING, OPCOES_ONBOARDING, onboardingDe, onboardingSugerido } from "@/lib/proposta-tipos";
import { conteudoProposta, dataExtenso } from "@/lib/proposta-conteudo";
import { envioReal } from "@/lib/correio";
import { hojeISO, somaDias } from "@/lib/regras";
import * as P from "@/lib/acoes-proposta";
import { PropostaDoc } from "@/components/PropostaDoc";
import { FormAcao, Enviar } from "@/components/FormAcao";
import { BotaoAcao } from "@/components/Seletor";

export const dynamic = "force-dynamic";

const quando = (d: string | null) => d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";

export default async function EditarProposta({ params }: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await params;
  if (!/^[0-9a-f-]{36}$/.test(pid)) notFound();
  const p = await propostaPorId(pid);
  if (!p || p.grupo_id !== id) notFound();
  const g = await q1<{ nome: string }>("SELECT nome FROM grupo WHERE id=$1", [id]);
  const rem = await remetenteProposta();
  const c = conteudoProposta(p.dados, p.numero, p.status === "rascunho" ? hojeISO() : emitidaISO(p), p.validade, rem);
  const d = p.dados;
  const link = await P.linkProposta(p.token);
  const padrao = await P.mensagemPadrao(p);
  const rascunho = p.status === "rascunho";
  const aberta = ["enviada", "prazo_pedido"].includes(p.status);
  const caixaOk = envioReal(rem.email);

  return (
    <>
      <div className="topo">
        <div>
          <div className="muted" style={{ fontSize: 13 }}><Link href={`/grupos/${id}`}>{g?.nome}</Link> / Propostas</div>
          <h1>Proposta {p.numero} <span className={`status-prop ${p.status}`}>{STATUS_PROPOSTA[p.status]}</span></h1>
          <div className="muted" style={{ fontSize: 13 }}>
            Válida até {dataExtenso(p.validade)}{vencida(p) && p.status !== "aceita" ? " (vencida)" : ""}
            {p.enviada_em && ` · enviada em ${quando(p.enviada_em)} para ${p.enviada_para}`}
            {p.aberta_em ? ` · aberta ${p.aberturas}× (primeira em ${quando(p.aberta_em)})` : p.enviada_em ? " · ainda não aberta pelo link" : ""}
          </div>
        </div>
        <div className="linha">
          <a className="btn" href={`/p/${p.token}/pdf`} target="_blank" rel="noopener">Baixar PDF</a>
          {!rascunho && p.status !== "cancelada" && <a className="btn" href={link} target="_blank" rel="noopener">Abrir link do cliente</a>}
          {!rascunho && <BotaoAcao className="btn" acao={P.novaVersao.bind(null, p.id)}>Nova versão</BotaoAcao>}
          {p.status !== "aceita" && p.status !== "cancelada" && <BotaoAcao className="btn btn-perigo" confirmar="Cancelar esta proposta? O link deixa de aceitar." acao={P.cancelarProposta.bind(null, p.id)}>Cancelar</BotaoAcao>}
        </div>
      </div>

      {p.status === "aceita" && (
        <div className="aviso ok">Aceita em {quando(p.aceita_em)}{p.aceite?.onboarding ? `, com onboarding ${ONBOARDING[p.aceite.onboarding].nome}` : ""}, por {p.aceite?.nome}{p.aceite?.cargo ? ` (${p.aceite.cargo})` : ""}{p.aceite?.email ? `, ${p.aceite.email}` : ""}. Próximo passo: enviar o contrato.</div>
      )}
      {p.status === "prazo_pedido" && p.prazo_pedido && (
        <div className="aviso atencao">{p.prazo_pedido.motivo ? `"${p.prazo_pedido.motivo}" — ` : ""}pedido de prazo até {dataExtenso(p.prazo_pedido.data)}. Para aceitar, prorrogue a validade abaixo.</div>
      )}

      <div className="edicao-prop">
        <div className="grade">
          {rascunho && (
            <div className="caixa">
              <h2>Dados da proposta</h2>
              <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>Vêm do CRM e podem ser ajustados conforme a conversa. Salve para atualizar a pré-visualização.</p>
              <FormAcao acao={P.salvarProposta.bind(null, p.id)}>
                <h2 style={{ fontSize: 14 }}>Cliente</h2>
                <label className="campo"><span>Grupo / concessionária</span><input name="empresa" defaultValue={d.empresa} required /></label>
                <div className="grade g2">
                  <label className="campo"><span>Contato</span><input name="contato_nome" defaultValue={d.contato_nome} /></label>
                  <label className="campo"><span>Cargo</span><input name="contato_cargo" defaultValue={d.contato_cargo} /></label>
                </div>
                <label className="campo"><span>E-mail do contato</span><input name="contato_email" type="email" defaultValue={d.contato_email} /></label>
                <label className="campo"><span>Marcas</span><input name="marcas" defaultValue={d.marcas} placeholder="Ex.: Hyundai, Toyota" /></label>

                <h2 style={{ fontSize: 14, marginTop: 8 }}>Operação (base da simulação)</h2>
                <div className="grade g3">
                  <label className="campo"><span>Lojas</span><input name="lojas" type="number" min={1} defaultValue={d.lojas} required /></label>
                  <label className="campo"><span>Entregas/loja/mês</span><input name="vendas_loja" type="number" min={1} defaultValue={d.vendas_loja} required /></label>
                  <label className="campo"><span>Ticket revisão (R$)</span><input name="ticket" type="number" min={1} defaultValue={d.ticket} required /></label>
                </div>
                <label className="check" style={{ marginBottom: 10 }}><input type="checkbox" name="mostrar_simulacao" defaultChecked={d.mostrar_simulacao} /> Mostrar diagnóstico, potencial e retorno estimado</label>

                <h2 style={{ fontSize: 14, marginTop: 8 }}>Condição comercial</h2>
                <div className="grade g2">
                  <label className="campo"><span>Pacote</span>
                    <select name="pacote" defaultValue={d.pacote}>{Object.entries(PACOTES_PROPOSTA).map(([k, v]) => <option key={k} value={k}>{v.nome}</option>)}</select>
                  </label>
                  <label className="campo"><span>Recorrente por loja (R$)</span><input name="recorrente_loja" type="number" min={0} step="0.01" defaultValue={d.recorrente_loja} required /></label>
                  <label className="campo"><span>Setup total (R$; 0 = isento)</span><input name="setup_total" type="number" min={0} step="0.01" defaultValue={d.setup_total} required /></label>
                  <label className="campo"><span>Observação do setup</span><input name="setup_obs" defaultValue={d.setup_obs} placeholder="Ex.: condição de lançamento" /></label>
                  <label className="campo"><span>Taxa de sucesso (%)</span><input name="fee" type="number" min={0} max={100} step="0.1" defaultValue={d.fee} required /></label>
                  <label className="campo"><span>Vencimento das faturas (dia)</span><input name="vencimento_dia" type="number" min={1} max={28} defaultValue={d.vencimento_dia} required /></label>
                  <label className="campo"><span>Válida até</span><input name="validade" type="date" min={hojeISO()} defaultValue={p.validade} required /></label>
                </div>
                <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>Ao trocar o pacote, o recorrente segue a tabela, se você não tiver mudado o valor à mão.</p>
                <label className="campo"><span>Onboarding</span>
                  <select name="onboarding" defaultValue={onboardingDe(d)}>{Object.entries(OPCOES_ONBOARDING).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                </label>
                <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>Sugestão pelo tamanho do piloto: {ONBOARDING[onboardingSugerido(d.lojas)].nome}. Com &quot;os dois&quot;, a proposta mostra a comparação e o cliente escolhe no aceite.</p>
                <label className="campo"><span>Observações (aparecem na proposta)</span><textarea name="observacoes" defaultValue={d.observacoes} placeholder="Ex.: piloto começa pela loja da Barra" /></label>
                <Enviar>Salvar</Enviar>
              </FormAcao>
            </div>
          )}

          {(rascunho || aberta) && (
            <div className="caixa">
              <h2>{rascunho ? "Enviar ao cliente" : "Reenviar"}</h2>
              {!caixaOk && (
                <div className="aviso atencao">A caixa {rem.email} ainda não está ligada ao CRM. Enquanto isso, baixe o PDF, envie pelo seu e-mail e use &quot;Marquei como enviada&quot;.</div>
              )}
              <FormAcao acao={P.enviarProposta.bind(null, p.id)}>
                <label className="campo"><span>Para</span><input name="para" type="email" defaultValue={d.contato_email} required /></label>
                <label className="campo"><span>Cópia (opcional; separe por vírgula)</span><input name="cc" /></label>
                <label className="campo"><span>Assunto</span><input name="assunto" defaultValue={padrao.assunto} required /></label>
                <label className="campo"><span>Mensagem ([Link da proposta] vira o botão para o link)</span><textarea name="mensagem" rows={9} defaultValue={padrao.mensagem} required /></label>
                <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>Sai de {rem.email}, com o PDF anexo e a sua assinatura.</p>
                <Enviar>{rascunho ? "Enviar proposta" : "Reenviar"}</Enviar>
              </FormAcao>
              {rascunho && (
                <details style={{ marginTop: 12 }}>
                  <summary className="btn btn-mini">Marquei como enviada (enviei fora do CRM)</summary>
                  <FormAcao acao={P.marcarEnviada.bind(null, p.id)}>
                    <label className="campo" style={{ marginTop: 8 }}><span>Enviada para</span><input name="para" defaultValue={d.contato_email} /></label>
                    <Enviar className="btn btn-mini btn-ink">Confirmar</Enviar>
                  </FormAcao>
                </details>
              )}
            </div>
          )}

          {(aberta || rascunho) && (
            <div className="caixa">
              <h2>Validade</h2>
              <FormAcao acao={P.prorrogarProposta.bind(null, p.id)}>
                <label className="campo"><span>Nova validade</span>
                  <input name="validade" type="date" min={somaDias(hojeISO(), 1)} defaultValue={p.prazo_pedido?.data ?? somaDias(p.validade < hojeISO() ? hojeISO() : p.validade, 15)} required />
                </label>
                <Enviar className="btn btn-mini btn-ink">Prorrogar</Enviar>
              </FormAcao>
            </div>
          )}

          {aberta && (
            <div className="caixa">
              <h2>Aceite fora do link</h2>
              <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>Se o cliente aceitou por e-mail, WhatsApp ou em reunião.</p>
              <FormAcao acao={P.registrarAceite.bind(null, p.id)}>
                <div className="grade g2">
                  <label className="campo"><span>Quem aceitou</span><input name="nome" defaultValue={d.contato_nome} required /></label>
                  <label className="campo"><span>Cargo</span><input name="cargo" defaultValue={d.contato_cargo} /></label>
                  <label className="campo"><span>E-mail</span><input name="email" defaultValue={d.contato_email} /></label>
                  <label className="campo"><span>Como</span><select name="como" defaultValue="e-mail"><option>e-mail</option><option>WhatsApp</option><option>reunião</option></select></label>
                </div>
                {onboardingDe(d) === "ambos" && (
                  <label className="campo"><span>Onboarding escolhido</span>
                    <select name="onboarding" defaultValue={onboardingSugerido(d.lojas)}><option value="consultivo">Consultivo</option><option value="online">Online</option></select>
                  </label>
                )}
                <Enviar className="btn btn-mini btn-ink">Registrar aceite</Enviar>
              </FormAcao>
            </div>
          )}
        </div>

        <div>
          <PropostaDoc c={c} />
        </div>
      </div>
    </>
  );
}
