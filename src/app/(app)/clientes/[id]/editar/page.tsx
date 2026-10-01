import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { eq, sql } from "drizzle-orm";
import { EditarClienteForm } from "./EditarClienteForm";
import { BotaoAcao } from "@/components/BotaoAcao";
import { alternarStatusCliente } from "./actions";
import { BotaoNovaSenha } from "./BotaoNovaSenha";
import { PassagemLoja } from "./PassagemLoja";
import { passagensDaAssinatura } from "./actions";
import { mascaraCpf } from "@/lib/mascaras";
import { CancelarAssinaturaLoja } from "./CancelarAssinaturaLoja";
import { BotaoEstorno } from "../BotaoEstorno";
import { BotaoBoasVindas } from "./BotaoBoasVindas";

export const dynamic = "force-dynamic";

async function getCliente(id: string) {
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: schema.customers.id,
        personId: schema.customers.personId,
        email: schema.customers.email,
        emailVerificadoEm: schema.customers.emailVerificadoEm,
        telefone: schema.customers.telefone,
        status: schema.customers.status,
      })
      .from(schema.customers)
      .where(eq(schema.customers.id, id))
      .limit(1);
    const c = rows[0];
    if (!c) return null;

    // veículo do cliente (para editar a placa)
    const vRows = await tx
      .select({ id: schema.vehicles.id, placa: schema.vehicles.placa, chassi: schema.vehicles.chassi })
      .from(schema.vehicles)
      .where(eq(schema.vehicles.customerId, c.id))
      .limit(1);
    const veiculo = vRows[0] ?? null;

    // assinatura ativa do cliente (para permitir cancelar)
    const sRows = await tx
      .select({
        id: schema.subscriptions.id,
        status: schema.subscriptions.status,
      })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.customerId, c.id))
      .limit(1);
    const assinatura = sRows[0] ?? null;

    // Origem do cancelamento: a contagem no painel Veilig responde "quantos",
    // mas não "quem cancelou ESTE". Era a pergunta que faltava.
    let origem: { origem: string | null; em: Date | null; por: string | null; estorno: any } | null = null;
    if (assinatura?.id) {
      const ro = await tx.execute(sql`
        SELECT s.cancelamento_origem AS origem,
               s.cancelada_em        AS em,
               u.nome                AS por,
               s.estornada_em        AS estornada_em,
               s.estorno_valor       AS estorno_valor,
               s.estorno_motivo      AS estorno_motivo
        FROM subscription s
        LEFT JOIN app_user u ON u.id = s.cancelamento_por
        WHERE s.id = ${assinatura.id}::uuid
      `);
      const l = (Array.isArray(ro) ? ro : (ro as any).rows)[0] as any;
      if (l?.em || l?.estornada_em) {
        origem = {
          origem: l.origem ?? null,
          em: l.em ?? null,
          por: l.por ?? null,
          estorno: l.estornada_em
            ? { em: l.estornada_em, valor: l.estorno_valor, motivo: l.estorno_motivo }
            : null,
        };
      }
    }

    // nome/cpf da person (global)
    const r = await tx.execute(
      sql`SELECT nome_completo AS nome, cpf FROM persons_by_ids(${"{" + c.personId + "}"}::uuid[])`
    );
    const pessoa = (Array.isArray(r) ? r : (r as any).rows)[0] as { nome: string; cpf: string } | undefined;

    return { c, nome: pessoa?.nome ?? "", cpf: pessoa?.cpf ?? "", veiculo, assinatura, origem };
  });
}

