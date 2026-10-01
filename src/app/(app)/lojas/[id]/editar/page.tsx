import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LojaForm } from "../../nova/LojaForm";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { eq } from "drizzle-orm";
import { editarLoja, type FormState } from "./actions";

export const dynamic = "force-dynamic";

async function getLoja(id: string) {
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) => {
    const rows = await tx.select().from(schema.stores).where(eq(schema.stores.id, id)).limit(1);
    const loja = rows[0];
    if (!loja) return null;

    const fabRows = await tx
      .selectDistinct({ fabricante: schema.vehicleModels.fabricante })
      .from(schema.vehicleModels);
    const fabricantes = fabRows.map((f) => f.fabricante).filter(Boolean).sort();

    return { loja, fabricantes };
  });
}

export default async function EditarLojaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin" && ctx.role !== "group_admin") redirect("/");

  const dados = await getLoja(id);
  if (!dados) notFound();

  const { loja, fabricantes } = dados;

  // valores iniciais para pré-preencher o formulário
  const valoresIniciais: Record<string, string> = {
    fabricante: loja.fabricante ?? "",
    razaoSocial: loja.razaoSocial ?? "",
    nomeFantasia: loja.nomeFantasia ?? "",
    cnpj: loja.cnpj ?? "",
    inscricaoEstadual: loja.inscricaoEstadual ?? "",
    cep: loja.cep ?? "",
    logradouro: loja.logradouro ?? "",
    numero: loja.numero ?? "",
    complemento: loja.complemento ?? "",
    bairro: loja.bairro ?? "",
    cidade: loja.cidade ?? "",
    uf: loja.uf ?? "",
    responsavelNome: loja.responsavelNome ?? "",
    responsavelCpf: loja.responsavelCpf ?? "",
    email: loja.email ?? "",
    telefone: loja.telefone ?? "",
    walletId: loja.walletId ?? "",
  };

  // vincula o storeId à action de edição
  const acao = editarLoja.bind(null, id) as (
    prev: FormState,
    fd: FormData
  ) => Promise<FormState>;

  return (
      <main className="content">
        <p className="crumb" style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 6 }}>
          <Link href="/lojas">Lojas</Link> / <Link href={`/lojas/${id}`}>{loja.nomeFantasia}</Link> / Editar
        </p>
        <h1>Editar loja</h1>
        <p className="subtitle">Atualize os dados da loja. O grupo não é alterado aqui.</p>

        <div className="card">
          <LojaForm
            fabricantes={fabricantes}
            grupos={null}
            valoresIniciais={valoresIniciais}
            acaoCustomizada={acao}
            textoBotao="Salvar alterações"
          />
        </div>
      </main>

  );
}
