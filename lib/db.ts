import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

// Uma conexão reaproveitada entre chamadas da mesma instância.
const g = globalThis as unknown as { __pool?: Pool };
function pool() {
  if (!g.__pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não configurada");
    g.__pool = new Pool({
      connectionString: url,
      max: 3,
      ssl: url.includes("localhost") ? false : { rejectUnauthorized: true },
    });
  }
  return g.__pool;
}

export async function q<T extends QueryResultRow = QueryResultRow>(texto: string, params: unknown[] = []) {
  const r = await pool().query<T>(texto, params);
  return r.rows;
}

export async function q1<T extends QueryResultRow = QueryResultRow>(texto: string, params: unknown[] = []) {
  const r = await q<T>(texto, params);
  return r[0] ?? null;
}

/** Executa várias operações numa transação: ou tudo entra, ou nada entra. */
export async function tx<R>(fn: (c: PoolClient) => Promise<R>): Promise<R> {
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
