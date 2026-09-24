import Link from "next/link";
import { q } from "@/lib/db";
import { lerConfig } from "@/lib/config";
import { mudarEtapa, reativar } from "@/lib/acoes";
import { ETAPAS, TEMPERATURAS, dataBR, diasDesde, ponderado, porte, potencial } from "@/lib/regras";
import { Kanban, type Cartao } from "@/components/Kanban";

export const dynamic = "force-dynamic";

type G = { id: string; nome: string; etapa: number; temperatura: string; num_lojas: number; pacote: string; situacao: string;
  estrategico: boolean; origem: string | null; segmento: string | null; ultimo_sinal: string | null; responsavel: string | null;
  pausado_ate: string | null; perdido_motivo: string | null; tarefas: string };

export default async function Funil({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const ver = (await searchParams).ver || "ativos";
  const cfg = await lerConfig();
  const situacao = ver === "pausados" ? "pausado" : ver === "perdidos" ? "perdido" : "ativo";
  const grupos = await q<G>(
    `SELECT g.id, g.nome, g.etapa, g.temperatura, g.num_lojas, g.pacote, g.situacao, g.estrategico, g.origem, g.segmento,
            g.ultimo_sinal, u.nome AS responsavel, to_char(g.pausado_ate,'YYYY-MM-DD') AS pausado_ate, g.perdido_motivo,
            (SELECT count(*) FROM tarefa t WHERE t.grupo_id=g.id AND t.feita_em IS NULL) AS tarefas
       FROM grupo g LEFT JOIN usuario u ON u.id = g.responsavel_id
      WHERE g.situacao = $1 ORDER BY g.estrategico DESC, g.num_lojas DESC, g.nome`, [situacao]);
  const contagem = await q<{ situacao: string; n: string }>("SELECT situacao, count(*) AS n FROM grupo GROUP BY situacao");
  const n = (s: string) => contagem.find((c) => c.situacao === s)?.n ?? "0";

  const cartoes: Cartao[] = grupos.map((g) => {
    const pot = potencial(g.num_lojas, g.pacote, cfg.precos, cfg.lojas_piloto);
    return {
      id: g.id, nome: g.nome, etapa: g.etapa, temperatura: g.temperatura, porte: porte(g.num_lojas), numLojas: g.num_lojas,
      responsavel: g.responsavel, dias: diasDesde(g.ultimo_sinal), potencial: pot, ponderado: ponderado(pot, g.etapa, g.situacao),
      estrategico: g.estrategico, origem: g.origem, segmento: g.segmento, tarefas: Number(g.tarefas),
    };
  });
  const responsaveis = [...new Set(grupos.map((g) => g.responsavel).filter(Boolean))] as string[];

  return (
    <>
      <div className="topo">
        <div><h1>Funil</h1><div className="muted">Previsão ponderada = potencial recorrente × probabilidade da etapa.</div></div>
        <Link className="btn btn-ink" href="/grupos/novo">Novo lead</Link>
      </div>
      <nav className="abas">
        <Link href="/funil" aria-current={ver === "ativos" ? "page" : undefined}>Em andamento ({n("ativo")})</Link>
        <Link href="/funil?ver=pausados" aria-current={ver === "pausados" ? "page" : undefined}>Pausados ({n("pausado")})</Link>
        <Link href="/funil?ver=perdidos" aria-current={ver === "perdidos" ? "page" : undefined}>Perdidos ({n("perdido")})</Link>
      </nav>

      {situacao === "ativo" ? (
        <Kanban cartoes={cartoes} etapas={Object.entries(ETAPAS).map(([k, e]) => ({ n: Number(k), nome: e.nome }))}
          temps={TEMPERATURAS} responsaveis={responsaveis} mover={mudarEtapa} />
      ) : (
        <div className="caixa rolagem">
          {grupos.length === 0 ? <p className="muted">Nenhum lead aqui.</p> : (
            <table>
              <thead><tr><th>Grupo</th><th>Etapa</th><th>Lojas</th><th>{situacao === "pausado" ? "Retomar em" : "Motivo"}</th><th>Responsável</th><th></th></tr></thead>
              <tbody>{grupos.map((g) => (
                <tr key={g.id}>
                  <td><Link href={`/grupos/${g.id}`}>{g.nome}</Link></td>
                  <td>{ETAPAS[g.etapa].nome}</td>
                  <td className="num">{g.num_lojas}</td>
                  <td>{situacao === "pausado" ? dataBR(g.pausado_ate ? g.pausado_ate + "T12:00:00" : null) : g.perdido_motivo}</td>
                  <td>{g.responsavel ?? "—"}</td>
                  <td><form action={reativar.bind(null, g.id)}><button className="btn btn-mini" type="submit">Reativar</button></form></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
