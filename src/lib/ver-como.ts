/**
 * Modo "ver como": a Veilig enxerga a plataforma como um gestor de grupo,
 * gestor de loja ou vendedor enxerga.
 *
 * ── Por que não há escalada de privilégio ───────────────────────────────
 *
 * O cookie só é respeitado quando o usuário REAL é veilig_admin — conferido a
 * cada leitura da sessão. Um vendedor que forjasse o cookie seria ignorado. E
 * a Veilig já enxerga tudo, então "ver como" só pode REDUZIR o que ela vê.
 *
 * ── Por que somente leitura ─────────────────────────────────────────────
 *
 * Um cancelamento ou estorno feito pela Veilig "como" o vendedor ficaria
 * registrado no nome dele — origem do cancelamento, comissão e auditoria
 * passariam a mentir.
 */

export const COOKIE_VER_COMO = "veilig_ver_como";

export type PapelVerComo = "group_admin" | "store_manager" | "store_admin";

export type AlvoVerComo = {
  papel: PapelVerComo;
  groupId: string;
  storeId: string | null;
  userId: string | null;
  nome: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAPEIS: PapelVerComo[] = ["group_admin", "store_manager", "store_admin"];

export const rotuloPapel: Record<PapelVerComo, string> = {
  group_admin: "gestor de grupo",
  store_manager: "gestor de loja",
  store_admin: "vendedor",
};

export function serializarAlvo(a: AlvoVerComo): string {
  return Buffer.from(JSON.stringify(a), "utf8").toString("base64url");
}

/** Lê e VALIDA. Qualquer coisa fora do formato esperado é descartada. */
export function lerAlvo(bruto: string | undefined | null): AlvoVerComo | null {
  if (!bruto) return null;
  try {
    const a = JSON.parse(Buffer.from(bruto, "base64url").toString("utf8"));
    if (!PAPEIS.includes(a?.papel)) return null;
    if (!UUID.test(String(a?.groupId ?? ""))) return null;
    if (a.papel !== "group_admin" && !UUID.test(String(a?.storeId ?? ""))) return null;
    if (a.papel === "store_admin" && !UUID.test(String(a?.userId ?? ""))) return null;
    return {
      papel: a.papel,
      groupId: a.groupId,
      storeId: a.papel === "group_admin" ? null : a.storeId,
      userId: a.papel === "store_admin" ? a.userId : null,
      nome: String(a?.nome ?? "").slice(0, 120),
    };
  } catch {
    return null;
  }
}
