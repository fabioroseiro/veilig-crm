import "server-only";
import { q, q1 } from "./db";
import { lerConfig } from "./config";
import { ETAPAS, ETAPA_PASSA_CLOSER, ETAPA_VIRA_QUENTE, TEMPERATURAS } from "./regras";

/**
 * Muda a etapa aplicando as regras do funil: Agenda+ vira Quente; Proposta passa para o closer.
 * Usada pela tela (com usuário) e pelos eventos automáticos, como o aceite da proposta (sem usuário).
 * Com soAvanca, só muda se a etapa nova for maior que a atual.
 */
export async function aplicarEtapa(grupoId: string, etapa: number, usuarioId: string | null, soAvanca = false) {
  if (!ETAPAS[etapa]) return false;
  const g = await q1<{ etapa: number; temperatura: string; responsavel_id: string | null }>(
    "SELECT etapa, temperatura, responsavel_id FROM grupo WHERE id=$1", [grupoId]);
  if (!g || g.etapa === etapa || (soAvanca && etapa < g.etapa)) return false;
  const cfg = await lerConfig();
  const closer = await q1<{ id: string; nome: string }>("SELECT id, nome FROM usuario WHERE lower(email)=lower($1)", [cfg.closer_email]);
  const registrar = (tipo: string, resumo: string, uid: string | null) =>
    q("INSERT INTO atividade (grupo_id, tipo, resumo, usuario_id) VALUES ($1,$2,$3,$4)", [grupoId, tipo, resumo, uid]);

  await q("UPDATE grupo SET etapa=$2, situacao='ativo', pausado_ate=NULL, atualizado_em=now() WHERE id=$1", [grupoId, etapa]);
  await registrar("etapa", `Etapa: ${ETAPAS[g.etapa].nome} → ${ETAPAS[etapa].nome}`, usuarioId);

  if (etapa >= ETAPA_VIRA_QUENTE && g.temperatura !== "quente" && g.temperatura !== "oscilante") {
    await q("UPDATE grupo SET temperatura='quente' WHERE id=$1", [grupoId]);
    await registrar("temperatura", `Temperatura: ${TEMPERATURAS[g.temperatura as keyof typeof TEMPERATURAS].nome} → Quente (etapa ${ETAPAS[etapa].nome})`, null);
  }
  if (etapa >= ETAPA_PASSA_CLOSER && closer && g.responsavel_id !== closer.id) {
    await q("UPDATE grupo SET responsavel_id=$2 WHERE id=$1", [grupoId, closer.id]);
    await q("UPDATE tarefa SET usuario_id=$2 WHERE grupo_id=$1 AND feita_em IS NULL", [grupoId, closer.id]);
    await registrar("sistema", `Lead passou para ${closer.nome} (closer), a partir de ${ETAPAS[ETAPA_PASSA_CLOSER].nome}`, null);
  }
  return true;
}

/** Id do closer (quem recebe as tarefas da proposta). */
export async function closerId() {
  const cfg = await lerConfig();
  const c = await q1<{ id: string }>("SELECT id FROM usuario WHERE lower(email)=lower($1)", [cfg.closer_email]);
  return c?.id ?? null;
}
