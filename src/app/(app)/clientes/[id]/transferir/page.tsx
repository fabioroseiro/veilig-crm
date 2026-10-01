import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { withTenant } from "@/db";
import { getSessionContext } from "@/lib/session";
import { formatarBRL } from "@/lib/carencia";
import { TransferirForm } from "./TransferirForm";

export const dynamic = "force-dynamic";

const data = (d: string | null) =>
  d ? String(d).slice(0, 10).split("-").reverse().join("/") : null;

/**
 * Transferência do plano para o novo proprietário do veículo.
 *
 * A validação de "pode transferir" é do BANCO. A tela só mostra o motivo
 * quando não dá — o vendedor precisa saber o que responder ao cliente.
 */
export default async function TransferirPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (ctx.role === "veilig_admin" ? false : !["group_admin", "store_manager", "store_admin"].includes(ctx.role)) {
    redirect("/clientes");
  }

  const origem = await withTenant(ctx, async (tx) => {
    const r = await tx.execute(sql`SELECT * FROM assinatura_para_transferir(${id}::uuid)`);
    return (Array.isArray(r) ? r : (r as any).rows)[0] as any;
  });

  return (
    <main className="content">
      <p className="crumb" style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 6 }}>
        <Link href="/clientes">Clientes</Link> / Transferir plano
      </p>
      <h1>Transferir plano</h1>
      <p className="subtitle">
        O veículo foi vendido e o novo proprietário assume o plano. O contrato
        atual é encerrado e um novo é gerado para ele.
      </p>

      {!origem?.pode ? (
        <div className="banner banner-error">
          {origem?.motivo ?? "Não foi possível carregar a assinatura deste cliente."}
        </div>
      ) : (
        <TransferirForm
          customerId={id}
          resumo={{
            titular: origem.titular_atual ?? "—",
            plano: origem.plano_nome ?? "Plano",
            veiculo: origem.veiculo ?? "—",
            preco: formatarBRL(Number(origem.preco)),
            carenciaAte: data(origem.carencia_ate),
            proximoVencimento: data(origem.proximo_vencimento),
          }}
        />
      )}
    </main>
  );
}
