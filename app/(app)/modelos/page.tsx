import { q, q1 } from "@/lib/db";
import { preencherTexto } from "@/lib/mensagem";
import { salvarModelo, enviarTeste } from "@/lib/acoes-cadencia";
import { FormAcao, Enviar } from "@/components/FormAcao";

export const dynamic = "force-dynamic";

const ORDEM = ["frio_1", "frio_2", "frio_3", "frio_5", "frio_8", "frio_10", "frio_12", "frio_13", "frio_14", "frio_encerramento", "frio_1_ciclo2"];

export default async function Modelos() {
  const modelos = await q<{ chave: string; nome: string; assunto: string; corpo: string; aprovado: boolean }>("SELECT chave, nome, assunto, corpo, aprovado FROM modelo_email");
  modelos.sort((a, b) => ORDEM.indexOf(a.chave) - ORDEM.indexOf(b.chave));
  const ex = await q1<{ nome: string; origem: string | null; segmento: string | null; contato: string | null }>(
    `SELECT g.nome, g.origem, g.segmento, c.nome AS contato FROM grupo g LEFT JOIN contato c ON c.grupo_id=g.id AND c.principal
      WHERE g.temperatura='frio' ORDER BY g.num_lojas DESC LIMIT 1`);
  const dados = { nome: ex?.contato ?? "Fulano", grupo: ex?.nome ?? "Grupo Exemplo", origem: ex?.origem, segmento: ex?.segmento };

  return (
    <>
      <div className="topo"><div><h1>Modelos de e-mail</h1>
        <div className="muted">Campos disponíveis: [Nome], [Grupo], [Origem] e [Link dos planos]. A prévia usa os dados de {dados.grupo}. Assinatura e link de descadastro entram automaticamente.</div></div></div>
      <div className="grade">
        {modelos.map((m) => (
          <div key={m.chave} className="caixa grade g2" style={{ alignItems: "start" }}>
            <FormAcao acao={salvarModelo.bind(null, m.chave)}>
              <h2>{m.nome} {m.aprovado ? <span className="tag" style={{ background: "#dcf5e8", color: "#11573a" }}>aprovado</span> : <span className="tag estr">não aprovado</span>}</h2>
              <label className="campo"><span>Assunto</span><input name="assunto" defaultValue={m.assunto} disabled={m.chave === "frio_2"} /></label>
              {m.chave === "frio_2" && <input type="hidden" name="assunto" value={m.assunto} />}
              <label className="campo"><span>Texto</span><textarea name="corpo" defaultValue={m.corpo} style={{ minHeight: 220 }} /></label>
              <label className="check" style={{ marginBottom: 10 }}><input type="checkbox" name="aprovado" defaultChecked={m.aprovado} /> Aprovado para envio</label>
              <div className="linha">
                <Enviar>Salvar</Enviar>
              </div>
            </FormAcao>
            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Prévia</div>
              <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, background: "#fff" }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>{m.chave === "frio_2" ? "Re: (assunto do toque 1)" : preencherTexto(m.assunto, dados)}</div>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{preencherTexto(m.corpo, dados)}</div>
                <div style={{ marginTop: 14, fontSize: 14 }}>Natália Artale<br />Veilig · veilig.com.br</div>
                <div className="muted" style={{ marginTop: 14, fontSize: 12 }}>Se não quiser receber novas mensagens, responda &quot;não&quot; ou clique aqui.</div>
              </div>
              <FormAcao acao={async () => { "use server"; return enviarTeste(m.chave); }}>
                <div style={{ marginTop: 10 }}><Enviar className="btn btn-mini">Enviar teste para o meu e-mail</Enviar></div>
              </FormAcao>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
