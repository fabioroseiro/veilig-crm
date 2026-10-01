import { getClienteAuthId } from "@/lib/cliente-session";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { TrocarSenhaClienteForm } from "./TrocarSenhaClienteForm";
import { IconeVeilig } from "@/components/IconeVeilig";

export const dynamic = "force-dynamic";

export default async function TrocarSenhaClientePage() {
  const authId = await getClienteAuthId();
  if (!authId) redirect("/portal/login");

  // A tela agora tem dois usos: primeiro acesso (obrigatório) e troca
  // voluntária. O texto e a saída mudam conforme o caso — sem isso, quem
  // clicasse em "Trocar senha" veria "Este é seu primeiro acesso" e ficaria
  // sem caminho de volta.
  const r = await db.execute(
    sql`SELECT precisa_trocar_senha FROM customer_auth WHERE id = ${authId}::uuid LIMIT 1`
  );
  const obrigatorio =
    ((Array.isArray(r) ? r : (r as any).rows)[0]?.precisa_trocar_senha ?? false) === true;

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <IconeVeilig tamanho={44} className="login-logo" />
          <span className="login-wordmark">VEILIG</span>
        </div>
        <h1 className="login-title">
          {obrigatorio ? "Defina sua senha" : "Trocar senha"}
        </h1>
        <p className="login-sub">
          {obrigatorio
            ? "Este é seu primeiro acesso. Escolha uma senha nova para continuar."
            : "Escolha uma nova senha para o seu acesso."}
        </p>
        <TrocarSenhaClienteForm />
        {!obrigatorio && (
          <p style={{ textAlign: "center", marginTop: 14, fontSize: 14 }}>
            <a href="/portal">Voltar sem trocar</a>
          </p>
        )}
      </div>
    </div>
  );
}
