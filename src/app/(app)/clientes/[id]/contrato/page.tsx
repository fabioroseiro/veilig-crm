import Link from "next/link";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { eq, desc } from "drizzle-orm";
import { DocumentoContrato } from "@/components/DocumentoContrato";
import { montarDadosCliente } from "@/lib/contrato-cliente";
import { congelarContrato } from "@/lib/congelar-contrato";
import { BotaoImprimir } from "../../../planos/[id]/contrato/BotaoImprimir";

export const dynamic = "force-dynamic";

/**
 * Contrato do cliente — o documento firmado, com tudo preenchido.
 *
 * Lê o SNAPSHOT congelado na venda, nunca a tabela `plan`. Um contrato que
 * mudasse junto com o plano não provaria nada em disputa.
 */
export default async function ContratoClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getSessionContext();

  const info = await withTenant(ctx, async (tx) => {
    const subs = await tx
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.customerId, id))
      .orderBy(desc(schema.subscriptions.createdAt))
      .limit(1);
    const sub = subs[0];
    if (!sub) return null;

    const info = await montarDadosCliente(tx, sub);
    if (!info) return null;

    // ── Regenera quando o ACEITE chega ──────────────────────────────────
    //
    // O texto é congelado na VENDA, quando ainda não houve pagamento. O aceite
    // só é registrado depois, pelo webhook. Sem isto, o documento arquivado
    // dizia para sempre "aguardando primeiro pagamento" e "constitui proposta,
    // sem eficácia contratual" — mesmo já pago. Um contrato pago que se declara
    // proposta é pior que não ter contrato congelado.
    //
    // Regenera UMA vez, quando o aceite existe e o texto guardado ainda não o
    // reflete. Depois disso, o documento não muda mais.
    // No modo "ver como" a transação é somente leitura: regravar aqui faria a
    // página inteira falhar. O contrato é mostrado como está.
    const precisaRegerar =
      !ctx.somenteLeitura &&
      sub.aceitoEm != null &&
      (!info.contratoHtml || info.contratoHtml.includes("aguardando primeiro pagamento"));

    if (precisaRegerar) {
      const novo = congelarContrato(
        info.dados,
        info.cliente,
        new Date(sub.aceitoEm as any).toLocaleDateString("pt-BR")
      );
      if (novo) {
        await tx
          .update(schema.subscriptions)
          .set({ contratoHtml: novo })
          .where(eq(schema.subscriptions.id, sub.id));
        return { ...info, contratoHtml: novo };
      }
    }

    return info;
  });

  const hoje = new Date().toLocaleDateString("pt-BR");

  // 404 aqui seria cruel: o cliente existe, só não tem assinatura. Dizer isso
  // é mais útil que uma página de "não encontrado".
  if (!info) {
    return (
      <main className="content">
        <p className="crumb" style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 6 }}>
          <Link href="/clientes">Clientes</Link> / Contrato
        </p>
        <h1>Contrato</h1>
        <div className="banner banner-error">
          Este cliente não tem assinatura, ou o plano contratado não está mais
          disponível. O contrato só existe a partir de uma assinatura.
        </div>
      </main>
    );
  }

  return (
    <main className="content">
      <div className="nao-imprimir">
        <p className="crumb" style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 6 }}>
          <Link href="/clientes">Clientes</Link> / {info.cliente.nome} / Contrato
        </p>
        <h1>Contrato do cliente</h1>
        <p className="subtitle">
          {info.cliente.aceitoEm
            ? "Contrato firmado — o aceite foi formalizado pelo pagamento."
            : "Proposta — o contrato passa a existir com o pagamento da primeira mensalidade."}
        </p>

        {!info.contratoHtml && (
          <div className="banner banner-error">
            Esta venda é anterior ao congelamento do texto. As cláusulas abaixo
            são <strong>as de hoje</strong>, que podem não ser as que este
            cliente aceitou. Não use como peça de disputa sem conferir.
          </div>
        )}
        {!info.temSnapshot && (
          <div className="banner banner-error">
            Esta venda é anterior ao congelamento do conteúdo do plano. O
            documento abaixo foi montado com o plano <strong>como ele está
            hoje</strong>, que pode não ser o que foi contratado. Não use como
            peça de disputa.
          </div>
        )}

        <div style={{ marginBottom: 18 }}>
          <BotaoImprimir />
        </div>
      </div>

      {/* Se o texto foi congelado na venda, é ELE que vale — não o componente
          de hoje. É essa independência que dá valor probatório ao documento:
          ele continua sendo o que o cliente aceitou, ainda que as cláusulas
          tenham mudado depois. */}
      {info.contratoHtml ? (
        <div dangerouslySetInnerHTML={{ __html: info.contratoHtml }} />
      ) : (
        <DocumentoContrato dados={info.dados} cliente={info.cliente} hoje={hoje} />
      )}
    </main>
  );
}
