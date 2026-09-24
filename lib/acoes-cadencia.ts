"use server";
import { revalidatePath } from "next/cache";
import { exigirUsuario } from "./auth";
import { q, q1 } from "./db";
import * as K from "./cadencia";
import { montarEmail, preencherTexto, camposFaltando, type Remetente } from "./mensagem";
import { transportador, envioReal } from "./correio";
import { PLANO_FRIO } from "./plano";

const telas = () => { revalidatePath("/cadencias"); revalidatePath("/modelos"); revalidatePath("/hoje"); revalidatePath("/funil"); };

export async function iniciarSelecionados(tipo: "frio" | "morno", ids: string[]) {
  const u = await exigirUsuario();
  const n = await K.iniciar(ids.slice(0, 100), u.id, tipo);
  telas();
  return { ok: `${n} cadência(s) iniciada(s).` };
}

export async function iniciarUm(grupoId: string, tipo: "frio" | "morno") {
  const u = await exigirUsuario();
  const n = await K.iniciar([grupoId], u.id, tipo);
  revalidatePath(`/grupos/${grupoId}`); telas();
  if (!n) throw new Error("Lead fora do perfil da cadência");
}

export async function pararUm(grupoId: string) {
  const u = await exigirUsuario();
  await K.parar(grupoId, `interrompida por ${u.nome}`);
  revalidatePath(`/grupos/${grupoId}`); telas();
}

export async function salvarEnvio(_: unknown, f: FormData) {
  await exigirUsuario();
  const limite = Math.min(Math.max(Number(f.get("limite_diario") || 15), 1), 80);
  await q("INSERT INTO config (chave, valor) VALUES ('limite_diario',$1) ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor", [JSON.stringify(limite)]);
  telas();
  return { ok: "Limite salvo." };
}

export async function ligarEnvio(ligar: boolean) {
  const u = await exigirUsuario();
  await q("INSERT INTO config (chave, valor) VALUES ('envio_ativo',$1) ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor", [JSON.stringify(ligar)]);
  console.log(`[cadencia] envio automático ${ligar ? "LIGADO" : "DESLIGADO"} por ${u.email}`);
  telas();
}

export async function rodarAgora() {
  await exigirUsuario();
  const r = await K.rodar();
  telas();
  return { ok: `Rodada concluída: ${JSON.stringify(r)}` };
}

export async function reenviar(envioId: string) {
  await exigirUsuario();
  await q("UPDATE envio SET status='fila', erro=NULL WHERE id=$1 AND status='erro'", [envioId]);
  telas();
}

export async function salvarModelo(chave: string, _: unknown, f: FormData) {
  await exigirUsuario();
  const assunto = String(f.get("assunto") || "").trim();
  const corpo = String(f.get("corpo") || "").trim();
  if (!assunto || !corpo) return { erro: "Assunto e texto são obrigatórios." };
  const aprovado = f.get("aprovado") === "on";
  const desconhecidos = camposFaltando(preencherTexto(assunto + corpo, { nome: "X", grupo: "X", origem: "X", segmento: "motos" }));
  if (desconhecidos.length) return { erro: `Campo desconhecido no texto: ${desconhecidos.join(", ")}. Use [Nome], [Grupo], [Origem] ou [Link dos planos].` };
  await q("UPDATE modelo_email SET assunto=$2, corpo=$3, aprovado=$4, atualizado_em=now() WHERE chave=$1", [chave, assunto, corpo, aprovado]);
  telas();
  return { ok: aprovado ? "Salvo e aprovado." : "Salvo. Enquanto não for aprovado, este e-mail não sai." };
}

/** Manda o modelo, preenchido com os dados de um lead real, para a caixa de quem está logado. */
export async function enviarTeste(chave: string) {
  const u = await exigirUsuario();
  const m = await q1<{ assunto: string; corpo: string }>("SELECT assunto, corpo FROM modelo_email WHERE chave=$1", [chave]);
  if (!m) return { erro: "Modelo não encontrado." };
  const ex = await q1<{ nome: string; origem: string | null; segmento: string | null; contato: string | null }>(
    `SELECT g.nome, g.origem, g.segmento, c.nome AS contato FROM grupo g LEFT JOIN contato c ON c.grupo_id=g.id AND c.principal
      WHERE g.temperatura='frio' ORDER BY g.num_lojas DESC LIMIT 1`);
  const dados = { nome: ex?.contato ?? "Fulano", grupo: ex?.nome ?? "Grupo Exemplo", origem: ex?.origem, segmento: ex?.segmento };
  const rem = await q1<{ valor: Remetente }>("SELECT valor FROM config WHERE chave='remetente'");
  const remetente: Remetente = rem?.valor ?? { email: "natalia@vendas.veilig.com.br", nome: "Natália Artale" };
  const { texto, html } = await montarEmail(preencherTexto(m.corpo, dados), remetente, null);
  // Toque que sai como resposta na mesma conversa: o assunto é o do e-mail anterior, com "Re:".
  const passo = PLANO_FRIO.A.find((x) => x.chave === chave && x.responde);
  let assunto = preencherTexto(m.assunto, dados);
  if (passo?.responde) {
    const base = await q1<{ assunto: string }>("SELECT assunto FROM modelo_email WHERE chave=$1", [passo.responde]);
    assunto = `Re: ${preencherTexto(base?.assunto ?? "", dados)}`;
  }
  try {
    await transportador(remetente.email).sendMail({
      from: { name: remetente.nome, address: remetente.email }, to: u.email,
      subject: `[TESTE] ${assunto}`, text: texto, html,
    });
  } catch (e) {
    return { erro: `Falha no envio: ${e instanceof Error ? e.message : e}` };
  }
  return { ok: envioReal() ? `Teste enviado para ${u.email}, com os dados de ${dados.grupo}.` : "Modo simulação: a senha do Zoho não está configurada, nada foi enviado." };
}
