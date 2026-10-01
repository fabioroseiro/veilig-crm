import { sql } from "drizzle-orm";
import { db } from "@/db";
import { headers } from "next/headers";

/**
 * PROTEÇÃO CONTRA FORÇA BRUTA.
 *
 * Vive no banco, e não em memória, porque a Vercel roda várias instâncias em
 * paralelo sem memória compartilhada — um contador local seria zerado a cada
 * instância nova e daria uma falsa sensação de proteção.
 *
 * O acesso é por funções SECURITY DEFINER: o login acontece antes de existir
 * contexto de tenant, então não há policy de RLS que sirva.
 */

/** A partir daqui, bloqueia. */
const LIMITE_FALHAS = 5;
/** Janela considerada. */
const JANELA_MINUTOS = 15;

export type ResultadoLimite = {
  bloqueado: boolean;
  falhas: number;
  /** Mensagem pronta para a tela, quando bloqueado. */
  mensagem?: string;
  /** Minutos até liberar — para a mensagem dizer quanto falta esperar. */
  minutosRestantes?: number;
  /** Quantas tentativas ainda restam antes de bloquear. */
  restantes?: number;
};

export async function verificarLimiteLogin(identificador: string): Promise<ResultadoLimite> {
  if (!identificador?.trim()) return { bloqueado: false, falhas: 0 };

  try {
    const r = await db.execute(
      sql`SELECT falhas_recentes_login(${identificador}, ${JANELA_MINUTOS}) AS n`
    );
    const linhas = (Array.isArray(r) ? r : (r as any).rows) as { n: number }[];
    const falhas = Number(linhas[0]?.n ?? 0);

    if (falhas >= LIMITE_FALHAS) {
      // Quanto falta para liberar. Sem isso a mensagem diz "aguarde 15
      // minutos" mesmo faltando um — e a pessoa espera à toa.
      let minutos = JANELA_MINUTOS;
      try {
        const t = await db.execute(
          sql`SELECT ceil(extract(epoch FROM (
                 min(created_at) + (${JANELA_MINUTOS} || ' minutes')::interval - now()
               )) / 60)::int AS m
              FROM (
                SELECT created_at FROM login_attempt
                WHERE identificador = ${identificador.toLowerCase().trim()}
                  AND sucesso = false
                  AND created_at > now() - (${JANELA_MINUTOS} || ' minutes')::interval
                ORDER BY created_at DESC
                LIMIT ${LIMITE_FALHAS}
              ) recentes`
        );
        const l = (Array.isArray(t) ? t : (t as any).rows)[0];
        if (l?.m != null) minutos = Math.max(1, Number(l.m));
      } catch {
        // mantém o valor cheio se a conta falhar
      }

      return {
        bloqueado: true,
        falhas,
        minutosRestantes: minutos,
        mensagem:
          `Acesso bloqueado temporariamente por ${LIMITE_FALHAS} tentativas incorretas. ` +
          `Tente novamente em ${minutos} ${minutos === 1 ? "minuto" : "minutos"}, ` +
          `ou peça a um administrador para redefinir sua senha.`,
      };
    }
    return { bloqueado: false, falhas, restantes: LIMITE_FALHAS - falhas };
  } catch (e: any) {
    // Se a checagem falhar, NÃO bloqueamos o login: derrubar todo mundo por
    // causa de um erro na tabela de auditoria seria pior que o risco que ela
    // previne. O erro vai para o log.
    console.error("[LOGIN] falha ao verificar limite:", e?.message);
    return { bloqueado: false, falhas: 0 };
  }
}

export async function registrarTentativa(
  identificador: string,
  origem: "app" | "portal",
  sucesso: boolean
): Promise<void> {
  try {
    const ip = await ipDaRequisicao();
    await db.execute(
      sql`SELECT registrar_tentativa_login(${identificador}, ${origem}, ${sucesso}, ${ip})`
    );
  } catch (e: any) {
    console.error("[LOGIN] falha ao registrar tentativa:", e?.message);
  }
}

/**
 * IP de origem. Atrás da Vercel, o IP real vem em cabeçalho — o socket é
 * sempre o do proxy. Serve para auditoria; NÃO usamos o IP como chave do
 * limite, porque uma concessionária inteira sai pelo mesmo IP e um vendedor
 * errando a senha bloquearia os colegas.
 */
async function ipDaRequisicao(): Promise<string | null> {
  try {
    const h = await headers();
    return (
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      null
    );
  } catch {
    return null;
  }
}
