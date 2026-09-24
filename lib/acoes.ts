"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { q, q1, tx } from "./db";
import { exigirUsuario } from "./auth";
import { lerConfig } from "./config";
import { COOKIE } from "./sessao";
import { ETAPAS, ETAPA_PASSA_CLOSER, ETAPA_VIRA_QUENTE, TEMPERATURAS, hojeISO, somaDias } from "./regras";
import { analisarEmail, normalizarCelular } from "./contatos";
import type { GrupoImp } from "./importacao";

const s = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };
const n = (f: FormData, k: string) => { const v = s(f, k); return v != null && !isNaN(Number(v)) ? Number(v) : null; };

async function registrar(grupoId: string, tipo: string, resumo: string, usuarioId: string | null, detalhe?: string | null) {
  await q("INSERT INTO atividade (grupo_id, tipo, resumo, detalhe, usuario_id) VALUES ($1,$2,$3,$4,$5)", [grupoId, tipo, resumo, detalhe ?? null, usuarioId]);
}
function atualizarTelas(grupoId?: string) {
  revalidatePath("/hoje"); revalidatePath("/funil");
  if (grupoId) revalidatePath(`/grupos/${grupoId}`);
}

// ---------------- Sessão ----------------

export async function sair() {
  (await cookies()).delete(COOKIE);
  redirect("/login");
}

export async function trocarSenha(_: unknown, f: FormData) {
  const u = await exigirUsuario();
  const atual = s(f, "atual") || "", nova = s(f, "nova") || "";
  if (nova.length < 10) return { erro: "A nova senha precisa ter pelo menos 10 caracteres." };
  const reg = await q1<{ senha_hash: string }>("SELECT senha_hash FROM usuario WHERE id=$1", [u.id]);
  if (!reg || !(await bcrypt.compare(atual, reg.senha_hash))) return { erro: "A senha atual não confere." };
  await q("UPDATE usuario SET senha_hash=$2 WHERE id=$1", [u.id, await bcrypt.hash(nova, 12)]);
  return { ok: "Senha alterada." };
}

// ---------------- Funil ----------------

/** Muda a etapa aplicando as regras: Agenda+ vira Quente; Proposta passa para o closer. */
export async function mudarEtapa(grupoId: string, etapa: number) {
  const u = await exigirUsuario();
  if (!ETAPAS[etapa]) return;
  const g = await q1<{ etapa: number; temperatura: string; responsavel_id: string | null; situacao: string }>(
    "SELECT etapa, temperatura, responsavel_id, situacao FROM grupo WHERE id=$1", [grupoId]);
  if (!g || g.etapa === etapa) return;
  const cfg = await lerConfig();
  const closer = await q1<{ id: string; nome: string }>("SELECT id, nome FROM usuario WHERE lower(email)=lower($1)", [cfg.closer_email]);

  await q("UPDATE grupo SET etapa=$2, situacao='ativo', pausado_ate=NULL, atualizado_em=now() WHERE id=$1", [grupoId, etapa]);
  await registrar(grupoId, "etapa", `Etapa: ${ETAPAS[g.etapa].nome} → ${ETAPAS[etapa].nome}`, u.id);

  if (etapa >= ETAPA_VIRA_QUENTE && g.temperatura !== "quente" && g.temperatura !== "oscilante") {
    await q("UPDATE grupo SET temperatura='quente' WHERE id=$1", [grupoId]);
    await registrar(grupoId, "temperatura", `Temperatura: ${TEMPERATURAS[g.temperatura as keyof typeof TEMPERATURAS].nome} → Quente (etapa ${ETAPAS[etapa].nome})`, null);
  }
  if (etapa >= ETAPA_PASSA_CLOSER && closer && g.responsavel_id !== closer.id) {
    await q("UPDATE grupo SET responsavel_id=$2 WHERE id=$1", [grupoId, closer.id]);
    await q("UPDATE tarefa SET usuario_id=$2 WHERE grupo_id=$1 AND feita_em IS NULL", [grupoId, closer.id]);
    await registrar(grupoId, "sistema", `Lead passou para ${closer.nome} (closer), a partir de ${ETAPAS[ETAPA_PASSA_CLOSER].nome}`, null);
  }
  atualizarTelas(grupoId);
}

