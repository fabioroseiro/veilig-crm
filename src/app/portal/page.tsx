import { redirect } from "next/navigation";
import { formatarPlacaExibicao } from "@/lib/mascaras";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getClienteAuthId } from "@/lib/cliente-session";
import { CancelarAssinaturaCliente } from "./CancelarAssinaturaCliente";
import { InformarPlaca } from "./InformarPlaca";
import { estadoAssinaturaAsaas } from "@/lib/asaas";
import { emCarencia, formatarData, diasRestantesCarencia } from "@/lib/carencia";
import { PortalHeader } from "./PortalHeader";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, { txt: string; cls: string }> = {
  paga: { txt: "Paga", cls: "badge-ok" },
  ativa: { txt: "Ativa", cls: "badge-ok" },
  pendente: { txt: "Pendente", cls: "badge-pending" },
  atrasada: { txt: "Atrasada", cls: "badge-error" },
  cancelada: { txt: "Cancelada", cls: "badge-pending" },
};

async function getDados() {
  const authId = await getClienteAuthId();
  if (!authId) return null;

  // resolve a credencial → person_id
  const cred = await db.execute(sql`SELECT * FROM customer_auth_by_id(${authId})`);
  const c = (Array.isArray(cred) ? cred : (cred as any).rows)[0] as
    | { person_id: string; precisa_trocar_senha: boolean; status: string }
    | undefined;
  if (!c || c.status !== "ativo") return null;
  if (c.precisa_trocar_senha) redirect("/portal/trocar-senha");

  // Primeira entrada depois da troca de senha: uma tela só, dizendo desde
  // quando o plano pode ser usado. Ataca a confusão de carência pelo lado do
  // cliente — ele fica sabendo por escrito, não só pelo vendedor.
  let onboardingPendente = false;
  try {
    const ro = await db.execute(sql`SELECT onboarding_pendente_cliente(${authId}::uuid) AS p`);
    onboardingPendente = (Array.isArray(ro) ? ro : (ro as any).rows)[0]?.p === true;
  } catch {
    // Sem a migração, segue para o portal — a tela é conveniência.
  }
  if (onboardingPendente) redirect("/portal/bem-vindo");

  const nomeR = await db.execute(sql`SELECT nome_do_cliente(${c.person_id}) AS nome`);
  const nome = (Array.isArray(nomeR) ? nomeR : (nomeR as any).rows)[0]?.nome ?? "Cliente";

  const subsR = await db.execute(sql`SELECT * FROM assinaturas_do_cliente(${c.person_id})`);
  const subs = (Array.isArray(subsR) ? subsR : (subsR as any).rows) as any[];

  // Carência: função própria (SECURITY DEFINER), para não mexer na
  // assinaturas_do_cliente() que já está em produção. Resiliente: se falhar,
  // o portal segue sem o aviso de carência em vez de quebrar.
  const carencias: Record<string, { ate: string | null; meses: number | null }> = {};
  try {
    const carR = await db.execute(
      sql`SELECT * FROM carencia_das_assinaturas(${c.person_id})`
    );
    const linhas = (Array.isArray(carR) ? carR : (carR as any).rows) as any[];
    for (const l of linhas) {
      carencias[l.subscription_id] = { ate: l.carencia_ate, meses: l.carencia_meses };
    }
  } catch (e: any) {
    console.error("[PORTAL] falha ao ler carência:", e?.message);
  }

  // Veículos ainda sem placa: comprados zero km, antes do emplacamento.
  const placasPendentes: Record<string, string | null> = {};
  try {
    const r = await db.execute(
      sql`SELECT * FROM placa_pendente_do_cliente(${c.person_id}::uuid)`
    );
    for (const l of (Array.isArray(r) ? r : (r as any).rows) as any[]) {
      placasPendentes[l.subscription_id] = l.chassi ?? null;
    }
  } catch (e: any) {
    console.error("[PORTAL] falha ao ler placas pendentes:", e?.message);
  }

  // Estado de SINCRONIZAÇÃO: a assinatura chegou a existir na Asaas?
  //
  // Sem isto o portal mostrava "Ativa" para uma venda que falhou ao criar a
  // cobrança — o cliente achava que estava coberto e ninguém cobrava nada.
  const sincronia: Record<string, { temAsaas: boolean; erro: string | null }> = {};
  try {
    const r = await db.execute(
      sql`SELECT * FROM sincronizacao_das_assinaturas(${c.person_id}::uuid)`
    );
    for (const l of (Array.isArray(r) ? r : (r as any).rows) as any[]) {
      sincronia[l.subscription_id] = {
        temAsaas: l.tem_asaas === true,
        erro: l.sync_erro ?? null,
      };
    }
  } catch (e: any) {
    console.error("[PORTAL] falha ao ler sincronização:", e?.message);
  }

  // consulta o estado de cada assinatura no Asaas (meio de pagamento + fatura).
  // Resiliente: se a consulta falhar, o portal cai no link salvo no banco.
  const subsComEstado = await Promise.all(
    subs.map(async (s) => {
      let estado = null;
      if (s.asaas_subscription_id) {
        estado = await estadoAssinaturaAsaas(s.asaas_subscription_id);
      }
      return {
        ...s,
        estado,
        carencia: carencias[s.subscription_id] ?? null,
        placaPendente: s.subscription_id in placasPendentes,
        chassiVeiculo: placasPendentes[s.subscription_id] ?? null,
        // Ausência de registro = assume sincronizado, para não alarmar por
        // falha de leitura. O caso que importa é o explicitamente sem Asaas.
        semCobranca: sincronia[s.subscription_id]
          ? !sincronia[s.subscription_id].temAsaas
          : false,
      };
    })
  );

  return { nome, subs: subsComEstado };
}

