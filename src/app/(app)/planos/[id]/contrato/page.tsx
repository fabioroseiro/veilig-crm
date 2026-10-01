import Link from "next/link";
import { notFound } from "next/navigation";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { eq } from "drizzle-orm";
import { dadosDoContrato } from "@/lib/contrato";
import { DocumentoContrato } from "@/components/DocumentoContrato";
import { BotaoImprimir } from "./BotaoImprimir";

export const dynamic = "force-dynamic";

/**
 * MINUTA do contrato — o contrato do plano, sem cliente.
 *
 * É o documento que o vendedor mostra antes de fechar. Onde entrariam dados do
 * cliente, aparece um marcador visível: quem lê precisa enxergar que é uma
 * minuta, não um contrato firmado.
 *
 * Lê o plano ao vivo de propósito: a minuta representa as condições de HOJE,
 * para quem ainda vai contratar. O contrato do cliente é outra peça e vai ler
 * um snapshot congelado na venda.
 */
export default async function MinutaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ loja?: string }>;
}) {
  const { id } = await params;
  const { loja: lojaParam } = await searchParams;
  const ctx = await getSessionContext();

  const { dados, lojas } = await withTenant(ctx, async (tx) => {
    // Vendedor e gestor veem a própria loja; Veilig e grupo escolhem.
    const listaLojas = await tx
      .select({ id: schema.stores.id, nome: schema.stores.nomeFantasia })
      .from(schema.stores)
      .orderBy(schema.stores.nomeFantasia);

    const storeId = ctx.storeId ?? lojaParam ?? listaLojas[0]?.id ?? null;
    return { dados: await dadosDoContrato(tx, id, storeId), lojas: listaLojas };
  });

  if (!dados) notFound();
  const { grupo, loja, plano } = dados;
  const hoje = new Date().toLocaleDateString("pt-BR");

  return (
    <main className="content">
      <div className="nao-imprimir">
        <p className="crumb" style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 6 }}>
          <Link href="/planos">Planos</Link> / {plano.nome} / Minuta
        </p>
        <h1>Minuta do contrato</h1>
        <p className="subtitle">
          Modelo do contrato deste plano, sem os dados do cliente. Serve para
          mostrar as condições antes de fechar a venda — salve em PDF para
          enviar, ou copie o link.
        </p>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 18 }}>
          <BotaoImprimir compartilhar />
          {!ctx.storeId && lojas.length > 1 && (
            <form method="get" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label htmlFor="loja" style={{ fontSize: 14 }}>Loja:</label>
              <select id="loja" name="loja" defaultValue={lojaParam ?? ""} style={{ width: "auto" }}>
                {lojas.map((l) => (
                  <option key={l.id} value={l.id}>{l.nome}</option>
                ))}
              </select>
              <button type="submit" className="btn-ghost" style={{ padding: "8px 14px" }}>
                Trocar
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Mesmo componente do contrato do cliente: se fossem duas telas, o
          texto divergiria com o tempo — e a diferença entre o que o vendedor
          mostrou e o que o cliente assinou aparece numa disputa. */}
      <DocumentoContrato dados={dados} hoje={hoje} />
    </main>
  );
}