export async function mudarTemperatura(grupoId: string, temp: string) {
  const u = await exigirUsuario();
  if (!(temp in TEMPERATURAS)) return;
  const g = await q1<{ temperatura: string }>("SELECT temperatura FROM grupo WHERE id=$1", [grupoId]);
  if (!g || g.temperatura === temp) return;
  await q("UPDATE grupo SET temperatura=$2, atualizado_em=now() WHERE id=$1", [grupoId, temp]);
  await registrar(grupoId, "temperatura", `Temperatura: ${TEMPERATURAS[g.temperatura as keyof typeof TEMPERATURAS].nome} → ${TEMPERATURAS[temp as keyof typeof TEMPERATURAS].nome}`, u.id);
  atualizarTelas(grupoId);
}

export async function pausar(grupoId: string, f: FormData) {
  const u = await exigirUsuario();
  const ate = s(f, "ate");
  if (!ate) return;
  const motivo = s(f, "motivo");
  await q("UPDATE grupo SET situacao='pausado', pausado_ate=$2, temperatura='oscilante', atualizado_em=now() WHERE id=$1", [grupoId, ate]);
  await q("INSERT INTO tarefa (grupo_id, tipo, titulo, vence_em, usuario_id) SELECT id, 'outro', $2, $3, COALESCE(responsavel_id, $4) FROM grupo WHERE id=$1",
    [grupoId, `Retomar contato${motivo ? `: ${motivo}` : ""}`, ate, u.id]);
  await registrar(grupoId, "sistema", `Pausado até ${ate.split("-").reverse().join("/")}`, u.id, motivo);
  atualizarTelas(grupoId);
}

export async function perder(grupoId: string, f: FormData) {
  const u = await exigirUsuario();
  const motivo = s(f, "motivo");
  if (!motivo) return;
  await q("UPDATE grupo SET situacao='perdido', perdido_motivo=$2, pausado_ate=NULL, atualizado_em=now() WHERE id=$1", [grupoId, motivo]);
  await q("UPDATE tarefa SET feita_em=now(), resultado='Cancelada: lead perdido' WHERE grupo_id=$1 AND feita_em IS NULL", [grupoId]);
  await registrar(grupoId, "sistema", "Marcado como perdido", u.id, motivo);
  atualizarTelas(grupoId);
}

export async function reativar(grupoId: string) {
  const u = await exigirUsuario();
  await q("UPDATE grupo SET situacao='ativo', pausado_ate=NULL, perdido_motivo=NULL, atualizado_em=now() WHERE id=$1", [grupoId]);
  await registrar(grupoId, "sistema", "Lead reativado", u.id);
  atualizarTelas(grupoId);
}

export async function alternarEstrategico(grupoId: string) {
  const u = await exigirUsuario();
  const g = await q1<{ estrategico: boolean }>("UPDATE grupo SET estrategico = NOT estrategico, atualizado_em=now() WHERE id=$1 RETURNING estrategico", [grupoId]);
  if (g) await registrar(grupoId, "sistema", g.estrategico ? "Marcado como Cliente Estratégico" : "Deixou de ser Cliente Estratégico", u.id);
  atualizarTelas(grupoId);
}

export async function mudarResponsavel(grupoId: string, usuarioId: string) {
  const u = await exigirUsuario();
  const novo = await q1<{ nome: string }>("SELECT nome FROM usuario WHERE id=$1", [usuarioId]);
  if (!novo) return;
  await q("UPDATE grupo SET responsavel_id=$2, atualizado_em=now() WHERE id=$1", [grupoId, usuarioId]);
  await q("UPDATE tarefa SET usuario_id=$2 WHERE grupo_id=$1 AND feita_em IS NULL", [grupoId, usuarioId]);
  await registrar(grupoId, "sistema", `Responsável: ${novo.nome}`, u.id);
  atualizarTelas(grupoId);
}

// ---------------- Cadastro ----------------

