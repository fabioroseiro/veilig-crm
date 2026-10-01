"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { withTenant, schema, db } from "@/db";
import { getSessionContext } from "@/lib/session";
import { atualizarValorAssinaturaAsaas } from "@/lib/asaas";
import { enviarEmail, molduraEmail } from "@/lib/email";

export type ResultadoReajuste = {
  ok: boolean;
  message: string;
  detalhes?: string[];
};

const brl = (n: number) => "R$ " + n.toFixed(2).replace(".", ",");

/**
 * Aplica o reajuste nas assinaturas escolhidas.
 *
 * ORDEM: Asaas primeiro. Se ela recusar, nada é gravado — o oposto deixaria o
 * sistema exibindo um preço que o cliente não está pagando.
 *
 * O percentual vem da tela, mas o TETO vem do cadastro do grupo e é aplicado
 * no servidor: é o que o contrato promete (cláusula 8.3), e não pode depender
 * do que foi enviado pelo formulário.
 */
export async function aplicarReajustes(formData: FormData): Promise<ResultadoReajuste> {
  const ctx = await getSessionContext();
  if (ctx.role !== "veilig_admin" && ctx.role !== "group_admin") {
    return { ok: false, message: "Apenas a Veilig ou o gestor do grupo." };
  }
  if (ctx.somenteLeitura) {
    return { ok: false, message: "Modo somente leitura." };
  }

  const percentual = Number(
    String(formData.get("percentual") || "").replace(/\./g, "").replace(",", ".")
  );
  const ids = formData.getAll("assinatura").map(String).filter(Boolean);
  const grupoId = String(formData.get("grupoId") || "") || ctx.groupId;

  if (!Number.isFinite(percentual) || percentual <= 0 || percentual > 100) {
    return { ok: false, message: "Informe um percentual entre 0 e 100." };
  }
  if (ids.length === 0) {
    return { ok: false, message: "Selecione ao menos uma assinatura." };
  }
  if (!grupoId) return { ok: false, message: "Grupo não identificado." };

  // Índice e teto vêm do CADASTRO, não do formulário.
  const grupo = await withTenant(ctx, async (tx) => {
    const [g] = await tx
      .select({
        indice: schema.groups.indiceReajuste,
        teto: schema.groups.tetoReajustePercent,
        nome: schema.groups.nomeFantasia,
      })
      .from(schema.groups)
      .where(eq(schema.groups.id, grupoId))
      .limit(1);
    return g ?? null;
  });
  if (!grupo) return { ok: false, message: "Grupo não encontrado." };

  const teto = grupo.teto != null ? Number(grupo.teto) : null;
  const aplicado = teto != null ? Math.min(percentual, teto) : percentual;

  const alvos = await withTenant(ctx, async (tx) => {
    const r = await tx.execute(
      sql`SELECT * FROM assinaturas_para_reajuste(${grupoId}::uuid, 1)`
    );
    return ((Array.isArray(r) ? r : (r as any).rows) as any[]).filter((a) => ids.includes(a.id));
  });

  let feitos = 0;
  const detalhes: string[] = [];

  for (const a of alvos) {
    const antes = Number(a.preco_atual);
    const depois = Math.round(antes * (1 + aplicado / 100) * 100) / 100;

    try {
      await atualizarValorAssinaturaAsaas(a.asaas_id, depois);
    } catch (e: any) {
      // Cartão sem tokenização é a recusa mais comum. Nada é gravado.
      detalhes.push(`${a.cliente}: a Asaas recusou — ${String(e?.message ?? "erro")}`);
      continue;
    }

    try {
      await db.execute(
        sql`SELECT aplicar_reajuste(${a.id}::uuid, ${aplicado}, ${depois},
                                    ${grupo.indice}, ${ctx.userId}::uuid)`
      );
      feitos++;
    } catch (e: any) {
      // A Asaas JÁ mudou. Registrar é essencial para alguém consertar.
      detalhes.push(`${a.cliente}: valor alterado na Asaas mas NÃO gravado aqui — ${String(e?.message ?? "erro")}`);
      continue;
    }

    // E-mail ao cliente. Falha aqui não desfaz o reajuste.
    let enviado = false;
    let erroEmail: string | null = null;
    if (a.email) {
      try {
        enviado = await enviarEmail({
          para: a.email,
          nomeRemetente: a.loja ?? grupo.nome ?? "Veilig",
          assunto: "Reajuste anual do seu plano de manutenção",
          html: molduraEmail(
            "Reajuste anual do seu plano",
            `<p style="margin:0 0 12px">Olá, ${String(a.cliente).split(" ")[0]}.</p>
             <p style="margin:0 0 12px">Seu plano <strong>${a.plano ?? ""}</strong> (veículo ${a.veiculo}) completa 12 meses, e o valor será reajustado conforme a cláusula 8 do seu contrato.</p>
             <table style="border-collapse:collapse;margin:0 0 16px">
               <tr><td style="padding:4px 12px 4px 0;color:#6b7d82">Valor atual</td><td style="padding:4px 0">${brl(antes)}</td></tr>
               <tr><td style="padding:4px 12px 4px 0;color:#6b7d82">Novo valor</td><td style="padding:4px 0"><strong>${brl(depois)}</strong></td></tr>
               <tr><td style="padding:4px 12px 4px 0;color:#6b7d82">Índice</td><td style="padding:4px 0">${grupo.indice ?? "—"} · ${aplicado.toFixed(2).replace(".", ",")}%</td></tr>
             </table>
             <p style="margin:0 0 12px">O novo valor vale a partir da <strong>próxima cobrança gerada</strong>. Cobranças já emitidas seguem com o valor anterior.</p>
             <p style="margin:0;font-size:13px;color:#6b7d82">Dúvidas? Procure a concessionária onde você contratou o plano.</p>`,
            `${a.loja ?? ""} — plano de manutenção`
          ),
        });
      } catch (e: any) {
        erroEmail = String(e?.message ?? "erro");
      }
      if (!enviado) detalhes.push(`${a.cliente}: reajuste aplicado, e-mail não enviado.`);
    } else {
      detalhes.push(`${a.cliente}: reajuste aplicado, sem e-mail no cadastro.`);
    }

    try {
      await db.execute(
        sql`SELECT marcar_reajuste_email(${a.id}::uuid, ${enviado}, ${erroEmail})`
      );
    } catch {}
  }

  revalidatePath("/reajustes");
  return {
    ok: feitos > 0,
    message:
      feitos === 0
        ? "Nenhum reajuste aplicado."
        : `${feitos} assinatura(s) reajustada(s) em ${aplicado.toFixed(2).replace(".", ",")}%` +
          (teto != null && percentual > teto ? ` (limitado pelo teto de ${teto.toFixed(2).replace(".", ",")}%)` : ""),
    detalhes,
  };
}
