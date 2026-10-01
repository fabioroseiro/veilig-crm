import { brl, pct, type ResumoMRR } from "@/lib/mrr";

/**
 * Painel de receita recorrente.
 *
 * Mostra três coisas que o painel antigo não tinha: quanto a base ativa gera
 * por mês, se está crescendo, e quanto está saindo. O mini-gráfico é feito com
 * divs — não vale trazer uma biblioteca de gráficos para doze barras.
 */
export function PainelRecorrencia({
  resumo,
  mostrarReceitaVeilig = false,
  titulo = "Receita recorrente",
  passagens,
}: {
  resumo: ResumoMRR;
  mostrarReceitaVeilig?: boolean;
  titulo?: string;
  passagens?: { mes: number; total: number; mediaPorAssinatura: number };
}) {
  const { atual, crescimentoPct, crescimentoValor, churnPct, serie } = resumo;
  if (!atual) return null;

  const maximo = Math.max(...serie.map((p) => p.mrr), 1);
  // Sem histórico anterior, o gráfico é uma barra só e não conta nada.
  const temHistorico = serie.some((p, i) => i < serie.length - 1 && p.mrr > 0);

  const corCrescimento =
    crescimentoPct === null ? "var(--ink-soft)" : crescimentoPct >= 0 ? "#0f7a3d" : "var(--danger)";

  return (
    <section style={{ marginBottom: 22 }}>
      <div className="section-label">{titulo}</div>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-num">R$ {brl(atual.mrr)}</div>
          <div className="stat-label">Por mês, base ativa</div>
        </div>

        {mostrarReceitaVeilig && (
          <div className="stat-card">
            <div className="stat-num" style={{ color: "#4ec3e0" }}>
              R$ {brl(atual.receitaVeilig)}
            </div>
            <div className="stat-label">Receita Veilig/mês</div>
          </div>
        )}

        <div className="stat-card">
          <div className="stat-num" style={{ color: corCrescimento }}>
            {crescimentoPct === null ? "—" : pct(crescimentoPct)}
          </div>
          <div className="stat-label">
            {crescimentoPct === null
              ? "Sem mês anterior"
              : `${crescimentoValor >= 0 ? "+" : "−"} R$ ${brl(Math.abs(crescimentoValor))} no mês`}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-num">{atual.ativas}</div>
          <div className="stat-label">
            Assinaturas ativas
            {atual.novas > 0 || atual.canceladas > 0 ? (
              <>
                <br />
                <span style={{ fontSize: 12 }}>
                  +{atual.novas} nova{atual.novas === 1 ? "" : "s"} · −{atual.canceladas}{" "}
                  cancelada{atual.canceladas === 1 ? "" : "s"}
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-num" style={{ color: churnPct && churnPct > 5 ? "var(--danger)" : undefined }}>
            {churnPct === null ? "—" : `${churnPct.toFixed(1)}%`}
          </div>
          <div className="stat-label">Cancelamento no mês</div>
        </div>

        {/* Retorno à loja: o motivo de o plano existir. */}
        {passagens && (
          <div className="stat-card">
            <div className="stat-num">{passagens.mes}</div>
            <div className="stat-label">
              Passagens na loja este mês
              {passagens.total > 0 && (
                <>
                  <br />
                  <span style={{ fontSize: 12 }}>
                    {passagens.mediaPorAssinatura.toFixed(1)} por assinatura, no acumulado
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {temHistorico ? (
        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-sm, 8px)",
            padding: "14px 16px",
            marginTop: 12,
          }}
        >
          <div className="store-sub" style={{ fontSize: 13, marginBottom: 10 }}>
            Receita recorrente, últimos {serie.length} meses
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 90 }}>
            {serie.map((p) => (
              <div
                key={p.mes}
                title={`${p.rotulo}: R$ ${brl(p.mrr)} · ${p.ativas} ativas`}
                style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}
              >
                <div
                  style={{
                    height: `${Math.max((p.mrr / maximo) * 100, p.mrr > 0 ? 3 : 1)}%`,
                    background: p.mes === atual.mes ? "#4ec3e0" : "rgba(78,195,224,0.35)",
                    borderRadius: "3px 3px 0 0",
                    minHeight: 2,
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {serie.map((p) => (
              <div
                key={p.mes}
                className="store-sub"
                style={{ flex: 1, textAlign: "center", fontSize: 10 }}
              >
                {p.rotulo}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="hint" style={{ marginTop: 8 }}>
          O histórico começa a se formar a partir das primeiras vendas. Como o
          preço é congelado na venda e guardamos a data de cancelamento, os meses
          passados são reconstruídos com exatidão — não são estimativa.
        </p>
      )}
    </section>
  );
}
