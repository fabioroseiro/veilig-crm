"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { transferirPlano, type TransferirState } from "./actions";
import { mascaraCpf, mascaraTelefone, mascaraCep } from "@/lib/mascaras";
import { CredenciaisCliente } from "@/components/CredenciaisCliente";
import { usarCep } from "@/lib/usar-cep";

const inicial: TransferirState = { ok: false };

export function TransferirForm({
  customerId,
  resumo,
}: {
  customerId: string;
  resumo: {
    titular: string;
    plano: string;
    veiculo: string;
    preco: string;
    carenciaAte: string | null;
    proximoVencimento: string | null;
  };
}) {
  const [state, action, pending] = useActionState(transferirPlano, inicial);
  const v = state.values ?? {};

  const [cpf, setCpf] = useState(v.cpf ?? "");
  const [telefone, setTelefone] = useState(v.telefone ?? "");
  const [cep, setCep] = useState(v.cep ?? "");
  const [logradouro, setLogradouro] = useState(v.logradouro ?? "");
  const [bairro, setBairro] = useState(v.bairro ?? "");

  const [cidade, setCidade] = useState(v.cidade ?? "");
  const [uf, setUf] = useState(v.uf ?? "");

  // Mesmo preenchimento automático da venda — no balcão, sete campos digitados
  // à mão é atrito demais.
  const { buscar: buscarCepBase, buscando, naoEncontrado } = usarCep((e) => {
    if (e.logradouro) setLogradouro(e.logradouro);
    if (e.bairro) setBairro(e.bairro);
    if (e.cidade) setCidade(e.cidade);
    if (e.uf) setUf(e.uf);
  });
  const buscarCep = () => buscarCepBase(cep);

  if (state.ok) {
    return (
      <>
        <div className="banner banner-success" style={{ marginBottom: 14 }}>{state.message}</div>
        {state.senhaCliente && (
          <CredenciaisCliente
            titulo="Acesso do novo proprietário"
            nome={state.nomeCliente ?? ""}
            cpf={cpf}
            senha={state.senhaCliente}
          />
        )}
        <Link href="/clientes" className="btn-link-primary">Voltar para Clientes</Link>
      </>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="customerId" value={customerId} />

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>O que o novo proprietário assume</div>
        <div style={{ display: "grid", gap: 4, fontSize: 14 }}>
          <div>Titular atual: <strong>{resumo.titular}</strong></div>
          <div>Veículo: <strong>{resumo.veiculo}</strong></div>
          <div>Plano: <strong>{resumo.plano}</strong> · <strong>R$ {resumo.preco}</strong>/mês</div>
          <div>
            Carência:{" "}
            <strong>
              {resumo.carenciaAte
                ? `já cumprida até ${resumo.carenciaAte}`
                : "sem carência"}
            </strong>
          </div>
          {resumo.proximoVencimento && (
            <div>Primeira cobrança do novo titular: <strong>{resumo.proximoVencimento}</strong></div>
          )}
        </div>
        <p className="hint" style={{ marginBottom: 0 }}>
          O valor, a carência já cumprida e a data de reajuste seguem com o veículo.
          O histórico de revisões continua o mesmo.
        </p>
      </div>

      <div className="section-label">Novo proprietário</div>

      <div className="form-grid">
        <div className="col-2">
          <label htmlFor="nome">Nome completo</label>
          <input id="nome" name="nome" defaultValue={v.nome} required />
        </div>

        <div className="col-1">
          <label htmlFor="cpf">CPF</label>
          <input
            id="cpf"
            name="cpf"
            inputMode="numeric"
            value={cpf}
            onChange={(e) => setCpf(mascaraCpf(e.target.value))}
            placeholder="000.000.000-00"
            required
          />
        </div>

        <div className="col-2">
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" defaultValue={v.email} required />
          <span className="hint">Recebe o acesso ao portal e os avisos do plano.</span>
        </div>

        <div className="col-1">
          <label htmlFor="telefone">Telefone</label>
          <input
            id="telefone"
            name="telefone"
            inputMode="numeric"
            value={telefone}
            onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
            placeholder="(00) 00000-0000"
          />
        </div>

        <div className="col-1">
          <label htmlFor="cep">CEP</label>
          <input
            id="cep"
            name="cep"
            inputMode="numeric"
            value={cep}
            onChange={(e) => {
              const novo = mascaraCep(e.target.value);
              setCep(novo);
              if (novo.replace(/\D/g, "").length === 8) buscarCep();
            }}
            onBlur={buscarCep}
            placeholder="00000-000"
          />
          {buscando && <span className="hint">Buscando endereço…</span>}
          {naoEncontrado && <span className="hint">CEP não encontrado. Preencha à mão.</span>}
        </div>

        <div className="col-2">
          <label htmlFor="logradouro">Logradouro</label>
          <input id="logradouro" name="logradouro" value={logradouro} onChange={(e) => setLogradouro(e.target.value)} />
        </div>

        <div className="col-1">
          <label htmlFor="numero">Número</label>
          <input id="numero" name="numero" defaultValue={v.numero} />
        </div>

        <div className="col-1">
          <label htmlFor="complemento">Complemento</label>
          <input id="complemento" name="complemento" defaultValue={v.complemento} />
        </div>

        <div className="col-1">
          <label htmlFor="bairro">Bairro</label>
          <input id="bairro" name="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
        </div>

        <div className="col-1">
          <label htmlFor="cidade">Cidade</label>
          <input id="cidade" name="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
        </div>

        <div className="col-1">
          <label htmlFor="uf">UF</label>
          <input id="uf" name="uf" value={uf} maxLength={2} onChange={(e) => setUf(e.target.value.toUpperCase())} />
        </div>
      </div>

      {state.message && (
        <div className="banner banner-error" style={{ marginTop: 14 }}>{state.message}</div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 20, alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" className="btn-primary" style={{ padding: "10px 20px" }} disabled={pending}>
          {pending ? "Transferindo…" : "Confirmar transferência"}
        </button>
        <Link href="/clientes" className="btn-ghost" style={{ padding: "10px 16px" }}>Cancelar</Link>
        <span className="hint" style={{ margin: 0 }}>
          O plano do titular atual é encerrado e o novo recebe o acesso.
        </span>
      </div>
    </form>
  );
}
