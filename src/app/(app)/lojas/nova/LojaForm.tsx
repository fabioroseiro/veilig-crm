"use client";

import { useActionState, useState } from "react";
import { criarLoja, type FormState } from "./actions";
import { mascaraCnpj, mascaraCep, mascaraCpf, mascaraTelefone } from "@/lib/mascaras";
import { usarCep } from "@/lib/usar-cep";

const initial: FormState = { ok: false };

type Grupo = { id: string; nome: string };

export function LojaForm({
  fabricantes,
  grupos,
  valoresIniciais,
  acaoCustomizada,
  textoBotao = "Cadastrar loja",
}: {
  fabricantes: string[];
  grupos: Grupo[] | null;
  valoresIniciais?: Record<string, string>;
  acaoCustomizada?: (prev: FormState, fd: FormData) => Promise<FormState>;
  textoBotao?: string;
}) {
  const [state, formAction, pending] = useActionState(acaoCustomizada ?? criarLoja, initial);
  const err = state.errors || {};
  // valores: erro de submit tem prioridade; senão, os valores iniciais (edição)
  const val = { ...(valoresIniciais || {}), ...(state.values || {}) };

  const [cnpj, setCnpj] = useState(mascaraCnpj(val.cnpj ?? ""));
  // TODOS controlados: com defaultValue, um erro do servidor devolvia o
  // formulário com os campos vazios — a pessoa reescrevia tudo sem saber por
  // quê. Foi o que aconteceu ao salvar sem walletId: grupo e fabricante
  // sumiram junto.
  const [grupoId, setGrupoId] = useState(val.groupId ?? "");
  const [fabricante, setFabricante] = useState(val.fabricante ?? "");
  const [razaoSocial, setRazaoSocial] = useState(val.razaoSocial ?? "");
  const [nomeFantasia, setNomeFantasia] = useState(val.nomeFantasia ?? "");
  const [inscricaoEstadual, setInscricaoEstadual] = useState(val.inscricaoEstadual ?? "");
  const [numero, setNumero] = useState(val.numero ?? "");
  const [complemento, setComplemento] = useState(val.complemento ?? "");
  const [responsavelNome, setResponsavelNome] = useState(val.responsavelNome ?? "");
  const [email, setEmail] = useState(val.email ?? "");
  const [walletId, setWalletId] = useState(val.walletId ?? "");

  const [cep, setCep] = useState(mascaraCep(val.cep ?? ""));
  // Controlados para receberem o preenchimento automático do CEP — com
  // defaultValue, o React não atualiza o campo depois da montagem.
  const [logradouro, setLogradouro] = useState(val.logradouro ?? "");
  const [bairro, setBairro] = useState(val.bairro ?? "");
  const [cidade, setCidade] = useState(val.cidade ?? "");
  const [uf, setUf] = useState(val.uf ?? "");

  const { buscar: buscarCep, buscando: buscandoCep, naoEncontrado: cepNaoAchado } =
    usarCep((e) => {
      if (e.logradouro) setLogradouro(e.logradouro);
      if (e.bairro) setBairro(e.bairro);
      if (e.cidade) setCidade(e.cidade);
      if (e.uf) setUf(e.uf);
    });
  const [respCpf, setRespCpf] = useState(mascaraCpf(val.responsavelCpf ?? ""));
  const [telefone, setTelefone] = useState(mascaraTelefone(val.telefone ?? ""));

  const field = (name: string) => (err[name] ? "field has-error" : "field");

  return (
    <form action={formAction}>
      {state.message && !state.ok && (
        <div className="banner banner-error">{state.message}</div>
      )}

      <div className="section-label">Identificação</div>
      <div className="grid">
        {grupos && (
          <div className={`${field("groupId")} col-1`}>
            <label htmlFor="groupId">Grupo</label>
            <select id="groupId" name="groupId" value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
              <option value="" disabled>
                Selecione o grupo…
              </option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
            {err.groupId && <span className="error">{err.groupId}</span>}
          </div>
        )}

        <div className={`${field("fabricante")} col-1`}>
          <label htmlFor="fabricante">Fabricante</label>
          <select id="fabricante" name="fabricante" value={fabricante} onChange={(e) => setFabricante(e.target.value)}>
            <option value="" disabled>
              Selecione…
            </option>
            {fabricantes.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          {err.fabricante && <span className="error">{err.fabricante}</span>}
        </div>

        <div className={`${field("cnpj")} col-1`}>
          <label htmlFor="cnpj">CNPJ</label>
          <input id="cnpj" name="cnpj" value={cnpj} onChange={(e) => setCnpj(mascaraCnpj(e.target.value))} inputMode="numeric" placeholder="00.000.000/0000-00" />
          {err.cnpj && <span className="error">{err.cnpj}</span>}
        </div>

        <div className={`${field("razaoSocial")} col-1`}>
          <label htmlFor="razaoSocial">Razão social</label>
          <input id="razaoSocial" name="razaoSocial" value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} placeholder="Loja Exemplo LTDA" />
          {err.razaoSocial && <span className="error">{err.razaoSocial}</span>}
        </div>

        <div className={`${field("nomeFantasia")} col-1`}>
          <label htmlFor="nomeFantasia">Nome fantasia</label>
          <input id="nomeFantasia" name="nomeFantasia" value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} placeholder="Loja Exemplo" />
          {err.nomeFantasia && <span className="error">{err.nomeFantasia}</span>}
        </div>

        <div className={`${field("inscricaoEstadual")} col-1`}>
          <label htmlFor="inscricaoEstadual">
            Inscrição estadual <span className="opt">(opcional)</span>
          </label>
          <input id="inscricaoEstadual" name="inscricaoEstadual" value={inscricaoEstadual} onChange={(e) => setInscricaoEstadual(e.target.value)} />
        </div>
      </div>

      <div className="section-label">Endereço</div>
      <div className="grid">
        <div className={`${field("cep")} col-1`}>
          <label htmlFor="cep">CEP</label>
          <input
            id="cep"
            name="cep"
            value={cep}
            onChange={(e) => setCep(mascaraCep(e.target.value))}
            onBlur={() => buscarCep(cep)}
            inputMode="numeric"
            placeholder="00000-000"
          />
          <span className="hint">
            {buscandoCep
              ? "Buscando…"
              : cepNaoAchado
              ? "CEP não encontrado — preencha à mão."
              : "Preenche o resto sozinho."}
          </span>
          {err.cep && <span className="error">{err.cep}</span>}
        </div>
        <div className={`${field("uf")} col-1`}>
          <label htmlFor="uf">UF</label>
          <input id="uf" name="uf" value={uf} onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))} placeholder="SP" maxLength={2} />
          {err.uf && <span className="error">{err.uf}</span>}
        </div>
        <div className={`${field("logradouro")} col-2`}>
          <label htmlFor="logradouro">Logradouro</label>
          <input id="logradouro" name="logradouro" value={logradouro} onChange={(e) => setLogradouro(e.target.value)} placeholder="Avenida Paulista" />
          {err.logradouro && <span className="error">{err.logradouro}</span>}
        </div>
        <div className={`${field("numero")} col-1`}>
          <label htmlFor="numero">Número</label>
          <input id="numero" name="numero" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="1000" />
          {err.numero && <span className="error">{err.numero}</span>}
        </div>
        <div className={`${field("complemento")} col-1`}>
          <label htmlFor="complemento">
            Complemento <span className="opt">(opcional)</span>
          </label>
          <input id="complemento" name="complemento" value={complemento} onChange={(e) => setComplemento(e.target.value)} />
        </div>
        <div className={`${field("bairro")} col-1`}>
          <label htmlFor="bairro">Bairro</label>
          <input id="bairro" name="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Bela Vista" />
          {err.bairro && <span className="error">{err.bairro}</span>}
        </div>
        <div className={`${field("cidade")} col-1`}>
          <label htmlFor="cidade">Cidade</label>
          <input id="cidade" name="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="São Paulo" />
          {err.cidade && <span className="error">{err.cidade}</span>}
        </div>
      </div>

      <div className="section-label">Responsável e contato</div>
      <div className="grid">
        <div className={`${field("responsavelNome")} col-1`}>
          <label htmlFor="responsavelNome">Responsável</label>
          <input id="responsavelNome" name="responsavelNome" value={responsavelNome} onChange={(e) => setResponsavelNome(e.target.value)} placeholder="Nome do responsável" />
          {err.responsavelNome && <span className="error">{err.responsavelNome}</span>}
        </div>
        <div className={`${field("responsavelCpf")} col-1`}>
          <label htmlFor="responsavelCpf">
            CPF do responsável <span className="opt">(opcional)</span>
          </label>
          <input id="responsavelCpf" name="responsavelCpf" value={respCpf} onChange={(e) => setRespCpf(mascaraCpf(e.target.value))} inputMode="numeric" placeholder="000.000.000-00" />
        </div>
        <div className={`${field("email")} col-1`}>
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contato@loja.com" />
          {err.email && <span className="error">{err.email}</span>}
        </div>
        <div className={`${field("telefone")} col-1`}>
          <label htmlFor="telefone">Telefone</label>
          <input id="telefone" name="telefone" value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} inputMode="numeric" placeholder="(11) 90000-0000" />
          {err.telefone && <span className="error">{err.telefone}</span>}
        </div>
      </div>

      <div className="section-label">Recebimento</div>
      <div className="grid">
        <div className="wallet-callout">
          A loja precisa ter uma conta na <strong>Asaas</strong>. Ao criar a conta,
          a Asaas gera um <strong>walletId</strong> — cole-o abaixo. É por ele que a
          loja recebe sua parte de cada assinatura.
        </div>
        <div className={`${field("walletId")} col-2`}>
          <label htmlFor="walletId">
            walletId da Asaas <span className="opt">(pode deixar para depois)</span>
          </label>
          <input
            id="walletId"
            name="walletId" value={walletId} onChange={(e) => setWalletId(e.target.value)}
            placeholder="0021c712-d963-4d86-a59d-031e7ac51a2e"
          />
          {err.walletId ? (
            <span className="error">{err.walletId}</span>
          ) : (
            <span className="hint">
              Identificador no formato UUID, no painel da Asaas da loja. Abrir a
              conta leva alguns dias, então dá para cadastrar tudo agora e
              preencher isto depois — <strong>a loja só não vende enquanto
              estiver em branco</strong>.
            </span>
          )}
        </div>
      </div>

      <div className="actions">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Salvando…" : textoBotao}
        </button>
        <a href="/lojas" className="btn-ghost" style={{ padding: "11px 20px" }}>
          Cancelar
        </a>
      </div>
    </form>
  );
}
