import "server-only";
import { q } from "./db";
import type { Precos } from "./regras";

export type Config = { precos: Precos; lojas_piloto: number; closer_email: string; sdr_email: string; dominios_excluidos: string[] };

export async function lerConfig(): Promise<Config> {
  const linhas = await q<{ chave: string; valor: unknown }>("SELECT chave, valor FROM config");
  const m = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
  return {
    precos: (m.precos as Precos) ?? { essencial: 300, performance: null, completo: null },
    lojas_piloto: Number(m.lojas_piloto ?? 4),
    closer_email: String(m.closer_email ?? ""),
    sdr_email: String(m.sdr_email ?? ""),
    dominios_excluidos: (m.dominios_excluidos as string[]) ?? [],
  };
}