export default async function PortalPage() {
  const dados = await getDados();
  if (!dados) redirect("/portal/login");

  const { nome, subs } = dados;

  return (
    <div className="portal-shell">
      <PortalHeader nome={nome} />

      <main className="portal-main">
        <h1>Seus planos</h1>
        <p className="subtitle">Acompanhe suas assinaturas e pagamentos.</p>

        {subs.length === 0 ? (
          <div className="card">
            <p style={{ margin: 0 }}>Você ainda não possui assinaturas ativas.</p>
          </div>
        ) : (
          subs.map((s) => {
            const estado = s.estado; // vem do Asaas (pode ser null se a consulta falhou)

            // link a usar: o da fatura relevante (Asaas) ou o salvo no banco
            const link = estado?.linkFatura || s.link_pagamento || null;
            const temFaturaAberta = estado?.temFaturaAberta ?? false;
            const ehCartao = estado?.ehCartao ?? false;
            const temPaga = estado?.temPaga ?? false;
            const proximoVenc = estado?.proximoVencimento
              ? new Date(estado.proximoVencimento).toLocaleDateString("pt-BR")
              : null;

            // O selo deve refletir o MESMO estado do corpo (evita "Pendente" no
            // topo e "em dia" embaixo). Se cancelada, respeita. Senão, deriva do
            // estado ao vivo da Asaas; se a consulta falhou, cai no status do banco.
            let selo = statusLabel[s.status] || { txt: s.status, cls: "badge-pending" };

            // Assinatura que nunca chegou à Asaas NÃO pode aparecer como ativa:
            // não existe cobrança, e dizer "Ativa" faz o cliente acreditar que
            // está coberto. Tem precedência sobre qualquer outro selo.
            if (s.status !== "cancelada" && (s as any).semCobranca) {
              selo = { txt: "Em processamento", cls: "badge-pending" };
            } else if (s.status !== "cancelada" && estado) {
              if (temFaturaAberta) selo = { txt: "Pendente", cls: "badge-pending" };
              else if (temPaga) selo = { txt: "Paga", cls: "badge-ok" };
            }
            const st = selo;
            const preco = Number(s.preco).toFixed(2).replace(".", ",");

            return (
              <div key={s.subscription_id} className="card portal-sub">
                <div className="portal-sub-head">
                  <div>
                    <div className="portal-plan">{s.plano_nome}</div>
                    <div className="portal-veh">
                      {s.veiculo_marca} {s.veiculo_modelo} · {s.veiculo_ano}
                      {s.veiculo_placa
                        ? ` · ${formatarPlacaExibicao(s.veiculo_placa)}`
                        : (s as any).chassiVeiculo
                        ? ` · chassi ${(s as any).chassiVeiculo}`
                        : ""}
                    </div>
                  </div>
                  {/* Pagamento e direito de uso são DUAS dimensões distintas.
                      O cliente pode estar em dia e ainda em carência. Por isso
                      são dois selos, não um só. */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span className={`badge ${st.cls}`}>{st.txt}</span>
                    {s.status !== "cancelada" && emCarencia(s.carencia?.ate) && (
                      <span className="badge badge-pending">Em carência</span>
                    )}
                  </div>
                </div>

                <div className="portal-sub-body">
                  <div className="portal-valor">
                    <span className="portal-valor-num">R$ {preco}</span>
                    <span className="portal-valor-lbl">/mês</span>
                  </div>

                  {/* Carência: o cliente já paga, mas ainda não pode usar.
                      Precisa ficar explícito para ele não ir à loja em vão. */}
                  {s.status !== "cancelada" && emCarencia(s.carencia?.ate) && (
                    <div
                      style={{
                        background: "rgba(78,195,224,0.12)",
                        border: "1px solid rgba(78,195,224,0.5)",
                        borderRadius: 8,
                        padding: "10px 12px",
                        marginBottom: 12,
                        fontSize: 14,
                      }}
                    >
                      <strong>
                        Cobertura disponível a partir de {formatarData(s.carencia?.ate)}
                      </strong>
                      <br />
                      <span style={{ fontSize: 13 }}>
                        {/* Não afirmar que o plano "está ativo": ele só vale
                            depois do primeiro pagamento, e este bloco aparece
                            antes disso também. A cobrança, essa sim, já começou. */}
                        A cobrança do plano já começou. O uso das manutenções
                        começa nessa data
                        {(() => {
                          const dias = diasRestantesCarencia(s.carencia?.ate);
                          return dias > 0 ? ` (faltam ${dias} ${dias === 1 ? "dia" : "dias"})` : "";
                        })()}
                        .
                      </span>
                    </div>
                  )}

                  <div className="nao-imprimir" style={{ marginBottom: 10 }}>
                    <a
                      href={`/portal/contrato/${s.subscription_id}`}
                      style={{ fontSize: 13, textDecoration: "underline" }}
                    >
                      Ver contrato
                    </a>
                  </div>

                  {(s as any).placaPendente && (
                    <InformarPlaca
                      subscriptionId={s.subscription_id}
                      chassi={(s as any).chassiVeiculo}
                    />
                  )}

                  {/* Venda que não gerou cobrança: o cliente precisa saber que
                      ainda não está valendo, sem detalhe técnico que não o
                      ajuda. */}
                  {s.status !== "cancelada" && (s as any).semCobranca && (
                    <div className="banner banner-error" style={{ marginBottom: 10 }}>
                      <strong>Assinatura ainda não ativada.</strong> A cobrança
                      deste plano não pôde ser gerada, então ele ainda não está
                      valendo. Procure a concessionária para concluir a
                      contratação.
                    </div>
                  )}

                  {/* 1) Fatura vencida/vencendo → pagar agora */}
                  {temFaturaAberta && link && (
                    <div className="portal-actions">
                      <a href={link} target="_blank" rel="noopener noreferrer" className="btn-primary">
                        Pague agora
                      </a>
                    </div>
                  )}

                  {/* 2) Em dia (tem pagamento e nenhuma fatura aberta) */}
                  {!temFaturaAberta && temPaga && (
                    <div className="portal-em-dia">
                      <span className="portal-auto-dot" style={{ background: "#34a853" }} />
                      <span>
                        Você está em dia.
                        {proximoVenc && ` Próxima cobrança em ${proximoVenc}.`}
                        {ehCartao ? " A cobrança no cartão é automática." : ""}
                      </span>
                      {!ehCartao && link && (
                        <div style={{ marginTop: 8 }}>
                          <a href={link} target="_blank" rel="noopener noreferrer" className="btn-ghost" style={{ padding: "9px 16px" }}>
                            Ver próxima fatura
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3) Sem pagamento ainda e sem fatura aberta → ver fatura (boleto/pix) */}
                  {!temFaturaAberta && !temPaga && link && !ehCartao && (
                    <div className="portal-actions">
                      <a href={link} target="_blank" rel="noopener noreferrer" className="btn-ghost" style={{ padding: "11px 20px" }}>
                        Veja sua fatura
                      </a>
                    </div>
                  )}

                  {s.status !== "cancelada" && (
                    <CancelarAssinaturaCliente subscriptionId={s.subscription_id} />
                  )}
                </div>
              </div>
            );
          })
        )}

        <p className="portal-note">
          Pagamentos e troca de cartão acontecem no ambiente seguro do Asaas. A
          Veilig nunca armazena os dados do seu cartão.
        </p>
      </main>
    </div>
  );
}
