import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { dadosDoContrato, type DadosContrato } from "@/lib/contrato";
import type { DadosCliente } from "@/components/DocumentoContrato";
import { ROTULOS_FAIXA, formatarData } from "@/lib/carencia";
import { formatarPlacaExibicao } from "@/lib/mascaras";

const MEIOS: Record<string, string> = {
  CREDIT_CARD: "Cartão de crédito",
  BOLETO: "Boleto bancário",
  PIX: "Pix",
  DEBIT_CARD: "Cartão de débito",
  UNDEFINED: "Não informado",
};

function brl(n: number): string {
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dataBR(d: Date | string | null): string | null {
  if (!d) return null;
  const dt = typeof d === "string" ? new Date(d) : d;
  return isNaN(dt.getTime()) ? null : dt.toLocaleDateString("pt-BR");
}

/** Converte o snapshot gravado na venda de volta para o formato do documento. */
export function snapshotParaDados(snap: any): DadosContrato | null {
  if (!snap || typeof snap !== "object" || !snap.plano) return null;
  return { grupo: snap.grupo, loja: snap.loja ?? null, plano: snap.plano };
}

/**
 * Monta o contrato de uma assinatura.
 *
 * Prioriza o SNAPSHOT. Só cai no plano ao vivo se a venda for anterior ao
 * congelamento — e nesse caso a tela avisa, porque o documento pode não
 * refletir o que foi contratado.
 */
export function montarDadosClienteDaFuncao(l: any): {
  dados: DadosContrato;
  cliente: DadosCliente;
  temSnapshot: boolean;
} | null {
  // O portal NÃO pode reconstruir o plano a partir das tabelas: elas são
  // protegidas por RLS e lá não há contexto de tenant. Só o snapshot serve.
  const dados = snapshotParaDados(l.plano_snapshot);
  if (!dados) return null;

  const cpf = String(l.cliente_cpf ?? "").replace(/\D/g, "");
  const endereco = [
    l.cliente_logradouro,
    l.cliente_numero,
    l.cliente_complemento,
    l.cliente_bairro,
    l.cliente_cidade && l.cliente_uf ? `${l.cliente_cidade}/${l.cliente_uf}` : null,
    l.cliente_cep ? `CEP ${l.cliente_cep}` : null,
  ].filter(Boolean).join(", ");
  const acrescimo = Number(l.acrescimo_percent ?? 0);
  const idade = l.veiculo_idade_anos;

  const cliente: DadosCliente = {
    numero: l.contrato_numero,
    versao: l.contrato_versao ?? "v1",
    nome: l.cliente_nome ?? "—",
    cpf:
      cpf.length === 11
        ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
        : cpf,
    email: l.cliente_email ?? "—",
    telefone: l.cliente_telefone ?? "—",
    endereco: endereco || null,
    fabricante: l.veiculo_fabricante ?? "—",
    modelo: `${l.veiculo_modelo ?? ""}${l.veiculo_versao ? " " + l.veiculo_versao : ""}`.trim() || "—",
    ano: String(l.veiculo_ano ?? "—"),
    placa: l.veiculo_placa ? formatarPlacaExibicao(l.veiculo_placa) : "",
    chassi: l.veiculo_chassi ?? "",
    condicao: l.veiculo_zero_km
      ? "Zero km"
      : `Seminovo, ${idade ?? "?"} ${idade === 1 ? "ano" : "anos"}`,
    km: l.veiculo_km != null ? `${Number(l.veiculo_km).toLocaleString("pt-BR")} km` : "não informada",
    precoBase: l.preco_base != null ? brl(Number(l.preco_base)) : "—",
    acrescimo: acrescimo > 0 ? `+${acrescimo.toFixed(2).replace(".", ",")}%` : "sem acréscimo",
    precoContratado: brl(Number(l.preco_contratado)),
    dataVenda: dataBR(l.criada_em) ?? "—",
    vendedor: l.vendedor_nome ?? null,
    carenciaFaixa: l.carencia_faixa
      ? (ROTULOS_FAIXA as any)[l.carencia_faixa] ?? l.carencia_faixa
      : null,
    carenciaMeses:
      l.carencia_meses != null
        ? l.carencia_meses === 0
          ? "sem carência"
          : `${l.carencia_meses} ${l.carencia_meses === 1 ? "mês" : "meses"}`
        : null,
    carenciaAte: l.carencia_ate ? formatarData(l.carencia_ate) : "liberado desde a contratação",
    aceitoEm: dataBR(l.aceito_em),
    meioPagamento: l.aceite_billing_type
      ? MEIOS[l.aceite_billing_type] ?? l.aceite_billing_type
      : null,
  };

  return { dados, cliente, temSnapshot: true };
}

export async function montarDadosCliente(tx: any, sub: any) {
  const doSnapshot = snapshotParaDados(sub.planoSnapshot);
  const temSnapshot = doSnapshot !== null;

  const dados =
    doSnapshot ??
    (await dadosDoContrato(tx, sub.planId, sub.storeId));
  if (!dados) return null;

  // Dados do cliente e do veículo vêm sempre das tabelas: eles não mudam com o
  // plano, e são a identificação das partes.
  const custs = await tx
    .select({
      email: schema.customers.email,
      telefone: schema.customers.telefone,
      cep: schema.customers.cep,
      logradouro: schema.customers.logradouro,
      numero: schema.customers.numero,
      complemento: schema.customers.complemento,
      bairro: schema.customers.bairro,
      cidade: schema.customers.cidade,
      uf: schema.customers.uf,
      nome: schema.persons.nomeCompleto,
      cpf: schema.persons.cpf,
    })
    .from(schema.customers)
    .innerJoin(schema.persons, eq(schema.persons.id, schema.customers.personId))
    .where(eq(schema.customers.id, sub.customerId))
    .limit(1);
  const cu = custs[0];

  const veics = await tx
    .select({
      ano: schema.vehicles.ano,
      placa: schema.vehicles.placa,
      chassi: schema.vehicles.chassi,
      kmAtual: schema.vehicles.kmAtual,
      fabricante: schema.vehicleModels.fabricante,
      modelo: schema.vehicleModels.modelo,
      versao: schema.vehicleModels.versao,
    })
    .from(schema.vehicles)
    .innerJoin(schema.vehicleModels, eq(schema.vehicleModels.id, schema.vehicles.vehicleModelId))
    .where(eq(schema.vehicles.id, sub.vehicleId))
    .limit(1);
  const ve = veics[0];

  let vendedor: string | null = null;
  if (sub.vendedorId) {
    const us = await tx
      .select({ nome: schema.appUsers.nome })
      .from(schema.appUsers)
      .where(eq(schema.appUsers.id, sub.vendedorId))
      .limit(1);
    vendedor = us[0]?.nome ?? null;
  }

  const endereco = cu
    ? [cu.logradouro, cu.numero, cu.complemento, cu.bairro,
       cu.cidade && cu.uf ? `${cu.cidade}/${cu.uf}` : null,
       cu.cep ? `CEP ${cu.cep}` : null].filter(Boolean).join(", ")
    : "";

  const cpfFmt = String(cu?.cpf ?? "").replace(/\D/g, "");
  const acrescimo = Number(sub.acrescimoPercent ?? 0);

  const cliente: DadosCliente = {
    numero: sub.contratoNumero,
    versao: sub.contratoVersao ?? "v1",
    nome: cu?.nome ?? "—",
    cpf:
      cpfFmt.length === 11
        ? `${cpfFmt.slice(0, 3)}.${cpfFmt.slice(3, 6)}.${cpfFmt.slice(6, 9)}-${cpfFmt.slice(9)}`
        : cpfFmt,
    email: cu?.email ?? "—",
    telefone: cu?.telefone ?? "—",
    endereco: endereco || null,
    fabricante: ve?.fabricante ?? "—",
    modelo: `${ve?.modelo ?? ""}${ve?.versao ? " " + ve.versao : ""}`.trim() || "—",
    ano: String(ve?.ano ?? "—"),
    placa: ve?.placa ? formatarPlacaExibicao(ve.placa) : "",
    chassi: ve?.chassi ?? "",
    carenciaIsenta: sub.carenciaIsenta === true,
    carenciaIsencaoMotivo: sub.carenciaIsencaoMotivo ?? null,
    condicao: sub.veiculoZeroKm
      ? "Zero km"
      : `Seminovo, ${sub.veiculoIdadeAnos ?? "?"} ${sub.veiculoIdadeAnos === 1 ? "ano" : "anos"}`,
    // km nunca é zero num seminovo: se está vazio, é porque não foi informado.
    km: ve?.kmAtual != null ? `${Number(ve.kmAtual).toLocaleString("pt-BR")} km` : "não informada",
    precoBase: sub.precoBase != null ? brl(Number(sub.precoBase)) : "—",
    acrescimo: acrescimo > 0 ? `+${acrescimo.toFixed(2).replace(".", ",")}%` : "sem acréscimo",
    precoContratado: brl(Number(sub.precoContratado)),
    dataVenda: dataBR(sub.createdAt) ?? "—",
    vendedor,
    carenciaFaixa: sub.carenciaFaixa
      ? (ROTULOS_FAIXA as any)[sub.carenciaFaixa] ?? sub.carenciaFaixa
      : null,
    carenciaMeses:
      sub.carenciaMeses != null
        ? sub.carenciaMeses === 0
          ? "sem carência"
          : `${sub.carenciaMeses} ${sub.carenciaMeses === 1 ? "mês" : "meses"}`
        : null,
    carenciaAte: sub.carenciaAte ? formatarData(sub.carenciaAte) : "liberado desde a contratação",
    aceitoEm: dataBR(sub.aceitoEm),
    meioPagamento: sub.aceiteBillingType
      ? MEIOS[sub.aceiteBillingType] ?? sub.aceiteBillingType
      : null,
  };

  return { dados, cliente, temSnapshot, contratoHtml: sub.contratoHtml ?? null };
}
