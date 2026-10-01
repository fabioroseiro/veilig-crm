import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getClienteAuthId } from "@/lib/cliente-session";
import { DocumentoContrato } from "@/components/DocumentoContrato";
import { montarDadosClienteDaFuncao } from "@/lib/contrato-cliente";
import { BotaoImprimir } from "@/app/(app)/planos/[id]/contrato/BotaoImprimir";

export const dynamic = "force-dynamic";

/**
 * Contrato no portal do cliente.
 *
 * CUIDADO QUE JÁ CUSTOU UM BUG: o portal roda SEM contexto de tenant — o
 * cliente final não é usuário do sistema. Consultar `subscription`, `customer`,
 * `vehicle` ou `plan` diretamente aqui devolve VAZIO, porque o RLS bloqueia, e
 * a página cai em 404 sem explicação.
 *
 * Tudo passa por contrato_do_cliente(), que é SECURITY DEFINER e já cruza a
 * assinatura com a pessoa logada — o que também garante a posse: trocar o id
 * na URL não mostra o contrato de outra pessoa.
 */
export default async function ContratoPortalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const authId = await getClienteAuthId();
  if (!authId) redirect("/portal/login");

  const cred = await db.execute(
    sql`SELECT person_id FROM customer_auth WHERE id = ${authId}::uuid LIMIT 1`
  );
  const personId = (Array.isArray(cred) ? cred : (cred as any).rows)[0]?.person_id;
  if (!personId) redirect("/portal/login");

  const r = await db.execute(
    sql`SELECT * FROM contrato_do_cliente(${personId}::uuid, ${id}::uuid)`
  );
  const linha = (Array.isArray(r) ? r : (r as any).rows)[0];

  // Função DEDICADA, não JOIN com `subscription`: o portal roda sem contexto
  // de tenant e o RLS bloquearia a tabela — foi exatamente o que causou o 404
  // quando o contrato foi criado.
  const rh = await db.execute(
    sql`SELECT contrato_html_do_cliente(${personId}::uuid, ${id}::uuid) AS html`
  );
  const contratoHtml =
    ((Array.isArray(rh) ? rh : (rh as any).rows)[0]?.html as string | null) ?? null;

  const hoje = new Date().toLocaleDateString("pt-BR");
  const info = linha ? montarDadosClienteDaFuncao(linha) : null;

  // Sem snapshot (venda anterior ao congelamento) o portal não consegue
  // reconstruir o plano — e não deve tentar, porque mostraria o plano de hoje
  // como se fosse o contratado. Explica em vez de dar 404.
  if (!info) {
    return (
      <main className="portal-main">
        <p style={{ fontSize: 13, marginBottom: 6 }}>
          <Link href="/portal">← Voltar</Link>
        </p>
        <h1>Contrato</h1>
        <div className="banner banner-error">
          {!linha
            ? "Contrato não encontrado."
            : "Este contrato foi firmado antes do registro eletrônico do documento. Solicite uma via à concessionária."}
        </div>
      </main>
    );
  }

  return (
    <main className="portal-main">
      <div className="nao-imprimir" style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 13, marginBottom: 6 }}>
          <Link href="/portal">← Voltar</Link>
        </p>
        <h1>Seu contrato</h1>
        <p className="subtitle">
          {info.cliente.aceitoEm
            ? "Contrato firmado — o aceite foi formalizado pelo pagamento da primeira mensalidade."
            : "Este documento passa a valer como contrato com o pagamento da primeira mensalidade."}
        </p>
        <BotaoImprimir />
      </div>

      {/* Texto congelado tem precedência: é o documento que o cliente aceitou. */}
      {/* Se o texto guardado ainda é o da venda (sem aceite) mas o pagamento já
          foi confirmado, renderiza ao vivo em vez de mostrar um documento pago
          que se declara "proposta". A regravação acontece quando alguém abre o
          contrato pelo painel, que é onde há contexto de tenant para gravar. */}
      {contratoHtml && !(info.cliente.aceitoEm && contratoHtml.includes("aguardando primeiro pagamento")) ? (
        <div dangerouslySetInnerHTML={{ __html: contratoHtml }} />
      ) : (
        <DocumentoContrato dados={info.dados} cliente={info.cliente} hoje={hoje} />
      )}
    </main>
  );
}
