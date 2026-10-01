"use client";

import { useActionState, useMemo, useState } from "react";
import { criarClienteVeiculo, type FormState } from "./actions";
import { checarCancelamentoAnterior } from "./check-actions";
import { mascaraCpf, mascaraTelefone, mascaraPlaca, mascaraCep, mascaraChassi } from "@/lib/mascaras";
import { CredenciaisCliente } from "@/components/CredenciaisCliente";
import { SolicitarIsencao } from "./SolicitarIsencao";
import { Tour } from "@/components/tour/Tour";
import { TOURS } from "@/lib/tours";
import { usarCep } from "@/lib/usar-cep";
import {
  avaliarCarencia,
  calcularPreco,
  formatarData,
  formatarBRL,
  type PoliticaCarencia,
  type PoliticaPreco,
} from "@/lib/carencia";

const initial: FormState = { ok: false };

type Oferta = {
  modelId: string;
  fabricante: string;
  modeloLabel: string;
  categoria: string;
  precoBase: number;
  planId: string;
  planoNome: string;
  planoDescricao: string;
  politica: PoliticaCarencia & PoliticaPreco;
};
type Loja = { id: string; nome: string };

const ANO_ATUAL = new Date().getFullYear();

export function ClienteForm({
  lojas,
  porLoja,
  isVendedor,
  storeIdVendedor,
  isVeilig = false,
  vendedoresPorLoja = {},
}: {
  lojas: Loja[];
  porLoja: Record<string, Oferta[]>;
  isVendedor: boolean;
  storeIdVendedor: string | null;
  /** Só a Veilig migra clientes de plano anterior. */
  isVeilig?: boolean;
  vendedoresPorLoja?: Record<string, { id: string; nome: string }[]>;
}) {
  const [state, action, pending] = useActionState(criarClienteVeiculo, initial);
  const err = state.errors || {};
  const val = state.values || {};

  // Controlados para o valor sobreviver a um erro do servidor. Com
  // defaultValue, um remount do formulário apagaria o que foi digitado.
  const [nome, setNome] = useState(val.nome ?? "");
  const [email, setEmail] = useState(val.email ?? "");
  const [cpf, setCpf] = useState(mascaraCpf(val.cpf ?? ""));
  const [avisoCancelou, setAvisoCancelou] = useState(false);

  async function verificarCpf(valorCpf: string) {
    try {
      const r = await checarCancelamentoAnterior(valorCpf);
      setAvisoCancelou(r.jaCancelou);
    } catch {
      setAvisoCancelou(false);
    }
  }

  const [telefone, setTelefone] = useState(mascaraTelefone(val.telefone ?? ""));
  const [placa, setPlaca] = useState(mascaraPlaca(val.placa ?? ""));
  const [chassi, setChassi] = useState(mascaraChassi(val.chassi ?? ""));
  const [migracao, setMigracao] = useState(false);
  const [precoMigracao, setPrecoMigracao] = useState("");
  const [vendedorMigracao, setVendedorMigracao] = useState("");
  const [migracaoObs, setMigracaoObs] = useState("");
  const [primeiroVencimento, setPrimeiroVencimento] = useState("");

  // ── Endereço ──────────────────────────────────────────────────────────────
  const [cep, setCep] = useState(mascaraCep(val.cep ?? ""));
  const [logradouro, setLogradouro] = useState(val.logradouro ?? "");
  const [numero, setNumero] = useState(val.numero ?? "");
  const [complemento, setComplemento] = useState(val.complemento ?? "");
  const [bairro, setBairro] = useState(val.bairro ?? "");
  const [cidade, setCidade] = useState(val.cidade ?? "");
  const [uf, setUf] = useState(val.uf ?? "");
  // Sete campos digitados à mão no balcão é atrito demais — com o CEP, sobra
  // o número.
  const { buscar: buscarCepBase, buscando: buscandoCep, naoEncontrado: cepNaoAchado } =
    usarCep((e) => {
      if (e.logradouro) setLogradouro(e.logradouro);
      if (e.bairro) setBairro(e.bairro);
      if (e.cidade) setCidade(e.cidade);
      if (e.uf) setUf(e.uf);
    });
  const buscarCep = () => buscarCepBase(cep);

  const [lojaSel, setLojaSel] = useState<string>(
    isVendedor ? storeIdVendedor ?? "" : val.storeId ?? ""
  );

  const ofertasDaLoja = useMemo(
    () => (lojaSel ? porLoja[lojaSel] ?? [] : []),
    [lojaSel, porLoja]
  );

  // ── Descrição do veículo: fabricante → modelo/versão → ano ────────────────
  const [fabricante, setFabricante] = useState(val.fabricante ?? "");
  const [modeloSel, setModeloSel] = useState<string>(val.vehicleModelId ?? "");
  const [ano, setAno] = useState(val.ano ?? "");
  const [zeroKm, setZeroKm] = useState(val.zeroKm === "on");
  const [kmAtual, setKmAtual] = useState(val.kmAtual ?? "");
  const [kmMes, setKmMes] = useState(val.kmMesEstimado ?? "");
  const [perfilUso, setPerfilUso] = useState(val.perfilUso ?? "");

  const fabricantes = useMemo(
    () => Array.from(new Set(ofertasDaLoja.map((o) => o.fabricante))).sort(),
    [ofertasDaLoja]
  );

  // Um mesmo modelo pode aparecer em vários planos; aqui listamos cada modelo
  // uma única vez.
  const modelosDoFabricante = useMemo(() => {
    const vistos = new Map<string, { id: string; label: string }>();
    for (const o of ofertasDaLoja) {
      if (fabricante && o.fabricante !== fabricante) continue;
      if (!vistos.has(o.modelId)) vistos.set(o.modelId, { id: o.modelId, label: o.modeloLabel });
    }
    return Array.from(vistos.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [ofertasDaLoja, fabricante]);

  // Zero km implica ano do modelo atual: o veículo está saindo da loja agora.
  const anoEfetivo = zeroKm ? ANO_ATUAL : Number(ano);
  const anoValido =
    zeroKm || (Number.isInteger(anoEfetivo) && anoEfetivo >= 1950 && anoEfetivo <= ANO_ATUAL + 1);

  // ── Planos disponíveis para ESTE veículo ──────────────────────────────────
  // Só aparece o que realmente pode ser vendido. O que não pode aparece à parte,
  // com o motivo — senão o vendedor vê uma lista vazia e não sabe o que dizer
  // ao cliente.
  const { disponiveis, recusados } = useMemo(() => {
    const disponiveis: any[] = [];
    const recusados: any[] = [];
    if (!modeloSel || !anoValido) return { disponiveis, recusados };

    for (const o of ofertasDaLoja) {
      if (o.modelId !== modeloSel) continue;
      const av = avaliarCarencia({
        politica: o.politica,
        anoVeiculo: anoEfetivo,
        zeroKm,
      });
      if (!av.elegivel) {
        recusados.push({ oferta: o, motivo: av.motivo });
        continue;
      }
      const preco = calcularPreco(o.precoBase, o.politica, av.faixa);
      disponiveis.push({ oferta: o, av, preco });
    }
    disponiveis.sort((a, b) => a.preco.final - b.preco.final);
    return { disponiveis, recusados };
  }, [ofertasDaLoja, modeloSel, anoEfetivo, anoValido, zeroKm]);

  // Restaurado do eco do servidor: sem isto, qualquer erro apagava a escolha
  // do plano e o botão de salvar ficava desabilitado — dava a impressão de que
  // o formulário tinha se perdido.
  const [planoSel, setPlanoSel] = useState<string>(val.planId ?? "");
  const escolhido = disponiveis.find((d) => d.oferta.planId === planoSel) ?? null;

  const field = (n: string) => (err[n] ? "field has-error col-1" : "field col-1");

  // Cadastro concluído: mostra SÓ as credenciais, sem o formulário embaixo.
  //
  // Deixar os campos preenchidos na tela sugere que nada foi salvo e convida a
  // pessoa a clicar de novo — o que criaria um segundo cliente. A venda já
  // aconteceu; o que resta é passar o acesso ao cliente.
  if (state.ok && state.senhaCliente) {
    return (
      <>
        <CredenciaisCliente
          cpf={mascaraCpf(cpf)}
          senha={state.senhaCliente}
          nome={state.nomeCliente}
          titulo="Cliente cadastrado"
        />
        {/* Se o contrato não foi congelado, quem cadastrou precisa saber AGORA
            — não quando alguém for buscar o documento numa disputa. */}
        {state.avisoContrato && (
          <div className="banner banner-error" style={{ marginBottom: 14 }}>
            <strong>Atenção:</strong> a venda foi registrada, mas o texto do
            contrato não pôde ser arquivado ({state.avisoContrato}). O contrato
            ainda pode ser aberto, porém montado com as cláusulas atuais. Avise
            o suporte.
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <a href="/clientes" className="btn-link-primary">Ver clientes</a>
          {/* href e não botão: recarrega a página e devolve um formulário
              limpo. Reaproveitar o estado atual traria os dados do cliente
              anterior. */}
          <a href="/clientes/nova" className="btn-ghost" style={{ padding: "8px 16px" }}>
            Cadastrar outro cliente
          </a>
        </div>
      </>
    );
  }

  return (
    <form action={action}>
      {state.message && !state.ok && (
        <div className="banner banner-error">
          {state.message}
          {state.clienteExistenteId && (
            <div style={{ marginTop: 8 }}>
              <a
                href={`/clientes/${state.clienteExistenteId}/editar`}
                className="btn-link-primary"
                style={{ fontSize: 13, padding: "5px 12px" }}
              >
                Abrir o cliente que tem esta placa
              </a>
            </div>
          )}
          {state.errors && Object.keys(state.errors).length > 0 && (
            <div style={{ fontSize: 13, marginTop: 6 }}>
              Campos com problema: {Object.keys(state.errors).join(", ")}.
            </div>
          )}
        </div>
      )}

      <Tour id="venda_inicio" passos={TOURS.venda_inicio} />
      <div className="section-label" data-tour="venda-cliente">Cliente</div>
      <div className="grid">
        <div className={field("nome")}>
          <label htmlFor="nome">Nome completo</label>
          <input id="nome" name="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do cliente" />
          {err.nome && <span className="error">{err.nome}</span>}
        </div>
        <div className={field("cpf")}>
          <label htmlFor="cpf">CPF</label>
          <input id="cpf" name="cpf" value={cpf} onChange={(e) => setCpf(mascaraCpf(e.target.value))} onBlur={(e) => verificarCpf(e.target.value)} inputMode="numeric" placeholder="000.000.000-00" />
          {err.cpf && <span className="error">{err.cpf}</span>}
          {avisoCancelou && (
            <span className="error" style={{ color: "#b8860b" }}>
              ⚠ Atenção: este CPF já teve um plano cancelado. Verifique a diferença
              devida antes de reativar.
            </span>
          )}
        </div>
        <div className={field("email")}>
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@email.com" />
          {err.email && <span className="error">{err.email}</span>}
        </div>
        <div className={field("telefone")}>
          <label htmlFor="telefone">Telefone</label>
          <input id="telefone" name="telefone" value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} inputMode="numeric" placeholder="(11) 90000-0000" />
          {err.telefone && <span className="error">{err.telefone}</span>}
        </div>
      </div>

      <div className="section-label">Endereço do cliente</div>
      <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
        Entra no contrato de adesão e vai para a tela de pagamento — o cliente
        não precisa digitar de novo na hora de pagar.
      </p>
      <div className="grid">
        <div className="field col-1">
          <label htmlFor="cep">CEP</label>
          <input
            id="cep"
            name="cep"
            value={cep}
            onChange={(e) => setCep(mascaraCep(e.target.value))}
            onBlur={buscarCep}
            inputMode="numeric"
            placeholder="00000-000"
          />
          <span className="hint">
            {buscandoCep ? "Buscando…" : "Preenche o resto sozinho."}
          </span>
        </div>
        <div className="field col-2">
          <label htmlFor="logradouro">Logradouro</label>
          <input id="logradouro" name="logradouro" value={logradouro} onChange={(e) => setLogradouro(e.target.value)} placeholder="Rua, avenida…" />
        </div>
        <div className="field col-1">
          <label htmlFor="numero">Número</label>
          <input id="numero" name="numero" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="123" />
        </div>
        <div className="field col-1">
          <label htmlFor="complemento">Complemento</label>
          <input id="complemento" name="complemento" value={complemento} onChange={(e) => setComplemento(e.target.value)} placeholder="Apto, bloco…" />
        </div>
        <div className="field col-1">
          <label htmlFor="bairro">Bairro</label>
          <input id="bairro" name="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
        </div>
        <div className="field col-1">
          <label htmlFor="cidade">Cidade</label>
          <input id="cidade" name="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
        </div>
        <div className="field col-1">
          <label htmlFor="uf">UF</label>
          <input id="uf" name="uf" value={uf} onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))} maxLength={2} placeholder="SP" />
        </div>
      </div>

      {isVendedor ? (
        <input type="hidden" name="storeId" value={storeIdVendedor ?? ""} />
      ) : (
        <>
          <div className="section-label">Loja da venda</div>
          <div className="grid">
            <div className={field("storeId")}>
              <label htmlFor="storeId">Loja</label>
              <select
                id="storeId"
                name="storeId"
                value={lojaSel}
                onChange={(e) => {
                  setLojaSel(e.target.value);
                  setFabricante("");
                  setModeloSel("");
                  setPlanoSel("");
                }}
              >
                <option value="" disabled>Selecione a loja…</option>
                {lojas.map((l) => (
                  <option key={l.id} value={l.id}>{l.nome}</option>
                ))}
              </select>
              {err.storeId && <span className="error">{err.storeId}</span>}
            </div>
          </div>
        </>
      )}

      <div className="section-label" data-tour="venda-veiculo">Veículo do cliente</div>
      {!lojaSel ? (
        <p className="hint" style={{ marginTop: 0 }}>
          Escolha a loja para continuar.
        </p>
      ) : ofertasDaLoja.length === 0 ? (
        <div className="banner banner-error">
          Esta loja não tem planos precificados. Defina preços em Lojas → Planos.
        </div>
      ) : (
        <div className="grid">
          <div className="field col-1">
            <label htmlFor="fabricante">Fabricante</label>
            <select
              id="fabricante"
              name="fabricante"
              value={fabricante}
              onChange={(e) => {
                setFabricante(e.target.value);
                setModeloSel("");
                setPlanoSel("");
              }}
            >
              <option value="" disabled>Selecione…</option>
              {fabricantes.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          <div className={field("vehicleModelId")}>
            <label htmlFor="vehicleModelId">Modelo / versão</label>
            <select
              id="vehicleModelId"
              name="vehicleModelId"
              value={modeloSel}
              onChange={(e) => {
                setModeloSel(e.target.value);
                setPlanoSel("");
              }}
              disabled={!fabricante}
            >
              <option value="" disabled>
                {fabricante ? "Selecione…" : "Escolha o fabricante primeiro"}
              </option>
              {modelosDoFabricante.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            {err.vehicleModelId && <span className="error">{err.vehicleModelId}</span>}
          </div>

          <div className={field("ano")}>
            <label htmlFor="ano">Ano do veículo</label>
            <input
              id="ano"
              name="ano"
              inputMode="numeric"
              value={zeroKm ? String(ANO_ATUAL) : ano}
              onChange={(e) => setAno(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder={String(ANO_ATUAL)}
              // readOnly e NÃO disabled: campo `disabled` não é enviado no
              // submit, e o ano chegava nulo no servidor quando era zero km.
              readOnly={zeroKm}
              style={zeroKm ? { background: "var(--bg-soft, #f3f4f6)", cursor: "not-allowed" } : undefined}
            />
            {err.ano ? (
              <span className="error">{err.ano}</span>
            ) : !zeroKm && ano && !anoValido ? (
              <span className="error">Ano inválido (1950 a {ANO_ATUAL + 1}).</span>
            ) : (
              <span className="hint">
                {zeroKm
                  ? "Zero km: ano do modelo atual."
                  : "Como está no documento do veículo."}
              </span>
            )}
          </div>

          {/* Placa OU chassi. Zero km sai da fábrica sem emplacar, e exigir
              placa impedia justamente o cliente mais fácil de converter — quem
              acabou de comprar o veículo. A placa entra depois, pela ficha. */}
          <div className={field("placa")}>
            <label htmlFor="placa">
              Placa{" "}
              <span className="opt">
                {chassi.trim() ? "(opcional — há chassi)" : "(ou informe o chassi)"}
              </span>
            </label>
            <input
              id="placa"
              name="placa"
              value={placa}
              onChange={(e) => setPlaca(mascaraPlaca(e.target.value))}
              placeholder="ABC1D23"
              style={{ textTransform: "uppercase" }}
            />
            {err.placa && <span className="error">{err.placa}</span>}
          </div>

          <div className={field("chassi")}>
            <label htmlFor="chassi">
              Chassi{" "}
              <span className="opt">
                {placa.trim() ? "(opcional — há placa)" : "(para zero km sem placa)"}
              </span>
            </label>
            <input
              id="chassi"
              name="chassi"
              value={chassi}
              onChange={(e) => setChassi(mascaraChassi(e.target.value))}
              placeholder="9BWZZZ377VT004251"
              style={{ textTransform: "uppercase", fontFamily: "ui-monospace, monospace" }}
            />
            {err.chassi ? (
              <span className="error">{err.chassi}</span>
            ) : (
              <span className="hint">
                17 caracteres. A placa pode ser informada depois, na ficha do
                cliente.
              </span>
            )}
          </div>

          <div className="field col-2">
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                name="zeroKm"
                checked={zeroKm}
                onChange={(e) => {
                  const marcado = e.target.checked;
                  setZeroKm(marcado);
                  if (marcado) setAno(String(ANO_ATUAL));
                  setPlanoSel("");
                }}
                style={{ width: "auto", margin: 0 }}
              />
              <span>Veículo zero km</span>
            </label>
            <span className="hint">
              Marque se o veículo está saindo da loja agora. Muda o preço e a carência.
            </span>
          </div>

          {/* Uso do veículo: NÃO afeta preço nem elegibilidade hoje. É registro
              para calibrar a precificação depois — e o km do odômetro é o que
              define quais revisões o cliente ainda tem pela frente. */}
          <div className="field col-1">
            <label htmlFor="kmAtual">Km do odômetro</label>
            <input
              id="kmAtual"
              name="kmAtual"
              inputMode="numeric"
              value={zeroKm ? "0" : kmAtual}
              onChange={(e) => setKmAtual(e.target.value.replace(/\D/g, "").slice(0, 7))}
              placeholder={zeroKm ? "0" : "Ex.: 24500"}
              readOnly={zeroKm}
              style={zeroKm ? { background: "var(--bg-soft, #f3f4f6)" } : undefined}
            />
            <span className="hint">Leia no painel do veículo.</span>
          </div>

          <div className="field col-1">
            <label htmlFor="perfilUso">Perfil de uso</label>
            <select
              id="perfilUso"
              name="perfilUso"
              value={perfilUso}
              onChange={(e) => setPerfilUso(e.target.value)}
            >
              <option value="">Não informado</option>
              <option value="particular">Particular</option>
              <option value="aplicativo">Aplicativo (Uber, 99…)</option>
              <option value="entregas">Entregas / motoboy</option>
              <option value="locacao">Locação</option>
              <option value="frota">Frota / comercial</option>
            </select>
            <span className="hint">Pergunte ao cliente.</span>
          </div>

          <div className="field col-1">
            <label htmlFor="kmMesEstimado">Km por mês (estimado)</label>
            <input
              id="kmMesEstimado"
              name="kmMesEstimado"
              inputMode="numeric"
              value={kmMes}
              onChange={(e) => setKmMes(e.target.value.replace(/\D/g, "").slice(0, 5))}
              placeholder="Ex.: 1200"
            />
            <span className="hint">Quanto o cliente diz que roda.</span>
          </div>
        </div>
      )}

      {/* ── Planos disponíveis para este veículo ── */}
      {modeloSel && anoValido && (
        <>
          <div className="section-label" data-tour="venda-planos">Planos disponíveis para este veículo</div>

          {disponiveis.length === 0 && recusados.length === 0 && (
            <div className="banner banner-error">
              Nenhum plano desta loja cobre este modelo. Verifique em Lojas → Planos
              se o modelo está incluído e precificado.
            </div>
          )}

          {disponiveis.map((d) => {
            const marcado = planoSel === d.oferta.planId;
            return (
              <label
                key={d.oferta.planId}
                style={{
                  display: "block",
                  border: marcado ? "2px solid #4ec3e0" : "1px solid var(--line)",
                  background: marcado ? "rgba(78,195,224,0.08)" : undefined,
                  borderRadius: 8,
                  padding: "12px 14px",
                  marginBottom: 10,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <input
                    type="radio"
                    name="planId"
                    value={d.oferta.planId}
                    checked={marcado}
                    onChange={() => setPlanoSel(d.oferta.planId)}
                    style={{ width: "auto", margin: "4px 0 0 0" }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <strong>{d.oferta.planoNome}</strong>
                      <span className="plan-price">R$ {formatarBRL(d.preco.final)}/mês</span>
                    </div>
                    {d.oferta.planoDescricao && (
                      <div className="store-sub" style={{ marginTop: 2 }}>
                        {d.oferta.planoDescricao}
                      </div>
                    )}
                    <div className="hint" style={{ marginTop: 6 }}>
                      {d.preco.acrescimoPercent > 0 ? (
                        <>
                          Base R$ {formatarBRL(d.preco.base)} + {formatarBRL(d.preco.acrescimoPercent)}%
                          pela faixa {d.av.faixaRotulo} (R$ {formatarBRL(d.preco.acrescimoValor)}).
                        </>
                      ) : (
                        <>Sem acréscimo por idade.</>
                      )}
                      {" · "}
                      {d.av.meses > 0 ? (
                        <strong>
                          Carência de {d.av.meses} {d.av.meses === 1 ? "mês" : "meses"} —
                          cobertura a partir de {formatarData(d.av.carenciaAte)}
                        </strong>
                      ) : (
                        <strong>Sem carência</strong>
                      )}
                    </div>
                  </div>
                </div>
              </label>
            );
          })}

          {/* Planos que existem mas não servem: mostrar o motivo evita o
              vendedor achar que o sistema está com defeito. */}
          {recusados.length > 0 && (
            <div className="banner banner-error">
              <strong>
                {recusados.length === 1
                  ? "1 plano não aceita este veículo:"
                  : `${recusados.length} planos não aceitam este veículo:`}
              </strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                {recusados.map((r) => (
                  <li key={r.oferta.planId} style={{ fontSize: 13 }}>
                    {r.oferta.planoNome} — {r.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {escolhido && (
            <>
              {/* Montado só quando o plano é escolhido: é aí que a carência
                  aparece, e é aí que o tour dela precisa começar. */}
              <Tour id="venda_plano" passos={TOURS.venda_plano} />
              <input type="hidden" name="precoContratado" value={escolhido.preco.final.toFixed(2)} />
              <div
                style={{
                  background: "rgba(78,195,224,0.12)",
                  border: "1px solid rgba(78,195,224,0.5)",
                  borderRadius: 8,
                  padding: "12px 14px",
                  marginTop: 4,
                }}
                data-tour="venda-carencia"
              >
                <strong>Confirme com o cliente antes de fechar</strong>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  {escolhido.oferta.planoNome} · R$ {formatarBRL(escolhido.preco.final)}/mês
                  {escolhido.av.meses > 0 ? (
                    <>
                      {" "}· o cliente <strong>paga desde o primeiro mês</strong>, mas só
                      pode usar o plano a partir de{" "}
                      <strong>{formatarData(escolhido.av.carenciaAte)}</strong>.
                    </>
                  ) : (
                    <> · cobertura disponível desde o início.</>
                  )}
                </div>

                {/* Caso real: o cliente acabou de pagar uma revisão e quer o
                    plano. Cobrar carência é cobrar duas vezes pelo mesmo
                    serviço, e a venda se perde no balcão. */}
                {/* Migração: o cliente vinha de um plano anterior da
                    concessionária e mantém o preço que pagava — senão a
                    migração vira aumento e ele cancela.
                    Só a Veilig, e fica marcado como migrada. */}
                {isVeilig && (
                  <div
                    style={{
                      border: "1px dashed var(--line)",
                      borderRadius: 8,
                      padding: "12px 14px",
                      marginTop: 10,
                    }}
                  >
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        name="migracao"
                        checked={migracao}
                        onChange={(e) => setMigracao(e.target.checked)}
                      />
                      <span style={{ fontWeight: 600 }}>Migração de plano anterior</span>
                    </label>

                    {migracao && (
                      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                        <div>
                          <label htmlFor="primeiroVencimento">Primeiro vencimento</label>
                          <input
                            id="primeiroVencimento"
                            name="primeiroVencimento"
                            type="date"
                            value={primeiroVencimento}
                            min={new Date().toISOString().slice(0, 10)}
                            max={new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)}
                            onChange={(e) => setPrimeiroVencimento(e.target.value)}
                          />
                          <span className="hint">
                            Em branco, a primeira cobrança vence hoje. Use para
                            manter a data de cobrança que o cliente já tinha —
                            até 60 dias à frente. A carência continua contando
                            da data da venda.
                          </span>
                        </div>

                        <div>
                          <label htmlFor="precoMigracao">Preço que o cliente já pagava</label>
                          <input
                            id="precoMigracao"
                            name="precoMigracao"
                            inputMode="decimal"
                            value={precoMigracao}
                            onChange={(e) => setPrecoMigracao(e.target.value)}
                            placeholder={formatarBRL(escolhido.preco.final)}
                          />
                          <span className="hint">
                            Substitui o preço do plano ({formatarBRL(escolhido.preco.final)}
                            /mês). Mínimo R$ 5,00.
                          </span>
                        </div>

                        <div>
                          <label htmlFor="vendedorMigracao">Vendedor responsável</label>
                          <select
                            id="vendedorMigracao"
                            name="vendedorMigracao"
                            value={vendedorMigracao}
                            onChange={(e) => setVendedorMigracao(e.target.value)}
                          >
                            <option value="">Sem vendedor (administração)</option>
                            {(vendedoresPorLoja[lojaSel] ?? []).map((v) => (
                              <option key={v.id} value={v.id}>{v.nome}</option>
                            ))}
                          </select>
                          <span className="hint">
                            Sem isso, o cliente migrado fica sem dono e não entra
                            na apuração de comissão.
                          </span>
                        </div>

                        <div>
                          <label htmlFor="migracaoObs">Observação</label>
                          <input
                            id="migracaoObs"
                            name="migracaoObs"
                            value={migracaoObs}
                            onChange={(e) => setMigracaoObs(e.target.value)}
                            placeholder="Ex.: plano próprio da loja desde 03/2024."
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div data-tour="venda-negociar">
                <SolicitarIsencao
                  cpf={cpf}
                  vehicleModelId={modeloSel}
                  planId={escolhido.oferta.planId}
                  storeId={lojaSel}
                  mesesCarencia={escolhido.av.meses}
                />
                </div>
              </div>
            </>
          )}
        </>
      )}

      <div className="actions">
        <button type="submit" className="btn-primary" disabled={pending || !escolhido} data-tour="venda-concluir">
          {pending ? "Salvando…" : "Cadastrar cliente"}
        </button>
        <a href="/clientes" className="btn-ghost" style={{ padding: "11px 20px" }}>
          Cancelar
        </a>
      </div>
    </form>
  );
}
