"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";

/**
 * Gera uma credencial de API.
 *
 * A chave é mostrada UMA VEZ e guardada só como hash — mesmo raciocínio da
 * senha. Vazamento do banco não entrega as chaves ativas, e quem perder a
 * chave gera outra em vez de recuperá-la.
 */
export async function criarCredencial(
  formData: FormData
): Promise<{ ok: boolean; chave?: string; message?: string }> {
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin" && ctx.role !== "group_admin") {
    return { ok: false, message: "Apenas a Veilig ou o gestor do grupo." };
  }

  const nome = String(formData.get("nome") || "").trim();
  if (nome.length < 3) return { ok: false, message: "Dê um nome à integração." };

  // Prefixo legível: identifica a chave nas listas sem revelá-la.
  const bruto = crypto.randomBytes(24).toString("base64url");
  const chave = `vlg_${bruto}`;
  const chaveHash = crypto.createHash("sha256").update(chave).digest("hex");

  // A Veilig ESCOLHE o grupo. Antes, toda chave criada por ela nascia sem
  // grupo — e chave sem grupo consulta veículos de TODOS os clientes. Foi
  // assim que a integração de um cliente ficou com alcance maior que o dele.
  //
  // "todos" continua possível, mas agora é escolha explícita.
  let grupoAlvo: string | null = null;
  if (ctx.role === "group_admin") {
    grupoAlvo = ctx.groupId ?? null;
  } else {
    const escolhido = String(formData.get("grupo") || "");
    if (escolhido !== "todos") {
      const valido = await withTenant(ctx, async (tx) => {
        const [g] = await tx
          .select({ id: schema.groups.id })
          .from(schema.groups)
          .where(eq(schema.groups.id, escolhido))
          .limit(1);
        return g?.id ?? null;
      }).catch(() => null);
      if (!valido) {
        return { ok: false, message: "Escolha o grupo desta integração." };
      }
      grupoAlvo = valido;
    }
  }

  try {
    await withTenant(ctx, async (tx) => {
      await tx.insert(schema.apiCredenciais).values({
        // Nulo só quando a Veilig escolhe "todos os grupos".
        groupId: grupoAlvo,
        nome,
        chaveHash,
        chavePrefixo: chave.slice(0, 12),
        criadaPor: ctx.userId ?? null,
      });
    });
  } catch (e: any) {
    console.error("[API] falha ao criar credencial:", e?.message);
    return { ok: false, message: "Não foi possível criar a credencial." };
  }

  revalidatePath("/integracoes");
  return { ok: true, chave };
}

/** Revoga. Não apaga: o histórico de consultas precisa continuar rastreável. */
export async function revogarCredencial(id: string): Promise<{ ok: boolean }> {
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin" && ctx.role !== "group_admin") return { ok: false };

  try {
    await withTenant(ctx, async (tx) => {
      await tx
        .update(schema.apiCredenciais)
        .set({ ativa: false, revogadaEm: new Date() })
        // Gestor só revoga chave do PRÓPRIO grupo. Sem isto, podia derrubar a
        // integração de outro cliente. O RLS garante o mesmo no banco.
        .where(
          ctx.role === "veilig_admin"
            ? eq(schema.apiCredenciais.id, id)
            : and(
                eq(schema.apiCredenciais.id, id),
                eq(schema.apiCredenciais.groupId, ctx.groupId ?? "00000000-0000-0000-0000-000000000000")
              )
        );
    });
  } catch {
    return { ok: false };
  }

  revalidatePath("/integracoes");
  return { ok: true };
}