const CAMPOS_DIAG = ["decisor", "retencao_2a", "planos_hoje", "ticket_revisao", "entregas_loja", "proximo_passo", "data_proximo_passo"];

export async function salvarGrupo(grupoId: string, _: unknown, f: FormData) {
  await exigirUsuario();
  const nome = s(f, "nome");
  if (!nome) return { erro: "Informe o nome do grupo." };
  const diag: Record<string, string | null> = {};
  for (const c of CAMPOS_DIAG) diag[c] = s(f, `diag_${c}`);
  await q(`UPDATE grupo SET nome=$2, tipo=COALESCE($3,'Concessionária'), origem=$4, origem_interna=$5, segmento=$6, marcas=$7,
           num_lojas=GREATEST(COALESCE($8,1),1), entregas_mes=$9, pacote=COALESCE($10,'essencial'), observacoes=$11, diagnostico=$12, atualizado_em=now()
           WHERE id=$1`,
    [grupoId, nome, s(f, "tipo"), s(f, "origem"), s(f, "origem_interna"), s(f, "segmento"), s(f, "marcas"),
     n(f, "num_lojas"), n(f, "entregas_mes"), s(f, "pacote"), s(f, "observacoes"), JSON.stringify(diag)]);
  atualizarTelas(grupoId);
  return { ok: "Dados salvos." };
}

