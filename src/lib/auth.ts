// Configuração central do Auth.js v5 (NextAuth).
// Login por e-mail e senha, validado contra a tabela app_user.
// O role e o group_id do usuário entram no token JWT — é isso que alimenta
// o contexto de RLS depois (getSessionContext lê daqui).
//
// Google fica preparado para entrar depois: basta adicionar o provider Google
// ao array `providers` e as credenciais no .env.

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { sql as sqlRaw } from "drizzle-orm";
import { verificarLimiteLogin, registrarTentativa } from "@/lib/rate-limit";
import { z } from "zod";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

// Conexão direta (sem RLS) só para o login: precisamos ler o usuário pelo e-mail
// ANTES de saber quem ele é. É uma exceção controlada e restrita a este arquivo.
// A role usada aqui deve ter acesso de leitura à app_user.
const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        senha: { label: "Senha", type: "password" },
      },
      authorize: async (credentials) => {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, senha } = parsed.data;

        // Força bruta: bloqueia antes de sequer consultar o usuário.
        const limite = await verificarLimiteLogin(email);
        if (limite.bloqueado) return null;

        // Busca o usuário pelo e-mail. A policy app_user_login_read permite
        // esta leitura para autenticação (sem contexto de tenant ainda).
        const rows = await db
          .select()
          .from(schema.appUsers)
          .where(eq(schema.appUsers.email, email.toLowerCase()))
          .limit(1);

        const user = rows[0];
        // Registramos a falha mesmo quando o usuário não existe: sem isso,
        // dá para varrer e-mails livremente e descobrir quais são válidos.
        if (!user || !user.senhaHash || user.status !== "ativo") {
          await registrarTentativa(email, "app", false);
          return null;
        }

        const ok = await bcrypt.compare(senha, user.senhaHash);
        if (!ok) {
          await registrarTentativa(email, "app", false);
          return null;
        }

        // O usuário pode estar ativo, mas o GRUPO ou a LOJA dele não.
        // Sem esta checagem, inativar um grupo seria puramente cosmético:
        // todos os usuários dele continuariam entrando e vendendo.
        //
        // Passa por função SECURITY DEFINER porque aqui ainda não existe
        // contexto de tenant — uma leitura direta de `group` devolveria vazio
        // e recusaria todo mundo.
        try {
          const r = await db.execute(
            sqlRaw`SELECT tenant_ativo(${user.groupId ?? null}::uuid, ${user.storeId ?? null}::uuid) AS ativo`
          );
          const linhas = (Array.isArray(r) ? r : (r as any).rows) as { ativo: boolean }[];
          if (linhas[0]?.ativo === false) {
            await registrarTentativa(email, "app", false);
            return null;
          }
        } catch (e: any) {
          // Falha na checagem não derruba o login: bloquear todo mundo por um
          // erro de consulta seria pior que o risco. Fica no log.
          console.error("[LOGIN] falha ao verificar tenant:", e?.message);
        }

        await registrarTentativa(email, "app", true);

        // O que retornamos aqui vira a base do token.
        return {
          id: user.id,
          name: user.nome,
          email: user.email,
          role: user.role,
          groupId: user.groupId ?? null,
          storeId: user.storeId ?? null,
          precisaTrocarSenha: user.precisaTrocarSenha ?? false,
        };
      },
    }),
  ],
  callbacks: {
    // Passa role e groupId para dentro do token.
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.groupId = (user as any).groupId ?? null;
        token.storeId = (user as any).storeId ?? null;
        token.uid = (user as any).id;
        token.precisaTrocarSenha = (user as any).precisaTrocarSenha ?? false;
      }
      return token;
    },
    // Expõe role e groupId na sessão (lida no servidor).
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.uid;
        (session.user as any).role = token.role;
        (session.user as any).groupId = token.groupId ?? null;
        (session.user as any).storeId = token.storeId ?? null;
        (session.user as any).precisaTrocarSenha = token.precisaTrocarSenha ?? false;
      }
      return session;
    },
  },
});
