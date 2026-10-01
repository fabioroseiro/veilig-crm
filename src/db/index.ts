// Conexão de banco + helper de contexto de tenant.
//
// Ponto-chave de segurança: o runtime da aplicação conecta com a role
// app_runtime (SEM BYPASSRLS). Antes de cada operação, setamos as variáveis
// de sessão que o RLS usa para filtrar por tenant. Assim, o isolamento é
// garantido pelo banco — não depende de o código lembrar de filtrar.

import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

// Conexão de RUNTIME (role app_runtime, sem bypass de RLS).
const client = postgres(process.env.DATABASE_URL_RUNTIME!, {
  prepare: false, // recomendado com pooling serverless (Neon)
});

export const db = drizzle(client, { schema });

export type TenantContext = {
  role: "veilig_admin" | "group_admin" | "store_manager" | "store_admin";
  groupId: string | null; // nulo para veilig_admin
  storeId?: string | null; // preenchido para store_admin (vendedor)
  userId?: string | null; // id do usuário logado (p/ registrar vendedor na venda)
  /**
   * Modo "ver como": a Veilig enxergando a plataforma como outro papel.
   * Toda transação abre como READ ONLY — a gravação falha no banco, mesmo que
   * algum botão escape da tela.
   */
  somenteLeitura?: boolean;
  verComo?: { papel: string; nome: string } | null;
};

// Tipo da transação, derivado do próprio db — evita cast inseguro.
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Executa uma função dentro de uma transação com o contexto de tenant setado.
// Toda query lá dentro respeita o RLS automaticamente.
export async function withTenant<T>(
  ctx: TenantContext,
  fn: (tx: Tx) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    // Tem de ser o PRIMEIRO comando da transação: o Postgres só aceita mudar
    // o modo antes de qualquer consulta.
    if (ctx.somenteLeitura) {
      await tx.execute(sql`SET TRANSACTION READ ONLY`);
    }
    await tx.execute(
      sql`SELECT set_config('app.current_role', ${ctx.role}, true)`
    );
    await tx.execute(
      sql`SELECT set_config('app.current_group_id', ${ctx.groupId ?? ""}, true)`
    );
    return fn(tx);
  });
}

export { schema };