export async function novoGrupo(_: unknown, f: FormData) {
  const u = await exigirUsuario();
  const cfg = await lerConfig();
  const sdr = await q1<{ id: string }>("SELECT id FROM usuario WHERE lower(email)=lower($1)", [cfg.sdr_email]);
  const nome = s(f, "nome");
  if (!nome) return { erro: "Informe o nome do grupo ou da concessionária." };
  const email = analisarEmail(s(f, "email"));
  const zap = s(f, "whatsapp") ? normalizarCelular(s(f, "whatsapp")!) : null;
  if (s(f, "whatsapp") && !zap) return { erro: "WhatsApp inválido: informe DDD e número." };
  const id = await tx(async (c) => {
    const g = await c.query<{ id: string }>(
      `INSERT INTO grupo (nome, origem, segmento, num_lojas, temperatura, responsavel_id, ultimo_sinal)
       VALUES ($1,$2,$3,GREATEST(COALESCE($4,1),1),COALESCE($5,'frio'),$6, CASE WHEN $5='quente' THEN now() END) RETURNING id`,
      [nome, s(f, "origem"), s(f, "segmento"), n(f, "num_lojas"), s(f, "temperatura"), sdr?.id ?? u.id]);
    const gid = g.rows[0].id;
    await c.query(`INSERT INTO contato (grupo_id, nome, cargo, email, email_status, email_sugestao, whatsapp, telefone, principal)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
      [gid, s(f, "contato"), s(f, "cargo"), email.email, email.status, email.sugestao ?? null, zap, s(f, "whatsapp")]);
    await c.query("INSERT INTO atividade (grupo_id, tipo, resumo, usuario_id) VALUES ($1,'sistema','Lead cadastrado manualmente',$2)", [gid, u.id]);
    return gid;
  });
  atualizarTelas();
  redirect(`/grupos/${id}`);
}

export async function salvarContato(grupoId: string, _: unknown, f: FormData) {
  await exigirUsuario();
  const id = s(f, "id");
  const email = analisarEmail(s(f, "email"));
  const telefone = s(f, "whatsapp");
  const zap = telefone ? normalizarCelular(telefone) : null;
  if (telefone && !zap) return { erro: "Celular inválido: informe DDD e número (ex.: 11 99999-0000)." };
  const params = [s(f, "nome"), s(f, "cargo"), email.email, email.status, email.sugestao ?? null, zap, telefone];
  if (id) await q(`UPDATE contato SET nome=$2, cargo=$3, email=$4, email_status=$5, email_sugestao=$6, whatsapp=$7, telefone=$8 WHERE id=$1 AND grupo_id=$9`, [id, ...params, grupoId]);
  else await q(`INSERT INTO contato (grupo_id, nome, cargo, email, email_status, email_sugestao, whatsapp, telefone, principal)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOT EXISTS (SELECT 1 FROM contato WHERE grupo_id=$1))`, [grupoId, ...params]);
  atualizarTelas(grupoId);
  return { ok: email.status === "corrigir" ? "Contato salvo, mas o e-mail parece ter erro de digitação." : "Contato salvo." };
}

export async function definirPrincipal(grupoId: string, contatoId: string) {
  await exigirUsuario();
  await q("UPDATE contato SET principal = (id = $2) WHERE grupo_id=$1", [grupoId, contatoId]);
  atualizarTelas(grupoId);
}

export async function removerContato(grupoId: string, contatoId: string) {
  await exigirUsuario();
  await q("DELETE FROM contato WHERE id=$2 AND grupo_id=$1", [grupoId, contatoId]);
  atualizarTelas(grupoId);
}

/** Cadastra ou corrige o e-mail do contato principal (usado nas tarefas da tela Hoje). */
export async function salvarEmailPrincipal(grupoId: string, _: unknown, f: FormData) {
  const u = await exigirUsuario();
  const e = analisarEmail(s(f, "email"));
  if (e.status === "ausente") return { erro: "Informe o e-mail." };
  if (e.status === "corrigir") return { erro: e.sugestao ? `Confira o endereço. Você quis dizer ${e.sugestao}?` : "Esse e-mail parece inválido. Confira." };
  const c = await q1<{ id: string }>(
    "UPDATE contato SET email=$2, email_status='ok', email_sugestao=NULL WHERE grupo_id=$1 AND principal RETURNING id", [grupoId, e.email]);
  if (!c) return { erro: "Este lead não tem contato principal. Cadastre o contato na ficha." };
  await registrar(grupoId, "sistema", `E-mail do contato principal cadastrado: ${e.email}`, u.id);
  atualizarTelas(grupoId);
  return { ok: "E-mail salvo." };
}

export async function aplicarSugestaoEmail(grupoId: string, contatoId: string) {
  await exigirUsuario();
  await q("UPDATE contato SET email=email_sugestao, email_status='ok', email_sugestao=NULL WHERE id=$2 AND grupo_id=$1 AND email_sugestao IS NOT NULL", [grupoId, contatoId]);
  atualizarTelas(grupoId);
}

// ---------------- Toques e tarefas ----------------

/** Registra um toque (WhatsApp, ligação, reunião, nota). "Respondeu" reaquece o lead. */
export async function registrarToque(grupoId: string, _: unknown, f: FormData) {
  const u = await exigirUsuario();
  const tipo = s(f, "tipo") || "nota";
  const resumo = s(f, "resumo");
  if (!resumo) return { erro: "Descreva o que aconteceu." };
  await registrar(grupoId, tipo, resumo, u.id);
  if (f.get("respondeu")) await leadRespondeu(grupoId, u.id);
  atualizarTelas(grupoId);
  return { ok: "Registrado." };
}

async function leadRespondeu(grupoId: string, usuarioId: string) {
  const g = await q1<{ temperatura: string; situacao: string }>("UPDATE grupo SET ultimo_sinal=now(), atualizado_em=now() WHERE id=$1 RETURNING temperatura, situacao", [grupoId]);
  if (g && g.situacao === "ativo" && g.temperatura !== "quente") {
    await q("UPDATE grupo SET temperatura='quente' WHERE id=$1", [grupoId]);
    await registrar(grupoId, "temperatura", `Temperatura: ${TEMPERATURAS[g.temperatura as keyof typeof TEMPERATURAS].nome} → Quente (o lead respondeu)`, usuarioId);
  }
}

export async function criarTarefa(grupoId: string, _: unknown, f: FormData) {
  const u = await exigirUsuario();
  const titulo = s(f, "titulo");
  const vence = s(f, "vence_em") || hojeISO();
  if (!titulo) return { erro: "Descreva a próxima ação." };
  await q(`INSERT INTO tarefa (grupo_id, tipo, titulo, texto, vence_em, usuario_id)
           SELECT $1, COALESCE($2,'outro'), $3, $4, $5, COALESCE($6::uuid, responsavel_id, $7) FROM grupo WHERE id=$1`,
    [grupoId, s(f, "tipo"), titulo, s(f, "texto"), vence, s(f, "usuario_id"), u.id]);
  atualizarTelas(grupoId);
  return { ok: "Ação agendada." };
}

export async function concluirTarefa(tarefaId: string, _: unknown, f: FormData) {
  const u = await exigirUsuario();
  const t = await q1<{ grupo_id: string; titulo: string; tipo: string }>(
    "UPDATE tarefa SET feita_em=now(), resultado=$2 WHERE id=$1 AND feita_em IS NULL RETURNING grupo_id, titulo, tipo", [tarefaId, s(f, "resultado")]);
  if (!t) return { erro: "Esta ação já foi concluída." };
  const tipoAtividade = t.tipo === "outro" ? "nota" : t.tipo;
  await registrar(t.grupo_id, tipoAtividade, `${t.titulo}`, u.id, s(f, "resultado"));
  if (f.get("respondeu")) await leadRespondeu(t.grupo_id, u.id);
  const proxima = s(f, "proxima");
  if (proxima) {
    const dias = n(f, "proxima_dias") ?? 3;
    await q(`INSERT INTO tarefa (grupo_id, tipo, titulo, vence_em, usuario_id) SELECT id, $2, $3, $4, COALESCE(responsavel_id,$5) FROM grupo WHERE id=$1`,
      [t.grupo_id, s(f, "proxima_tipo") || "outro", proxima, somaDias(hojeISO(), dias), u.id]);
  }
  atualizarTelas(t.grupo_id);
  return { ok: "Concluída." };
}

export async function adiarTarefa(tarefaId: string, dias: number) {
  await exigirUsuario();
  const t = await q1<{ grupo_id: string }>("UPDATE tarefa SET vence_em = GREATEST(vence_em, $3::date) + $2::int WHERE id=$1 AND feita_em IS NULL RETURNING grupo_id",
    [tarefaId, dias, hojeISO()]);
  atualizarTelas(t?.grupo_id);
}

export async function excluirTarefa(tarefaId: string) {
  await exigirUsuario();
  const t = await q1<{ grupo_id: string }>("DELETE FROM tarefa WHERE id=$1 AND feita_em IS NULL RETURNING grupo_id", [tarefaId]);
  atualizarTelas(t?.grupo_id);
}

// ---------------- Importação ----------------

export type ResultadoImportacao = { criados: number; duplicados: string[]; ignorados: number; erro?: string };

export async function importar(arquivo: string, modelo: string, grupos: GrupoImp[]): Promise<ResultadoImportacao> {
  const u = await exigirUsuario();
  const cfg = await lerConfig();
  const closer = await q1<{ id: string }>("SELECT id FROM usuario WHERE lower(email)=lower($1)", [cfg.closer_email]);
  const sdr = await q1<{ id: string }>("SELECT id FROM usuario WHERE lower(email)=lower($1)", [cfg.sdr_email]);
  const incluir = grupos.filter((g) => g.incluir && !g.excluido);
  if (incluir.length > 2000) return { criados: 0, duplicados: [], ignorados: 0, erro: "Arquivo grande demais: importe em partes de até 2.000 grupos." };

  // Duplicados: algum contato com o mesmo WhatsApp ou e-mail já existe no CRM.
  const zaps = incluir.flatMap((g) => g.contatos.map((c) => c.whatsapp)).filter(Boolean) as string[];
  const emails = incluir.flatMap((g) => g.contatos.map((c) => c.email?.toLowerCase())).filter(Boolean) as string[];
  const existentes = await q<{ whatsapp: string | null; email: string | null }>(
    "SELECT whatsapp, lower(email) AS email FROM contato WHERE whatsapp = ANY($1) OR lower(email) = ANY($2)", [zaps, emails]);
  const jaTem = new Set(existentes.flatMap((e) => [e.whatsapp, e.email]).filter(Boolean));
  const duplicados: string[] = [];
  const novos = incluir.filter((g) => {
    const dup = g.contatos.some((c) => (c.whatsapp && jaTem.has(c.whatsapp)) || (c.email && jaTem.has(c.email.toLowerCase())));
    if (dup) duplicados.push(g.nome);
    return !dup;
  });

  const hoje = hojeISO();
  const criados = await tx(async (c) => {
    const imp = await c.query<{ id: string }>("INSERT INTO importacao (arquivo, modelo, grupos, usuario_id) VALUES ($1,$2,$3,$4) RETURNING id",
      [arquivo, modelo, novos.length, u.id]);
    const impId = imp.rows[0].id;
    for (const g of novos) {
      const resp = g.etapa >= ETAPA_PASSA_CLOSER && closer ? closer.id : sdr?.id ?? u.id;
      const r = await c.query<{ id: string }>(
        `INSERT INTO grupo (nome, tipo, origem, origem_interna, segmento, marcas, num_lojas, entregas_mes, etapa, situacao, pausado_ate,
           perdido_motivo, temperatura, pacote, ultimo_sinal, observacoes, responsavel_id, importacao_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
        [g.nome.slice(0, 200), g.tipo, g.origem, g.origem_interna, g.segmento, g.marcas, Math.max(1, g.num_lojas), g.entregas_mes,
         Math.min(Math.max(g.etapa, 1), 7), g.situacao, g.pausado_ate, g.perdido_motivo, g.temperatura, g.pacote,
         g.ultimo_sinal ? `${g.ultimo_sinal}T12:00:00-03:00` : null, g.observacoes, resp, impId]);
      const gid = r.rows[0].id;
      for (const ct of g.contatos)
        await c.query(`INSERT INTO contato (grupo_id, nome, cargo, email, email_status, email_sugestao, whatsapp, telefone, principal)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [gid, ct.nome, ct.cargo, ct.email, ct.email_status, ct.email_sugestao, ct.whatsapp, ct.telefone, ct.principal]);
      for (const l of g.lojas)
        await c.query("INSERT INTO loja (grupo_id, razao_social, nome_fantasia, cidade, uf, regiao, cep) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [gid, l.razao_social, l.nome_fantasia, l.cidade, l.uf, l.regiao, l.cep]);
      for (const t of g.tarefas)
        await c.query("INSERT INTO tarefa (grupo_id, tipo, titulo, vence_em, usuario_id) VALUES ($1,'outro',$2,$3,$4)", [gid, t.titulo, t.vence_em || hoje, resp]);
      for (const a of g.atividades)
        await c.query("INSERT INTO atividade (grupo_id, tipo, resumo, usuario_id, em) VALUES ($1,$2,$3,$4,$5)", [gid, a.tipo, a.resumo, u.id, `${a.em}T12:00:00-03:00`]);
      await c.query("INSERT INTO atividade (grupo_id, tipo, resumo, usuario_id) VALUES ($1,'sistema',$2,$3)", [gid, `Importado do arquivo ${arquivo}`, u.id]);
    }
    return novos.length;
  });
  atualizarTelas();
  return { criados, duplicados, ignorados: grupos.length - incluir.length };
}

// ---------------- Configurações ----------------

export async function salvarConfig(_: unknown, f: FormData) {
  await exigirUsuario();
  const precos = { essencial: n(f, "essencial"), performance: n(f, "performance"), completo: n(f, "completo") };
  if (precos.essencial == null) return { erro: "Informe o preço do Essencial." };
  const piloto = n(f, "lojas_piloto") ?? 4;
  const dominios = (s(f, "dominios_excluidos") || "").split(/[\s,;]+/).map((d) => d.toLowerCase()).filter(Boolean);
  await tx(async (c) => {
    for (const [chave, valor] of [["precos", precos], ["lojas_piloto", piloto], ["closer_email", s(f, "closer_email") || ""], ["sdr_email", s(f, "sdr_email") || ""], ["dominios_excluidos", dominios]] as const)
      await c.query("INSERT INTO config (chave, valor) VALUES ($1,$2) ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor", [chave, JSON.stringify(valor)]);
  });
  revalidatePath("/", "layout");
  return { ok: "Configurações salvas." };
}
