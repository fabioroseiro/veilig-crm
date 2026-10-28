/**
 * Liga a proposta do CRM à apresentação em slides.
 * Lê só o que já está em `dados` — nada de coluna nova, nada de banco aqui.
 */
import { PACOTES_PROPOSTA, onboardingDe, segmentoDe, setupsDe, type DadosProposta } from "../proposta-tipos";
import { dataExtenso } from "../proposta-conteudo";
import type { EntradaProposta } from "./modelo";
import type { MetaProposta } from "./render";

/** Logo e roda do ciclo do plano, servidos de /public. */
export const ASSETS_PROPOSTA = { logo: "/logo.png", mandala: "/proposta-ciclo.png" };

export function entradaDaProposta(d: DadosProposta): EntradaProposta {
  const setups = setupsDe(d);
  return {
    grupo: d.empresa,
    segmento: segmentoDe(d),
    lojas: Number(d.lojas) || 1,
    vendasLoja: Number(d.vendas_loja) || 0,
    ticket: Number(d.ticket) || 0,
    adesaoManual: Number(d.adesao) > 0 ? Number(d.adesao) / 100 : null,
    recorrenteLoja: Number(d.recorrente_loja) || 0,
    fee: Number(d.fee) || 0,
    setupConsultivo: setups.consultivo,
    setupOnline: setups.online,
    onboarding: onboardingDe(d),
  };
}

export function metaDaProposta(
  d: DadosProposta,
  numero: string,
  emitidaISO: string,
  validadeISO: string,
  responsavel: string,
  previa = false,
): MetaProposta {
  const pac = PACOTES_PROPOSTA[d.pacote] ?? PACOTES_PROPOSTA.essencial;
  return {
    numero,
    emitidaEm: dataExtenso(emitidaISO),
    validaAte: dataExtenso(validadeISO),
    responsavel,
    pacote: pac.nome,
    modulos: pac.modulos,
    vencimentoDia: Number(d.vencimento_dia) || 10,
    observacoes: d.observacoes ?? "",
    previa,
  };
}

/** O que falta para a projeção não sair zerada. Trava o envio antes de o cliente ver. */
export function pendenciasDaProposta(d: DadosProposta): string[] {
  const f: string[] = [];
  if (!(Number(d.lojas) >= 1)) f.push("nº de lojas");
  if (!(Number(d.vendas_loja) >= 1)) f.push("entregas por loja");
  if (!(Number(d.ticket) >= 1)) f.push("ticket de revisão");
  if (!(Number(d.recorrente_loja) >= 0)) f.push("recorrente por loja");
  return f;
}
