import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/session";
import { GrupoForm } from "./GrupoForm";

export const dynamic = "force-dynamic";

export default async function NovoGrupoPage() {
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin") redirect("/");

  return (
      <main className="content">
        <p
          className="crumb"
          style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 6 }}
        >
          <Link href="/grupos">Grupos</Link> / Novo grupo
        </p>
        <h1>Cadastrar grupo</h1>
        <p className="subtitle">
          Um grupo econômico cliente da Veilig. As marcas e lojas são cadastradas depois.
        </p>

        <div className="card">
          <GrupoForm />
        </div>
      </main>

  );
}