function fmtCpf(cpf: string) {
  const d = (cpf || "").padStart(11, "0");
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!["veilig_admin", "group_admin", "store_manager", "store_admin"].includes(ctx.role)) redirect("/");

  const dados = await getCliente(id);
  if (!dados) notFound();

  const { c, nome, cpf, veiculo, assinatura, origem } = dados;

  // Passagens do cliente pela loja — contador de visitas, base da tese de que
  // o plano traz o cliente de volta.
  const passagens = assinatura ? await passagensDaAssinatura(assinatura.id) : [];

  return (
      <main className="content">
        <p className="crumb" style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 6 }}>
          <Link href="/clientes">Clientes</Link> / Editar
        </p>
        <h1>Editar cliente</h1>
        <p className="subtitle">
          CPF {fmtCpf(cpf)} — o CPF não pode ser alterado.
        </p>

        <div className="card">
          <EditarClienteForm
            customerId={c.id}
            personId={c.personId}
            vehicleId={veiculo?.id ?? null}
            valoresIniciais={{ nome, email: c.email, telefone: c.telefone, placa: veiculo?.placa ?? "" }}
          />
        </div>

        {assinatura && assinatura.status !== "cancelada" && (
          <div className="card" style={{ marginTop: 16 }}>
            {/* O e-mail verificado importa: a recuperação de senha do cliente
                depende dele. Endereço errado = cliente sem caminho de volta. */}
            <BotaoBoasVindas
              customerId={c.id}
              email={c.email ?? null}
              verificadoEm={c.emailVerificadoEm ? String(c.emailVerificadoEm) : null}
            />

            <div className="section-label">Assinatura</div>
            <p className="hint" style={{ marginTop: 0 }}>
              Cancelar interrompe a cobrança recorrente na Asaas (o cliente não é
              mais cobrado nos próximos meses). É diferente de inativar o cliente.
            </p>
            <CancelarAssinaturaLoja subscriptionId={assinatura.id} />
          </div>
        )}

        {assinatura && assinatura.status === "cancelada" && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="section-label">Assinatura</div>
            <p className="hint" style={{ marginTop: 0, marginBottom: 0 }}>
              A assinatura deste cliente está cancelada.
            </p>
          </div>
        )}

        <div className="card" style={{ marginTop: 16 }}>
          {assinatura && (
            <>
              <div className="section-label">Passagens na loja</div>
              <div style={{ marginBottom: 20 }}>
                <PassagemLoja
                  subscriptionId={assinatura.id}
                  passagensIniciais={passagens.map((p) => ({
                    id: p.id,
                    observacao: p.observacao,
                    createdAt: p.createdAt,
                    registradoPor: p.registradoPor,
                  }))}
                />
              </div>
            </>
          )}

          {assinatura && (
            <>
              {/* Zero km vendido sem placa: o emplacamento leva dias, e sem um
              lembrete o cadastro fica incompleto para sempre. */}
          {veiculo && !veiculo.placa && veiculo.chassi && (
            <div className="banner banner-error" style={{ marginBottom: 16 }}>
              <strong>Placa pendente.</strong> Este veículo foi cadastrado pelo
              chassi ({veiculo.chassi}). Assim que for emplacado, informe a
              placa no campo acima.
            </div>
          )}

          {/* Arrependimento (art. 49 do CDC): só na primeira parcela, em 7
              dias, sem utilização. As regras são verificadas no servidor. */}
          {assinatura?.id && (
            <>
              {origem && (
            <div className="banner" style={{ background: "rgba(0,0,0,.04)", marginBottom: 16 }}>
              {origem.em && (
                <div>
                  <strong>Cancelada</strong> em{" "}
                  {new Date(origem.em).toLocaleDateString("pt-BR")}
                  {origem.origem === "cliente"
                    ? " — pelo próprio cliente, no portal"
                    : origem.origem === "inadimplencia"
                    ? " — automaticamente, por inadimplência"
                    : origem.origem
                    ? ` — pela ${origem.origem === "veilig" ? "administração Veilig" : "loja"}${
                        origem.por ? `, por ${origem.por}` : ""
                      }`
                    : " — origem não registrada (anterior ao registro)"}
                </div>
              )}
              {origem.estorno && (
                <div style={{ marginTop: 6 }}>
                  <strong>Estornada</strong> em{" "}
                  {new Date(origem.estorno.em).toLocaleDateString("pt-BR")}
                  {origem.estorno.valor ? ` · R$ ${Number(origem.estorno.valor).toFixed(2).replace(".", ",")}` : ""}
                  {origem.estorno.motivo ? ` · ${origem.estorno.motivo}` : ""}
                </div>
              )}
            </div>
          )}

          {/* Transferência: o veículo foi vendido e o comprador assume o plano.
              A cláusula 11-e já prevê — não é automático, depende deste ato. */}
          {assinatura?.id && (
            <>
              <div className="section-label">Transferência</div>
              <p className="hint" style={{ marginTop: 0 }}>
                O novo proprietário assume com o mesmo valor e a carência já cumprida.
              </p>
              <Link href={`/clientes/${c.id}/transferir`} className="btn-ghost" style={{ padding: "6px 14px", fontSize: 13 }}>
                Transferir plano
              </Link>
            </>
          )}

          <div className="section-label">Estorno</div>
              <BotaoEstorno subscriptionId={assinatura.id} />
            </>
          )}

          <div className="section-label">Contrato</div>
              <div style={{ marginBottom: 20 }}>
                <Link href={`/clientes/${id}/contrato`} className="btn-link-primary">
                  Ver contrato do cliente
                </Link>
              </div>
            </>
          )}

          <div className="section-label">Acesso ao portal</div>
          <div style={{ marginBottom: 20 }}>
            <BotaoNovaSenha cpf={mascaraCpf(cpf)} nome={nome} />
          </div>

          <div className="section-label">Situação do cliente</div>
          <p className="hint" style={{ marginTop: 0 }}>
            {c.status === "inativo"
              ? "Este cliente está inativo. Reative para que volte a aparecer normalmente nas listas."
              : "Inativar oculta o cliente das listas do dia a dia sem apagar o histórico. A cobrança na Asaas não é afetada."}
          </p>
          <form
            action={async () => {
              "use server";
              await alternarStatusCliente(c.id, c.status === "inativo" ? "ativo" : "inativo");
            }}
          >
            <BotaoAcao className="btn-ghost" style={{ padding: "10px 18px" }}>
              {c.status === "inativo" ? "Reativar cliente" : "Inativar cliente"}
            </BotaoAcao>
          </form>
        </div>
      </main>

  );
}
