"use client";

import { useActionState, useMemo, useState } from "react";
import { criarUsuario, type FormState } from "./actions";
import { PAPEIS } from "@/lib/usuario-validation";
import { mascaraCpf } from "@/lib/mascaras";
import { CredenciaisUsuario } from "@/components/CredenciaisUsuario";

const initial: FormState = { ok: false };

type Grupo = { id: string; nome: string };
type Loja = { id: string; nome: string; groupId: string };

export function UsuarioForm({
  isVeilig,
  papel,
  grupos,
  lojas,
}: {
  isVeilig: boolean;
  papel?: string;
  grupos: Grupo[];
  lojas: Loja[];
}) {
  const [state, action, pending] = useActionState(criarUsuario, initial);
  const err = state.errors || {};
  const val = state.values || {};
  // Controlados: com defaultValue, um erro do servidor devolveria o
  // formulário com os campos vazios e a pessoa reescreveria tudo.
  const [email, setEmail] = useState(val.email ?? "");
  const [nome, setNome] = useState(val.nome ?? "");
  const [storeId, setStoreId] = useState(val.storeId ?? "");


  const isGestorLoja = papel === "store_manager";

  // Papéis disponíveis conforme quem cria:
  // - Veilig: todos
  // - group_admin: gestor de loja ou vendedor
  // - store_manager: só vendedor
  const papeisDisponiveis = isVeilig
    ? PAPEIS
    : isGestorLoja
    ? PAPEIS.filter((p) => p.valor === "store_admin")
    : PAPEIS.filter((p) => p.valor === "store_manager" || p.valor === "store_admin");

  const [role, setRole] = useState<string>(val.role || (isVeilig ? "" : isGestorLoja ? "store_admin" : ""));
  const [grupoSel, setGrupoSel] = useState<string>(val.groupId || "");
  const [cpf, setCpf] = useState(mascaraCpf(val.cpf ?? ""));

  // Lojas do grupo escolhido (para vendedor).
  const lojasDoGrupo = useMemo(() => {
    const g = isVeilig ? grupoSel : "";
    // group_admin/store_manager: as lojas já vêm filtradas pelo tenant no servidor.
    if (!isVeilig) return lojas;
    if (!g) return [];
    return lojas.filter((l) => l.groupId === g);
  }, [isVeilig, grupoSel, lojas]);

  const precisaGrupo = isVeilig && (role === "group_admin" || role === "store_admin" || role === "store_manager");
  // gestor de loja cria vendedor na própria loja (não precisa escolher loja);
  // demais criadores de vendedor/gestor escolhem a loja.
  const precisaLoja = !isGestorLoja && (role === "store_admin" || role === "store_manager");

  return (
    <form action={action}>
      {/* A senha é aleatória e só existe neste instante — se não for copiada
          aqui, ninguém mais a conhece. O botão de WhatsApp existe porque é o
          caminho real: sem ele, o gestor transcreve à mão e erra um caractere
          de uma senha tipo H7K2-M9PX. */}
      {state.ok && state.senhaProvisoria && (
        <>
          <CredenciaisUsuario
            nome={state.nomeUsuario}
            email={state.emailUsuario ?? ""}
            senha={state.senhaProvisoria}
            titulo="Usuário criado"
          />
          <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
            <a href="/usuarios" className="btn-link-primary">Ver usuários</a>
            <a href="/usuarios/nova" className="btn-ghost" style={{ padding: "8px 16px" }}>Criar outro</a>
          </div>
        </>
      )}

      {state.message && !state.ok && (
        <div className="banner banner-error">{state.message}</div>
      )}

      <div className="section-label">Dados do usuário</div>
      <div className="grid">
        <div className={err.nome ? "field has-error col-1" : "field col-1"}>
          <label htmlFor="nome">Nome</label>
          <input id="nome" name="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
          {err.nome && <span className="error">{err.nome}</span>}
        </div>
        <div className={err.email ? "field has-error col-1" : "field col-1"}>
          <label htmlFor="email">E-mail (login)</label>
          <input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com" />
          {err.email && <span className="error">{err.email}</span>}
        </div>
        <div className={err.cpf ? "field has-error col-1" : "field col-1"}>
          <label htmlFor="cpf">CPF <span className="opt">(opcional)</span></label>
          <input id="cpf" name="cpf" value={cpf} onChange={(e) => setCpf(mascaraCpf(e.target.value))} inputMode="numeric" placeholder="000.000.000-00" />
          {err.cpf ? (
            <span className="error">{err.cpf}</span>
          ) : (
            <span className="hint">A senha provisória é gerada automaticamente.</span>
          )}
        </div>
        <div className={err.role ? "field has-error col-1" : "field col-1"}>
          <label htmlFor="role">Papel</label>
          <select
            id="role"
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="" disabled>
              Selecione…
            </option>
            {papeisDisponiveis.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.rotulo}
              </option>
            ))}
          </select>
          {err.role && <span className="error">{err.role}</span>}
        </div>

        {precisaGrupo && (
          <div className={err.groupId ? "field has-error col-1" : "field col-1"}>
            <label htmlFor="groupId">Grupo</label>
            <select
              id="groupId"
              name="groupId"
              value={grupoSel}
              onChange={(e) => setGrupoSel(e.target.value)}
            >
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

        {precisaLoja && (
          <div className={err.storeId ? "field has-error col-1" : "field col-1"}>
            <label htmlFor="storeId">Loja do vendedor</label>
            <select id="storeId" name="storeId" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="" disabled>
                {isVeilig && !grupoSel ? "Escolha o grupo primeiro…" : "Selecione a loja…"}
              </option>
              {lojasDoGrupo.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
            {err.storeId && <span className="error">{err.storeId}</span>}
          </div>
        )}
      </div>

      <div className="actions">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Criando…" : "Criar usuário"}
        </button>
        <a href="/usuarios" className="btn-ghost" style={{ padding: "11px 20px" }}>
          Cancelar
        </a>
      </div>
    </form>
  );
}
