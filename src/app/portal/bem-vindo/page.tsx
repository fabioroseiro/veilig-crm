import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getClienteAuthId } from "@/lib/cliente-session";
import { formatarPlacaExibicao } from "@/lib/mascaras";
import { PortalHeader } from "../PortalHeader";

export const dynamic = "force-dynamic";

/**
 * Boas-vindas do cliente: UMA tela, sem passos.
 *
 * O que ela precisa dizer é uma coisa só: desde quando o plano pode ser usado.
 * Foi a falta dessa informação que gerou o primeiro estorno — o cliente achou
 * que podia usar no mesmo dia.
 */
export default async function BemVindoClientePage() {
  const authId = await getClienteAuthId();
  if (!authId) redirect("/portal/login");

  const cred = await db.execute(sql`SELECT * FROM customer_auth_by_id(${authId})`);
  const c = (Array.isArray(cred) ? cred : (cred as any).rows)[0] as
    | { person_id: string; precisa_trocar_senha: boolean; status: string }
    | undefined;
  if (!c || c.status !== "ativo") redirect("/portal/login");
  if (c.precisa_trocar_senha) redirect("/portal/trocar-senha");

  const nomeR = await db.execute(
    sql`SELECT nome_completo AS nome FROM persons_by_ids(${"{" + c.person_id + "}"}::uuid[])`
  );
  const nome = (Array.isArray(nomeR) ? nomeR : (nomeR as any).rows)[0]?.nome ?? "Cliente";

  const subsR = await db.execute(sql`SELECT * FROM assinaturas_do_cliente(${c.person_id})`);
  const subs = ((Array.isArray(subsR) ? subsR : (subsR as any).rows) as any[]).filter(
    (s) => s.status !== "cancelada"
  );

  // Mesmas funções que o portal já usa — sem reimplementar regra de carência.
  const carencia: Record<string, string | null> = {};
  try {
    const r = await db.execute(sql`SELECT * FROM carencia_das_assinaturas(${c.person_id})`);
    for (const l of (Array.isArray(r) ? r : (r as any).rows) as any[]) {
      carencia[l.subscription_id] = l.carencia_ate ?? null;
    }
  } catch {}

  const semPlaca = new Set<string>();
  try {
    const r = await db.execute(sql`SELECT * FROM placa_pendente_do_cliente(${c.person_id}::uuid)`);
    for (const l of (Array.isArray(r) ? r : (r as any).rows) as any[]) semPlaca.add(l.subscription_id);
  } catch {}

  const hoje = new Date().toISOString().slice(0, 10);
  const fmt = (d: string) => String(d).slice(0, 10).split("-").reverse().join("/");

  return (
    <div className="portal-shell">
      <PortalHeader nome={nome} />
      <main className="portal-main" style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1>Bem-vindo, {String(nome).split(" ")[0]}</h1>

        {subs.length === 0 && (
          <p>Você ainda não tem um plano ativo.</p>
        )}

        {subs.map((s) => {
          const ate = carencia[s.subscription_id];
          const emCarencia = ate && String(ate).slice(0, 10) > hoje;
          // CONFIRMED e RECEIVED chegam como "paga"; o resto ainda não foi pago.
          const pago = s.status === "paga";
          const veiculo = s.veiculo_placa
            ? formatarPlacaExibicao(s.veiculo_placa)
            : [s.veiculo_marca, s.veiculo_modelo].filter(Boolean).join(" ");

          return (
            <div key={s.subscription_id} className="card" style={{ marginBottom: 14 }}>
              <p style={{ marginTop: 0 }}>
                Seu plano <strong>{s.plano_nome}</strong> para o veículo{" "}
                <strong>{veiculo || "cadastrado"}</strong> foi contratado.
              </p>

              {/* O plano só vale depois do primeiro pagamento. Dizer "já pode
                  usar" para quem ainda não pagou manda o cliente à oficina
                  sem cobertura — e a loja fica com a explicação. */}
              {!pago ? (
                <div
                  style={{
                    background: "rgba(184,134,11,.12)",
                    borderLeft: "3px solid #b8860b",
                    borderRadius: 6,
                    padding: "12px 14px",
                  }}
                >
                  <strong>Falta confirmar o pagamento.</strong> Seu plano passa a
                  valer assim que a primeira mensalidade for paga.
                  {ate && (
                    <div className="store-sub" style={{ fontSize: 13, marginTop: 4 }}>
                      Depois disso, o plano poderá ser utilizado a partir de{" "}
                      <strong>{fmt(String(ate))}</strong>, conforme a carência do
                      seu contrato.
                    </div>
                  )}
                </div>
              ) : emCarencia ? (
                <div
                  style={{
                    background: "rgba(184,134,11,.12)",
                    borderLeft: "3px solid #b8860b",
                    borderRadius: 6,
                    padding: "12px 14px",
                  }}
                >
                  Você já paga desde a contratação, e pode <strong>usar o plano a partir de{" "}
                  <span style={{ fontSize: 18 }}>{fmt(String(ate))}</span></strong>.
                  <div className="store-sub" style={{ fontSize: 13, marginTop: 4 }}>
                    Esse é o período de carência previsto no seu contrato.
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0 }}>
                  <strong>Você já pode usar o plano.</strong>
                </p>
              )}

              {semPlaca.has(s.subscription_id) && (
                <p className="store-sub" style={{ fontSize: 13, marginBottom: 0 }}>
                  Seu veículo foi cadastrado pelo chassi. Quando tiver a placa, informe no portal.
                </p>
              )}
            </div>
          );
        })}

        <p className="hint">
          No portal você vê suas faturas, o contrato e a situação do plano.
        </p>

        <form method="post" action="/portal/bem-vindo/concluir">
          <button type="submit" className="btn-primary" style={{ padding: "10px 24px" }}>
            Entendi
          </button>
        </form>
      </main>
    </div>
  );
}
