import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { q } from "@/lib/db";
import { propostaPorToken, remetenteProposta, emitidaISO, vencida } from "@/lib/proposta";
import { onboardingDe, ONBOARDING } from "@/lib/proposta-tipos";
import { conteudoProposta, dataExtenso } from "@/lib/proposta-conteudo";
import { PropostaDoc } from "@/components/PropostaDoc";
import { AcoesCliente } from "@/components/AcoesCliente";
import { hojeISO, somaDias } from "@/lib/regras";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Proposta comercial | Veilig", robots: { index: false, follow: false } };

// Leitores de link (antivírus de e-mail, pré-visualização) não contam como abertura.
const ROBO = /bot|crawl|spider|preview|scan|safelinks|proofpoint|mimecast|barracuda|headless|python|curl|wget/i;

export default async function PropostaCliente({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) notFound();
  const p = await propostaPorToken(token);
  if (!p || p.status === "rascunho") notFound();

  const h = await headers();
  const ua = h.get("user-agent") || "";
  if (p.status !== "cancelada" && !ROBO.test(ua) && !h.get("next-action")) {
    const primeira = !p.aberta_em;
    await q("UPDATE proposta SET aberturas=aberturas+1, aberta_em=COALESCE(aberta_em, now()) WHERE id=$1", [p.id]);
    if (primeira) await q("INSERT INTO atividade (grupo_id, tipo, resumo) VALUES ($1,'email',$2)", [p.grupo_id, `Proposta ${p.numero} aberta pelo cliente`]);
  }

  const rem = await remetenteProposta();
  const c = conteudoProposta(p.dados, p.numero, emitidaISO(p), p.validade, rem);
  const expirada = vencida(p);

  return (
    <main className="cliente">
      {p.status === "cancelada" ? (
        <div className="aviso atencao" style={{ marginBottom: 16 }}>Esta proposta foi substituída ou cancelada. Fale com {rem.nome} ({rem.email}) para receber a versão atual.</div>
      ) : p.status === "aceita" ? (
        <div className="aviso ok" style={{ marginBottom: 16 }}>Proposta aceita em {new Date(p.aceita_em!).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} por {p.aceite?.nome}{p.aceite?.onboarding ? `, com onboarding ${ONBOARDING[p.aceite.onboarding].nome}` : ""}. O próximo passo é a assinatura do contrato.</div>
      ) : p.status === "prazo_pedido" ? (
        <div className="aviso atencao" style={{ marginBottom: 16 }}>Pedido de prazo até {dataExtenso(p.prazo_pedido!.data)} registrado. Vamos confirmar a nova data com você.</div>
      ) : expirada ? (
        <div className="aviso atencao" style={{ marginBottom: 16 }}>A validade desta proposta terminou em {dataExtenso(p.validade)}. Se precisar, peça mais prazo abaixo.</div>
      ) : null}

      <div className="linha" style={{ justifyContent: "flex-end", marginBottom: 12 }}>
        {p.status !== "cancelada" && <a className="btn" href={`/p/${token}/pdf`} target="_blank" rel="noopener">Baixar PDF</a>}
      </div>
      <PropostaDoc c={c} />

      {["enviada", "prazo_pedido"].includes(p.status) && (
        <AcoesCliente token={token} podeAceitar={!expirada} contato={{ nome: p.dados.contato_nome, cargo: p.dados.contato_cargo, email: p.dados.contato_email }}
          minData={somaDias(hojeISO(), 1)} sugestao={somaDias(p.validade < hojeISO() ? hojeISO() : p.validade, 15)}
          escolherOnboarding={onboardingDe(p.dados) === "ambos"} />
      )}
    </main>
  );
}
