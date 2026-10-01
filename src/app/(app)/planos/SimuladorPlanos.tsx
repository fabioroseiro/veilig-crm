"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  avaliarCarencia,
  calcularPreco,
  formatarData,
  formatarBRL,
  type PoliticaCarencia,
  type PoliticaPreco,
} from "@/lib/carencia";

/**
 * Simulação de preço e carência na própria tela de Planos.
 *
 * Antes disso, o vendedor só descobria valor e carência DEPOIS de começar um
 * cadastro — e a conversa com o cliente acontece antes. Perguntado "quanto fica
 * para a minha moto?", ele não tinha onde olhar.
 *
 * Fica aqui, e não numa tela nova, porque é onde os planos já estão: a lista
 * vira o comparador quando há um veículo escolhido.
 *
 * O cálculo reaproveita `avaliarCarencia` e `calcularPreco`, as MESMAS funções
 * da tela de venda. Duas implementações do mesmo preço divergiriam, e o
 * vendedor passaria um valor que a venda não confirma.
 */

export type OfertaSim = {
  modelId: string;
  fabricante: string;
  modeloLabel: string;
  categoria: string | null;
  precoBase: number;
  planId: string;
  planoNome: string;
  politica: PoliticaCarencia & PoliticaPreco;
};

const ANO_ATUAL = new Date().getFullYear();

