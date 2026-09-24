import { lerTokenSair } from "@/lib/mensagem";
import { q, q1 } from "@/lib/db";
import { parar } from "@/lib/cadencia";

export const dynamic = "force-dynamic";

/** Descadastro público (link do rodapé dos e-mails). Confirma com um clique. */
export default async function Sair({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string }> }) {
  const { token } = await params;
  const feito = (await searchParams).ok === "1";
  const id = await lerTokenSair(token);

  async function confirmar() {
    "use server";
    const cid = await lerTokenSair(token);
    if (!cid) return;
    const c = await q1<{ grupo_id: string; email_status: string }>("SELECT grupo_id, email_status FROM contato WHERE id=$1", [cid]);
    if (!c) return;
    if (c.email_status !== "descadastrado") {
      await q("UPDATE contato SET email_status='descadastrado' WHERE id=$1", [cid]);
      await q("INSERT INTO atividade (grupo_id, tipo, resumo) VALUES ($1,'email','Pediu para não receber e-mails (link de descadastro)')", [c.grupo_id]);
      await parar(c.grupo_id, "pediu para não receber e-mails");
    }
    const { redirect } = await import("next/navigation");
    redirect(`/sair/${token}?ok=1`);
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div className="caixa" style={{ maxWidth: 460, textAlign: "center", padding: 30 }}>
        <img src="/logo.png" alt="Veilig" width={40} height={40} />
        {!id ? <p>Link inválido ou incompleto.</p> : feito ? (
          <><h1>Pronto</h1><p className="muted">Você não vai mais receber e-mails da Veilig sobre este assunto.</p></>
        ) : (
          <>
            <h1>Não receber mais e-mails</h1>
            <p className="muted">Confirme para deixar de receber os e-mails da Veilig sobre planos de manutenção.</p>
            <form action={confirmar}><button className="btn btn-ink" type="submit">Confirmar</button></form>
          </>
        )}
      </div>
    </main>
  );
}
