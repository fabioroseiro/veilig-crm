import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { dadosDoContrato, descreverRevisao, EXCLUSOES_FIXAS } from "@/lib/contrato";
import { CopiarArgumentos } from "./CopiarArgumentos";

export const dynamic = "force-dynamic";

/**
 * Argumentos de venda — a peça COMERCIAL do plano.
 *
 * Diferente da minuta, que é o contrato em linguagem jurídica para disputa.
 * Aqui o vendedor vê de relance o que oferecer, e tem um texto pronto para
 * mandar ao cliente.
 *
 * As EXCLUSÕES aparecem junto, e isso é deliberado: vendedor que não sabe o
 * que não está coberto promete demais, e a reclamação chega depois — com o
 * cliente já pagando.
 */
export default async function VenderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getSessionContext();

  const dados = await withTenant(ctx, async (tx) => {
    const base = await dadosDoContrato(tx, id, ctx.storeId ?? null);
    if (!base) return null;
    const args = await tx
      .select({ titulo: schema.planArgumentos.titulo, texto: schema.planArgumentos.texto })
      .from(schema.planArgumentos)
      .where(eq(schema.planArgumentos.planId, id))
      .orderBy(schema.planArgumentos.ordem);
    return { ...base, argumentos: args };
  });

  if (!dados) notFound();
  const { plano, argumentos } = dados;

  return (
    <main className="content">
      <p className="crumb" style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 6 }}>
        <Link href="/planos">Planos</Link> / {plano.nome} / Argumentos
      </p>
      <h1>Como vender o {plano.nome}</h1>
      <p className="subtitle">
        O que oferecer, por que vale a pena e o que não está incluso.
      </p>

      <CopiarArgumentos
        nomePlano={plano.nome}
        revisoes={plano.revisoes.map((r) => descreverRevisao(r))}
        beneficios={plano.beneficios.map((b) => b.nome)}
        argumentos={argumentos}
      />

      {/* 1) O que o cliente recebe */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="section-label">O que o cliente recebe</div>
        {plano.revisoes.length === 0 && plano.beneficios.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>
            Este plano ainda não tem revisões nem benefícios cadastrados.
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {plano.revisoes.map((r, i) => (
              <li key={`r${i}`} style={{ marginBottom: 6 }}>
                {descreverRevisao(r)}
              </li>
            ))}
            {plano.beneficios.map((b, i) => (
              <li key={`b${i}`} style={{ marginBottom: 6 }}>
                <strong>{b.nome}</strong>
                {b.descricao ? ` — ${b.descricao}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 2) Por que vale a pena */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="section-label">Por que vale a pena</div>
        {argumentos.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>
            Nenhum argumento cadastrado ainda. O gestor do grupo pode escrevê-los
            na tela de edição do plano.
          </p>
        ) : (
          argumentos.map((a, i) => (
            <div key={i} style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{a.titulo}</div>
              {a.texto.split("\n").map((linha, j) =>
                linha.trim() ? (
                  <p key={j} style={{ margin: "0 0 6px", fontSize: 14 }}>
                    {linha}
                  </p>
                ) : null
              )}
            </div>
          ))
        )}
      </div>

      {/* 3) O que NÃO está incluso — na frente do vendedor, não escondido */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="section-label">O que não está incluso</div>
        <p className="hint" style={{ marginTop: 0 }}>
          Saiba isto antes de prometer. Cliente que descobre depois vira
          reclamação.
        </p>
        {plano.exclusoes && <p style={{ fontSize: 14 }}>{plano.exclusoes}</p>}
        {/* Lista vinda de EXCLUSOES_FIXAS, a mesma que alimenta o contrato.
            Escrevê-la aqui à mão faria os dois textos divergirem — e a
            divergência entre o que o vendedor mostrou e o que o contrato diz é
            o que aparece na reclamação. */}
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
          {EXCLUSOES_FIXAS.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
        <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
          O que este plano cobre nas revisões — peças, mão de obra ou os dois —
          está descrito no bloco acima, e varia conforme o cadastro.
        </p>
        {plano.condicoes && (
          <>
            <div className="section-label" style={{ marginTop: 16 }}>Condições</div>
            <p style={{ fontSize: 14, margin: 0 }}>{plano.condicoes}</p>
          </>
        )}
      </div>

      <p className="hint" style={{ marginTop: 18 }}>
        O contrato completo está na{" "}
        <Link href={`/planos/${id}/contrato`}>minuta</Link>.
      </p>
    </main>
  );
}