export function SimuladorPlanos({
  lojas,
  porLoja,
  isVendedor,
  storeIdVendedor,
}: {
  lojas: { id: string; nome: string | null }[];
  porLoja: Record<string, OfertaSim[]>;
  isVendedor: boolean;
  storeIdVendedor: string | null;
}) {
  const [aberto, setAberto] = useState(false);
  const [lojaSel, setLojaSel] = useState(
    isVendedor && storeIdVendedor ? storeIdVendedor : lojas[0]?.id ?? ""
  );
  const [fabricante, setFabricante] = useState("");
  const [modeloSel, setModeloSel] = useState("");
  const [ano, setAno] = useState("");
  const [zeroKm, setZeroKm] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const ofertasDaLoja = useMemo(() => porLoja[lojaSel] ?? [], [porLoja, lojaSel]);

  const fabricantes = useMemo(
    () => Array.from(new Set(ofertasDaLoja.map((o) => o.fabricante))).sort(),
    [ofertasDaLoja]
  );

  const modelos = useMemo(() => {
    const vistos = new Map<string, { id: string; label: string }>();
    for (const o of ofertasDaLoja) {
      if (fabricante && o.fabricante !== fabricante) continue;
      if (!vistos.has(o.modelId)) vistos.set(o.modelId, { id: o.modelId, label: o.modeloLabel });
    }
    return Array.from(vistos.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [ofertasDaLoja, fabricante]);

  // Zero km implica o ano do modelo atual: o veículo está saindo da loja agora.
  const anoEfetivo = zeroKm ? ANO_ATUAL : Number(ano);
  const anoValido =
    zeroKm || (Number.isInteger(anoEfetivo) && anoEfetivo >= 1950 && anoEfetivo <= ANO_ATUAL + 1);

  const { disponiveis, recusados, modeloLabel } = useMemo(() => {
    const disponiveis: any[] = [];
    const recusados: any[] = [];
    let modeloLabel = "";
    if (!modeloSel || !anoValido) return { disponiveis, recusados, modeloLabel };

    for (const o of ofertasDaLoja) {
      if (o.modelId !== modeloSel) continue;
      modeloLabel = o.modeloLabel;
      const av = avaliarCarencia({ politica: o.politica, anoVeiculo: anoEfetivo, zeroKm });
      if (!av.elegivel) {
        // O que NÃO serve aparece com o motivo: lista vazia sem explicação
        // deixa o vendedor sem resposta para o cliente.
        recusados.push({ oferta: o, motivo: av.motivo });
        continue;
      }
      disponiveis.push({ oferta: o, av, preco: calcularPreco(o.precoBase, o.politica, av.faixa) });
    }
    disponiveis.sort((a, b) => a.preco.final - b.preco.final);
    return { disponiveis, recusados, modeloLabel };
  }, [ofertasDaLoja, modeloSel, anoEfetivo, anoValido, zeroKm]);

  const simulou = Boolean(modeloSel && anoValido);

  const textoParaCliente = () => {
    const veiculo = `${modeloLabel}${zeroKm ? " · zero km" : ano ? ` · ${ano}` : ""}`;
    const linhas = disponiveis.map((d) => {
      const carencia =
        d.av.meses > 0
          ? ` (uso a partir de ${formatarData(d.av.carenciaAte)})`
          : " (uso imediato)";
      return `• ${d.oferta.planoNome}: R$ ${formatarBRL(d.preco.final)}/mês${carencia}`;
    });
    return (
      `Planos de manutenção para ${veiculo}:\n\n` +
      linhas.join("\n") +
      `\n\nO plano passa a valer após o pagamento da primeira mensalidade.`
    );
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoParaCliente());
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {}
  };

  if (!aberto) {
    return (
      <button
        type="button"
        className="btn-ghost"
        style={{ padding: "8px 16px", marginBottom: 16 }}
        onClick={() => setAberto(true)}
      >
        Simular para um veículo
      </button>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong>Simular para um veículo</strong>
        <button
          type="button"
          className="btn-ghost"
          style={{ padding: "4px 12px", fontSize: 13 }}
          onClick={() => setAberto(false)}
        >
          Fechar
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        {/* O preço varia por loja. O vendedor tem a dele; os demais escolhem. */}
        {!isVendedor && lojas.length > 1 && (
          <div className="field" style={{ margin: 0, minWidth: 170 }}>
            <label htmlFor="sim-loja">Loja</label>
            <select
              id="sim-loja"
              value={lojaSel}
              onChange={(e) => {
                setLojaSel(e.target.value);
                setFabricante("");
                setModeloSel("");
              }}
            >
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>{l.nome ?? "Loja"}</option>
              ))}
            </select>
          </div>
        )}

        <div className="field" style={{ margin: 0, minWidth: 150 }}>
          <label htmlFor="sim-fab">Fabricante</label>
          <select
            id="sim-fab"
            value={fabricante}
            onChange={(e) => {
              setFabricante(e.target.value);
              setModeloSel("");
            }}
          >
            <option value="">Todos</option>
            {fabricantes.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div className="field" style={{ margin: 0, minWidth: 190 }}>
          <label htmlFor="sim-modelo">Modelo</label>
          <select id="sim-modelo" value={modeloSel} onChange={(e) => setModeloSel(e.target.value)}>
            <option value="">Escolha o modelo…</option>
            {modelos.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="field" style={{ margin: 0, width: 110 }}>
          <label htmlFor="sim-ano">Ano</label>
          <input
            id="sim-ano"
            inputMode="numeric"
            value={zeroKm ? String(ANO_ATUAL) : ano}
            disabled={zeroKm}
            onChange={(e) => setAno(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder={String(ANO_ATUAL)}
          />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={zeroKm} onChange={(e) => setZeroKm(e.target.checked)} />
          <span>Zero km</span>
        </label>
      </div>

      {ofertasDaLoja.length === 0 && (
        <p className="hint" style={{ marginBottom: 0 }}>
          Esta loja ainda não tem preços cadastrados. Defina em Preços.
        </p>
      )}

      {simulou && (
        <>
          {disponiveis.length === 0 && recusados.length === 0 ? (
            <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
              Nenhum plano tem preço cadastrado para este modelo nesta loja.
            </p>
          ) : (
            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table className="list">
                <thead>
                  <tr>
                    <th>Plano</th>
                    <th>Valor</th>
                    <th>Carência</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {disponiveis.map((d) => (
                    <tr key={d.oferta.planId}>
                      <td>{d.oferta.planoNome}</td>
                      <td>
                        <strong>R$ {formatarBRL(d.preco.final)}</strong>/mês
                        {d.preco.acrescimoPercent > 0 && (
                          <div className="store-sub" style={{ fontSize: 12 }}>
                            inclui {d.preco.acrescimoPercent}% pela idade do veículo
                          </div>
                        )}
                      </td>
                      <td>
                        {d.av.meses > 0 ? (
                          <>
                            {d.av.meses} {d.av.meses === 1 ? "mês" : "meses"}
                            <div className="store-sub" style={{ fontSize: 12 }}>
                              uso a partir de {formatarData(d.av.carenciaAte)}
                            </div>
                          </>
                        ) : (
                          <span className="badge badge-ok" style={{ fontSize: 12 }}>sem carência</span>
                        )}
                      </td>
                      <td>
                        <Link href={`/planos/${d.oferta.planId}/vender`} className="btn-ghost btn-sm">
                          Argumentos
                        </Link>
                      </td>
                    </tr>
                  ))}

                  {/* Os que não servem, com o motivo. */}
                  {recusados.map((r) => (
                    <tr key={r.oferta.planId} style={{ opacity: 0.55 }}>
                      <td>{r.oferta.planoNome}</td>
                      <td colSpan={3} className="store-sub">Não serve: {r.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {disponiveis.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" className="btn-primary" style={{ padding: "8px 16px" }} onClick={copiar}>
                {copiado ? "Copiado!" : "Copiar para o cliente"}
              </button>
              <Link href="/clientes/nova" className="btn-ghost" style={{ padding: "8px 16px" }}>
                Vender agora
              </Link>
              <span className="hint" style={{ margin: 0 }}>
                A carência conta da data da venda. Leia a data para o cliente.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
