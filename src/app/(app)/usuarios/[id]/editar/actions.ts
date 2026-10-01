"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { withTenant, schema, db } from "@/db";
import { getSessionContext } from "@/lib/session";
import { gerarSenhaProvisoria } from "@/lib/senha";

export type EditState = {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
};

// Ordem hierárquica dos papéis (maior = mais poder).
const NIVEL: Record<string, number> = {
  veilig_admin: 4,
  group_admin: 3,
  store_manager: 2,
  store_admin: 1,
};

// Decide se o ator (logado) pode gerenciar o alvo (usuário-destino).
function podeGerenciar(
  ator: { role: string; groupId?: string | null; storeId?: string | null; userId?: string | null },
  alvo: { id: string; role: string; groupId: string | null; storeId: string | null }
): boolean {
  // ninguém gerencia a si mesmo (evita se auto-inativar/rebaixar)
  if (ator.userId && ator.userId === alvo.id) return false;

  const nivelAtor = NIVEL[ator.role] ?? 0;
  const nivelAlvo = NIVEL[alvo.role] ?? 0;
  // só gerencia quem está ESTRITAMENTE abaixo
  if (nivelAtor <= nivelAlvo) return false;

  if (ator.role === "veilig_admin") return true;
  if (ator.role === "group_admin") return alvo.groupId === ator.groupId;
  if (ator.role === "store_manager") return alvo.storeId === ator.storeId;
  return false;
}

async function carregarAlvo(ctx: any, userId: string) {
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: schema.appUsers.id,
        nome: schema.appUsers.nome,
        role: schema.appUsers.role,
        groupId: schema.appUsers.groupId,
        storeId: schema.appUsers.storeId,
        cpf: schema.appUsers.cpf,
        status: schema.appUsers.status,
        // Necessário para limpar o bloqueio de login, cuja chave é o e-mail.
        email: schema.appUsers.email,
      })
      .from(schema.appUsers)
      .where(eq(schema.appUsers.id, userId))
      .limit(1);
    return rows[0] ?? null;
  });
}

export async function editarUsuario(
  userId: string,
  _prev: EditState,
  formData: FormData
): Promise<EditState> {
  const ctx = await getSessionContext();
  const alvo = await carregarAlvo(ctx, userId);
  if (!alvo) return { ok: false, message: "Usuário não encontrado." };
  if (!podeGerenciar(ctx as any, alvo)) {
    return { ok: false, message: "Você não tem permissão para editar este usuário." };
  }

  const nome = String(formData.get("nome") || "").trim();
  const novoRole = String(formData.get("role") || "").trim();
  const novaStore = String(formData.get("storeId") || "").trim();

  const errors: Record<string, string> = {};
  if (nome.length < 3) errors.nome = "Informe o nome completo.";

  // o novo papel também precisa estar abaixo do ator (não pode promover acima de si)
  const nivelAtor = NIVEL[ctx.role] ?? 0;
  if (novoRole && (NIVEL[novoRole] ?? 0) >= nivelAtor) {
    errors.role = "Você não pode atribuir este papel.";
  }
  // vendedor e gestor de loja precisam de loja
  const precisaLoja = novoRole === "store_admin" || novoRole === "store_manager";
  if (precisaLoja && !novaStore) errors.storeId = "Selecione a loja.";

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, values: { nome, role: novoRole, storeId: novaStore }, message: "Verifique os campos." };
  }

  try {
    await withTenant(ctx, async (tx) => {
      const set: any = { nome };
      if (novoRole) set.role = novoRole;
      // loja: obrigatória p/ loja-nível; nula para group_admin/veilig_admin
      if (precisaLoja) set.storeId = novaStore;
      else if (novoRole === "group_admin" || novoRole === "veilig_admin") set.storeId = null;
      await tx.update(schema.appUsers).set(set).where(eq(schema.appUsers.id, userId));
    });
  } catch (e: any) {
    return { ok: false, values: { nome, role: novoRole, storeId: novaStore }, message: "Não foi possível salvar." };
  }

  revalidatePath("/usuarios");
  redirect("/usuarios?editado=1");
}

export async function alternarStatusUsuario(userId: string, novoStatus: "ativo" | "inativo") {
  const ctx = await getSessionContext();
  const alvo = await carregarAlvo(ctx, userId);
  if (!alvo || !podeGerenciar(ctx as any, alvo)) return;
  await withTenant(ctx, async (tx) => {
    await tx.update(schema.appUsers).set({ status: novoStatus }).where(eq(schema.appUsers.id, userId));
  });
  revalidatePath("/usuarios");
}

// Gera uma senha provisória ALEATÓRIA e força a troca no próximo acesso.
// Devolve a senha porque ela não pode ser consultada depois.
export async function resetarSenhaUsuario(userId: string) {
  const ctx = await getSessionContext();
  const alvo = await carregarAlvo(ctx, userId);
  if (!alvo || !podeGerenciar(ctx as any, alvo)) return;
  // NÃO exige mais CPF: ele virou opcional, e a senha é aleatória — não tem
  // relação nenhuma com o documento. Antes esta linha fazia o reset desistir
  // em silêncio para quem não tivesse CPF, e a tela não dizia nada.
  const senhaProvisoria = gerarSenhaProvisoria();
  const hash = bcrypt.hashSync(senhaProvisoria, 10);
  await withTenant(ctx, async (tx) => {
    await tx
      .update(schema.appUsers)
      .set({ senhaHash: hash, precisaTrocarSenha: true })
      .where(eq(schema.appUsers.id, userId));
  });

  // Destrava o bloqueio por tentativas erradas.
  //
  // Resetar a senha É a resposta ao problema que o bloqueio criou — a nossa
  // própria mensagem manda pedir isso ao administrador. Manter o bloqueio
  // depois do reset não protege nada (a senha antiga não vale mais) e deixa o
  // usuário preso justamente quando alguém foi ajudá-lo.
  if (alvo.email) {
    try {
      await db.execute(sql`SELECT limpar_bloqueio_login(${alvo.email})`);
    } catch (e: any) {
      console.error("[RESET SENHA] falha ao limpar bloqueio:", e?.message);
    }
  }
  revalidatePath("/usuarios");
  // A senha nova é aleatória e não pode ser consultada depois — precisa ser
  // devolvida para a tela mostrar ao administrador agora.
  return { ok: true, senhaProvisoria, nome: alvo.nome };
}
