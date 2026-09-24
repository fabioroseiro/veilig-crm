import Link from "next/link";
import { exigirUsuario } from "@/lib/auth";
import { q } from "@/lib/db";
import { adiarTarefa, concluirTarefa, excluirTarefa, salvarEmailPrincipal } from "@/lib/acoes";
import { ETAPAS, TIPOS_TAREFA, TEMPERATURAS, dataBR, diasDesde, hojeISO, linkWhatsApp, preencher, somaDias } from "@/lib/regras";
import { Tarefa } from "@/components/Tarefa";

export const dynamic = "force-dynamic";

type T = { id: string; titulo: string; tipo: string; texto: string | null; vence_em: string; grupo_id: string; grupo: string;
  origem: string | null; contato: string | null; whatsapp: string | null; responsavel: string | null; email_status: string | null };

export default async function Hoje({ searchParams }: { searchParams: Promise<{ todas?: string }> }) {
  const u = await exigirUsuario();
  const todas = (await searchParams).todas === "1";
  const hoje = hojeISO();
  const filtro = todas ? "" : "AND t.usuario_id = $2";
  const params = todas ? [hoje] : [hoje, u.id];

  const tarefas = await q<T>(
    `SELECT t.id, t.titulo, t.tipo, t.texto, to_char(t.vence_em,'YYYY-MM-DD') AS vence_em, g.id AS grupo_id, g.nome AS grupo, g.origem,
            c.nome AS contato, c.whatsapp, c.email_status, us.nome AS responsavel
       FROM tarefa t JOIN grupo g ON g.id = t.grupo_id
       LEFT JOIN contato c ON c.grupo_id = g.id AND c.principal
       LEFT JOIN usuario us ON us.id = t.usuario_id
      WHERE t.feita_em IS NULL AND t.vence_em <= $1 ${filtro}
      ORDER BY t.vence_em, t.criado_em LIMIT 200`, params);

  const proximas = await q<{ n: string }>(
    `SELECT count(*) AS n FROM tarefa t WHERE t.feita_em IS NULL AND t.vence_em > $1 AND t.vence_em <= $2 ${todas ? "" : "AND t.usuario_id = $3"}`,
    todas ? [hoje, somaDias(hoje, 7)] : [hoje, somaDias(hoje, 7), u.id]);

  const semContato = await q<{ id: string; nome: string; etapa: number; temperatura: string; ultimo_sinal: string | null; criado_em: string }>(
    `SELECT g.id, g.nome, g.etapa, g.temperatura, g.ultimo_sinal, g.criado_em FROM grupo g
      WHERE g.situacao = 'ativo' AND g.etapa BETWEEN 2 AND 6 ${todas ? "" : "AND g.responsavel_id = $1"}
        AND COALESCE(g.ultimo_sinal, g.criado_em) < now() - interval '7 days'
        AND NOT EXISTS (SELECT 1 FROM tarefa t WHERE t.grupo_id = g.id AND t.feita_em IS NULL)
      ORDER BY COALESCE(g.ultimo_sinal, g.criado_em) LIMIT 50`, todas ? [] : [u.id]);

  const vencidas = tarefas.filter((t) => t.vence_em < hoje).length;

  return (
    <>
      <div className="topo">
        <div>
          <h1>Hoje</h1>
          <div className="muted">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" })}</div>
        </div>
        <div className="linha">
          <Link className={`btn ${todas ? "" : "btn-ink"}`} href="/hoje">Minhas ações</Link>
          <Link className={`btn ${todas ? "btn-ink" : ""}`} href="/hoje?todas=1">Todas</Link>
        </div>
      </div>

      <div className="grade g4" style={{ marginBottom: 16 }}>
        <div className="caixa kpi"><div className="k">Ações para hoje</div><div className="v num">{tarefas.length - vencidas}</div></div>
        <div className="caixa kpi"><div className="k">Ações atrasadas</div><div className={`v num ${vencidas ? "alerta" : ""}`}>{vencidas}</div></div>
        <div className="caixa kpi"><div className="k">Sem contato há mais de 7 dias</div><div className={`v num ${semContato.length ? "alerta" : ""}`}>{semContato.length}</div></div>
        <div className="caixa kpi"><div className="k">Ações nos próximos 7 dias</div><div className="v num">{proximas[0]?.n ?? 0}</div></div>
      </div>

      <div className="caixa" style={{ marginBottom: 16 }}>
        <h2>Ações de hoje e atrasadas</h2>
        {tarefas.length === 0 && <p className="muted">Nenhuma ação pendente para hoje.</p>}
        {tarefas.map((t) => {
          const texto = t.texto ? preencher(t.texto, { nome: t.contato, grupo: t.grupo, origem: t.origem }) : null;
          return (
            <Tarefa key={t.id} id={t.id} titulo={t.titulo} tipo={t.tipo} tipoNome={TIPOS_TAREFA[t.tipo] ?? "Ação"}
              vence={dataBR(t.vence_em + "T12:00:00")} vencida={t.vence_em < hoje}
              grupoId={t.grupo_id} grupo={t.grupo} contato={t.contato} texto={texto}
              zap={linkWhatsApp(t.whatsapp, t.tipo === "whatsapp" ? texto : null)}
              responsavel={todas ? t.responsavel : null}
              concluir={concluirTarefa.bind(null, t.id)}
              emailStatus={t.email_status} salvarEmail={salvarEmailPrincipal.bind(null, t.grupo_id)}
              adiar1={adiarTarefa.bind(null, t.id, 1)} adiar3={adiarTarefa.bind(null, t.id, 3)} excluir={excluirTarefa.bind(null, t.id)} />
          );
        })}
      </div>

      <div className="caixa">
        <h2>Leads sem contato há mais de 7 dias e sem próxima ação</h2>
        {semContato.length === 0 ? <p className="muted">Nenhum. Todos os leads em andamento têm uma próxima ação.</p> : (
          <div className="rolagem"><table>
            <thead><tr><th>Grupo</th><th>Etapa</th><th>Temperatura</th><th>Último sinal</th></tr></thead>
            <tbody>{semContato.map((g) => {
              const t = TEMPERATURAS[g.temperatura as keyof typeof TEMPERATURAS];
              return (
                <tr key={g.id}>
                  <td><Link href={`/grupos/${g.id}`}>{g.nome}</Link></td>
                  <td>{ETAPAS[g.etapa].nome}</td>
                  <td><span className="temp"><i style={{ background: t.cor }} />{t.nome}</span></td>
                  <td className="alerta">{g.ultimo_sinal ? `há ${diasDesde(g.ultimo_sinal)} dias` : "nunca respondeu"}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
