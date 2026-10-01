"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { novoUsuarioSchema } from "@/lib/usuario-validation";
import { gerarSenhaProvisoria } from "@/lib/senha";
import { enviarBoasVindasUsuario } from "@/lib/boas-vindas";
import { soDigitos } from "@/lib/loja-validation";
import { withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { eq } from "drizzle-orm";

export type FormState = {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
  /** Senha provisória, exibida UMA VEZ. Aleatória — não há como consultá-la depois. */
  senhaProvisoria?: string;
  nomeUsuario?: string;
  emailUsuario?: string;
};

export async function criarUsuario(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await getSessionContext();

  // Só Veilig, admin de grupo ou gestor de loja criam usuários.
  if (ctx.role !== "veilig_admin" && ctx.role !== "group_admin" && ctx.role !== "store_manager") {
    return { ok: false, message: "Sem permissão para criar usuários." };
  }

  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = novoUsuarioSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors, values: raw, message: "Verifique os campos." };
  }

  const d = parsed.data;

  // Regras de quem pode criar qual papel:
  // - veilig_admin: qualquer papel, qualquer grupo/loja.
  // - group_admin: gestor de loja OU vendedor, dentro do próprio grupo.
  // - store_manager: só vendedor (store_admin), na PRÓPRIA loja.
  let groupIdAlvo: string | null = null;
  let storeIdAlvo: string | null = null;
  let roleAlvo = d.role;

  if (ctx.role === "store_manager") {
    // gestor de loja só cria vendedor, e sempre na loja dele
    if (d.role !== "store_admin") {
      return { ok: false, values: raw, message: "Você só pode criar vendedores." };
    }
    groupIdAlvo = ctx.groupId ?? null;
    storeIdAlvo = ctx.storeId ?? null;
    if (!storeIdAlvo) {
      return { ok: false, values: raw, message: "Sua loja não foi identificada." };
    }
  } else if (ctx.role === "group_admin") {
    // admin de grupo cria gestor de loja ou vendedor, no próprio grupo
    if (d.role !== "store_admin" && d.role !== "store_manager") {
      return { ok: false, values: raw, message: "Você pode criar gestores de loja ou vendedores." };
    }
    groupIdAlvo = ctx.groupId ?? null;
    storeIdAlvo = d.storeId && d.storeId !== "" ? d.storeId : null;
    if (!storeIdAlvo) {
      return { ok: false, errors: { storeId: "Selecione a loja." }, values: raw, message: "Selecione a loja." };
    }
  } else {
    // veilig_admin
    if (d.role === "veilig_admin") {
      groupIdAlvo = null;
      storeIdAlvo = null;
    } else if (d.role === "group_admin") {
      groupIdAlvo = d.groupId && d.groupId !== "" ? d.groupId : null;
      if (!groupIdAlvo) {
        return { ok: false, errors: { groupId: "Selecione o grupo." }, values: raw, message: "Selecione o grupo." };
      }
    } else {
      // store_manager ou store_admin
      groupIdAlvo = d.groupId && d.groupId !== "" ? d.groupId : null;
      storeIdAlvo = d.storeId && d.storeId !== "" ? d.storeId : null;
      if (!groupIdAlvo || !storeIdAlvo) {
        return { ok: false, errors: { storeId: "Selecione grupo e loja." }, values: raw, message: "Selecione grupo e loja." };
      }
    }
  }

  const senhaProvisoria = gerarSenhaProvisoria();
  const senhaHash = await bcrypt.hashSync(senhaProvisoria, 10);

  let novoUserId: string | null = null;
  try {
    novoUserId = await withTenant(ctx, async (tx) => {
      const criado = await tx.insert(schema.appUsers).values({
        groupId: groupIdAlvo,
        storeId: storeIdAlvo,
        nome: d.nome,
        email: d.email.toLowerCase(),
        // null e não "": o índice único recusaria dois usuários com string
        // vazia, mas aceita vários NULL.
        cpf: soDigitos(d.cpf) || null,
        senhaHash,
        role: roleAlvo,
        precisaTrocarSenha: true, // troca obrigatória no 1º acesso
        status: "ativo",
      })
      // Precisamos do id para gerar o link de acesso do e-mail.
      .returning({ id: schema.appUsers.id });
      return criado[0]?.id ?? null;
    });
  } catch (e: any) {
    if (String(e?.message || "").includes("uq_user_email")) {
      return { ok: false, errors: { email: "Já existe um usuário com este e-mail." }, values: raw, message: "E-mail já cadastrado." };
    }
    return { ok: false, values: raw, message: "Não foi possível criar o usuário." };
  }

  // Boas-vindas por e-mail: rede de segurança para quando quem cadastrou
  // esquece de repassar o acesso. Fora do try — o usuário já está criado, e um
  // e-mail não pode desfazer isso.
  const rotulos: Record<string, string> = {
    veilig_admin: "administrador Veilig",
    group_admin: "gestor do grupo",
    store_manager: "gestor da loja",
    store_admin: "vendedor",
  };
  const rotuloPapel = (r: string) => rotulos[r] ?? r;

  // Nome da loja no e-mail: num grupo com várias, a pessoa precisa saber em
  // qual foi cadastrada.
  let nomeLojaAlvo: string | null = null;
  if (storeIdAlvo) {
    try {
      nomeLojaAlvo = await withTenant(ctx, async (tx) => {
        const [st] = await tx
          .select({ nome: schema.stores.nomeFantasia })
          .from(schema.stores)
          .where(eq(schema.stores.id, storeIdAlvo!))
          .limit(1);
        return st?.nome ?? null;
      });
    } catch {}
  }

  let emailEnviado = false;
  if (novoUserId) {
    emailEnviado = await enviarBoasVindasUsuario({
      userId: novoUserId,
      papel: rotuloPapel(roleAlvo),
      loja: nomeLojaAlvo,
    });
  }

  revalidatePath("/usuarios");
  // Sem redirect: a senha aleatória precisa aparecer nesta tela. Query string
  // deixaria a credencial no histórico do navegador e nos logs do servidor.
  return {
    ok: true,
    senhaProvisoria,
    nomeUsuario: d.nome,
    emailUsuario: d.email,
    message: emailEnviado
      ? "Usuário criado. Enviamos um e-mail com o link de acesso."
      : "Usuário criado com sucesso.",
  };
}
