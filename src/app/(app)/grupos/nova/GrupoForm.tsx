"use client";

import { useActionState, useState } from "react";
import { criarGrupo, type FormState } from "./actions";
import { checarDominioEmail } from "./check-email";
import { mascaraCnpj, mascaraTelefone } from "@/lib/mascaras";

const initial: FormState = { ok: false };

// Serve para CRIAR e EDITAR. Na edição recebe a action já ligada ao grupo e os
// valores atuais — um segundo formulário quase igual acabaria divergindo deste.
export function GrupoForm({
  action: acaoCustomizada,
  valoresIniciais,
  rotuloBotao = "Cadastrar grupo",
}: {
  action?: (prev: FormState, fd: FormData) => Promise<FormState>;
  valoresIniciais?: Record<string, string>;
  rotuloBotao?: string;
} = {}) {
  const [state, action, pending] = useActionState(acaoCustomizada ?? criarGrupo, initial);
  const err = state.errors || {};
  // Após um erro vale o eco do servidor; na primeira carga da edição, o banco.
  const val = state.values || valoresIniciais || {};
  const [feePercent, setFeePercent] = useState(val.feePercent ?? "8,00");
  const [multaPercent, setMultaPercent] = useState(val.multaPercent ?? "2,00");
  const [jurosMesPercent, setJurosMesPercent] = useState(val.jurosMesPercent ?? "1,00");
  const [diasCancelamento, setDiasCancelamento] = useState(val.diasCancelamento ?? "60");
  const [apuracaoDiaInicio, setApuracaoDiaInicio] = useState(val.apuracaoDiaInicio ?? "1");
  const [apuracaoDiaFim, setApuracaoDiaFim] = useState(val.apuracaoDiaFim ?? "31");
  const [indiceReajuste, setIndiceReajuste] = useState(val.indiceReajuste ?? "IPCA");
  // Controlados: com defaultValue, um erro do servidor devolveria o
  // formulário com os campos vazios e a pessoa reescreveria tudo.
  const [nomeFantasia, setNomeFantasia] = useState(val.nomeFantasia ?? "");
  const [razaoSocial, setRazaoSocial] = useState(val.razaoSocial ?? "");
  const [responsavelNome, setResponsavelNome] = useState(val.responsavelNome ?? "");
  const [tetoReajustePercent, setTetoReajustePercent] = useState(val.tetoReajustePercent ?? "");

  const cls = (name: string) => (err[name] ? "field has-error" : "field");

  const [cnpj, setCnpj] = useState(mascaraCnpj(val.cnpj ?? ""));

  // ── E-mail do responsável ────────────────────────────────────────────────
  // A validação de formato sozinha não basta: "fulano@yahoo.com.brsssss" é
  // sintaticamente perfeito. Só o DNS sabe que o domínio não existe.
  const [email, setEmail] = useState(val.responsavelEmail ?? "");
  const [dominioRuim, setDominioRuim] = useState(false);
  const [checandoEmail, setChecandoEmail] = useState(false);

  async function verificarDominio() {
    if (!email.includes("@")) return;
    setChecandoEmail(true);
    try {
      const r = await checarDominioEmail(email);
      setDominioRuim(!r.ok);
    } catch {
      // Falha na checagem não bloqueia: é conferência auxiliar, e travar o
      // cadastro por instabilidade de DNS seria desproporcional.
      setDominioRuim(false);
    } finally {
      setChecandoEmail(false);
    }
  }
  const [telefone, setTelefone] = useState(mascaraTelefone(val.telefone ?? ""));

  return (
    <form action={action}>
      {state.message && !state.ok && (
        <div className="banner banner-error">{state.message}</div>
      )}

      <div className="section-label">Identificação</div>
      <div className="grid">
        <div className={`${cls("razaoSocial")} col-1`}>
          <label htmlFor="razaoSocial">Razão social</label>
          <input id="razaoSocial" name="razaoSocial" value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} placeholder="Grupo Exemplo S.A." />
          {err.razaoSocial && <span className="error">{err.razaoSocial}</span>}
        </div>
        <div className={`${cls("nomeFantasia")} col-1`}>
          <label htmlFor="nomeFantasia">
            Nome fantasia <span className="opt">(opcional)</span>
          </label>
          <input id="nomeFantasia" name="nomeFantasia" value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} placeholder="Grupo Exemplo" />
        </div>
        <div className={`${cls("cnpj")} col-1`}>
          <label htmlFor="cnpj">
            CNPJ
          </label>
          <input id="cnpj" name="cnpj" value={cnpj} onChange={(e) => setCnpj(mascaraCnpj(e.target.value))} inputMode="numeric" placeholder="00.000.000/0000-00" />
          {err.cnpj && <span className="error">{err.cnpj}</span>}
        </div>
        <div className={`${cls("feePercent")} col-1`}>
          <label htmlFor="feePercent">Fee Veilig (%)</label>
          <input id="feePercent" name="feePercent" placeholder="8,00" value={feePercent} onChange={(e) => setFeePercent(e.target.value)} />
          {err.feePercent ? (
            <span className="error">{err.feePercent}</span>
          ) : (
            <span className="hint">Percentual que a Veilig retém em cada assinatura.</span>
          )}
        </div>
      </div>

      <div className="section-label">Responsável</div>
      <div className="grid">
        <div className={`${cls("responsavelNome")} col-1`}>
          <label htmlFor="responsavelNome">Nome do responsável</label>
          <input id="responsavelNome" name="responsavelNome" value={responsavelNome} onChange={(e) => setResponsavelNome(e.target.value)} placeholder="Nome completo" />
          {err.responsavelNome && (
            <span className="error">{err.responsavelNome}</span>
          )}
        </div>
        <div className={`${cls("responsavelEmail")} col-1`}>
          <label htmlFor="responsavelEmail">E-mail do responsável</label>
          <input
            id="responsavelEmail"
            name="responsavelEmail"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setDominioRuim(false);
            }}
            onBlur={verificarDominio}
            placeholder="responsavel@grupo.com"
          />
          {err.responsavelEmail ? (
            <span className="error">{err.responsavelEmail}</span>
          ) : dominioRuim ? (
            /* AVISO, não erro: a verificação de DNS é auxiliar e pode errar —
               domínio recém-criado, servidor instável. Quem decide é quem está
               cadastrando, então o formulário continua salvando normalmente. */
            <span className="error" style={{ color: "#b8860b" }}>
              ⚠ Não encontramos o domínio “{email.split("@")[1]}”. Confira a
              digitação — se estiver certo, pode salvar assim mesmo.
            </span>
          ) : (
            <span className="hint">
              {checandoEmail
                ? "Verificando o domínio…"
                : "É por aqui que o grupo recebe avisos e credenciais."}
            </span>
          )}
        </div>
        <div className={`${cls("telefone")} col-1`}>
          <label htmlFor="telefone">
            Telefone <span className="opt">(opcional)</span>
          </label>
          <input id="telefone" name="telefone" value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} inputMode="numeric" placeholder="(11) 90000-0000" />
          {err.telefone && <span className="error">{err.telefone}</span>}
        </div>
      </div>

      {/* Números que as cláusulas do contrato citam. O contrato é do GRUPO com
          o cliente, então eles moram aqui — não na loja nem no plano. */}
      <div className="section-label">Contrato e cobrança</div>
      <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
        Estes valores aparecem no contrato de adesão que o cliente aceita ao
        pagar a primeira mensalidade. Os padrões são os tetos usuais em relação
        de consumo.
      </p>
      <div className="grid">
        <div className={`${cls("multaPercent")} col-1`}>
          <label htmlFor="multaPercent">Multa por atraso (%)</label>
          <input id="multaPercent" name="multaPercent" value={multaPercent} onChange={(e) => setMultaPercent(e.target.value)} placeholder="2,00" />
          {err.multaPercent ? (
            <span className="error">{err.multaPercent}</span>
          ) : (
            <span className="hint">Cobrada uma vez sobre o valor em atraso.</span>
          )}
        </div>
        <div className={`${cls("jurosMesPercent")} col-1`}>
          <label htmlFor="jurosMesPercent">Juros ao mês (%)</label>
          <input id="jurosMesPercent" name="jurosMesPercent" value={jurosMesPercent} onChange={(e) => setJurosMesPercent(e.target.value)} placeholder="1,00" />
          {err.jurosMesPercent ? (
            <span className="error">{err.jurosMesPercent}</span>
          ) : (
            <span className="hint">Calculados proporcionalmente aos dias.</span>
          )}
        </div>
        {/* Período de apuração: cada cliente comissiona em datas distintas.
            1 a 31 é o mês cheio — o padrão, para quem não precisa disso. */}
        <div className={`${cls("apuracaoDiaInicio")} col-1`}>
          <label htmlFor="apuracaoDiaInicio">Apuração começa no dia</label>
          <input
            id="apuracaoDiaInicio"
            name="apuracaoDiaInicio"
            inputMode="numeric"
            value={apuracaoDiaInicio}
            onChange={(e) => setApuracaoDiaInicio(e.target.value)}
            placeholder="1"
          />
          {err.apuracaoDiaInicio ? (
            <span className="error">{err.apuracaoDiaInicio}</span>
          ) : (
            <span className="hint">1 = mês cheio.</span>
          )}
        </div>

        <div className={`${cls("apuracaoDiaFim")} col-1`}>
          <label htmlFor="apuracaoDiaFim">e termina no dia</label>
          <input
            id="apuracaoDiaFim"
            name="apuracaoDiaFim"
            inputMode="numeric"
            value={apuracaoDiaFim}
            onChange={(e) => setApuracaoDiaFim(e.target.value)}
            placeholder="31"
          />
          {err.apuracaoDiaFim ? (
            <span className="error">{err.apuracaoDiaFim}</span>
          ) : (
            <span className="hint">
              Ex.: 26 e 25 fazem outubro ir de 26/09 a 25/10.
            </span>
          )}
        </div>

        <div className={`${cls("diasCancelamento")} col-1`}>
          <label htmlFor="diasCancelamento">Cancelar após (dias de atraso)</label>
          <input id="diasCancelamento" name="diasCancelamento" inputMode="numeric" value={diasCancelamento} onChange={(e) => setDiasCancelamento(e.target.value)} placeholder="60" />
          {err.diasCancelamento ? (
            <span className="error">{err.diasCancelamento}</span>
          ) : (
            <span className="hint">
              As cobranças em aberto são apagadas; para voltar, o cliente assina
              de novo com carência nova.
            </span>
          )}
        </div>
        <div className={`${cls("indiceReajuste")} col-1`}>
          <label htmlFor="indiceReajuste">Índice de reajuste anual</label>
          <input id="indiceReajuste" name="indiceReajuste" value={indiceReajuste} onChange={(e) => setIndiceReajuste(e.target.value)} placeholder="IPCA" />
          {err.indiceReajuste ? (
            <span className="error">{err.indiceReajuste}</span>
          ) : (
            <span className="hint">Aplicado no aniversário de cada contrato.</span>
          )}
        </div>
        <div className={`${cls("tetoReajustePercent")} col-1`}>
          <label htmlFor="tetoReajustePercent">
            Teto do reajuste (%) <span className="opt">(opcional)</span>
          </label>
          <input id="tetoReajustePercent" name="tetoReajustePercent" value={tetoReajustePercent} onChange={(e) => setTetoReajustePercent(e.target.value)} placeholder="sem teto" />
          {err.tetoReajustePercent ? (
            <span className="error">{err.tetoReajustePercent}</span>
          ) : (
            <span className="hint">
              Em branco, a cláusula de teto não aparece no contrato. Um teto
              protege a base num ano de índice anômalo.
            </span>
          )}
        </div>
      </div>

      <div className="actions">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Salvando…" : rotuloBotao}
        </button>
        <a href="/grupos" className="btn-ghost" style={{ padding: "11px 20px" }}>
          Cancelar
        </a>
      </div>
    </form>
  );
}
