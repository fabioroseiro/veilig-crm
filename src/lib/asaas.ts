// Cliente HTTP para a API do Asaas, adaptado do spike para o app.
// A chave e a URL vêm de variáveis de ambiente (nunca hardcoded).
//
// Segurança:
//  - ASAAS_API_KEY fica só no servidor (não é NEXT_PUBLIC).
//  - Guard-rail: se ASAAS_ENV != "producao", recusa chaves de produção,
//    evitando cobrar de verdade por engano durante os testes em sandbox.

const BASE_URL =
  process.env.ASAAS_BASE_URL || "https://api-sandbox.asaas.com/v3";
const ASAAS_ENV = process.env.ASAAS_ENV || "sandbox";

// A chave Asaas tem o formato $aact_... . O Vercel faz "expansão" de valores
// que começam com $, então é comum a chave chegar com escape sobrando no início
// (ex.: "\$aact_", "/$aact_") ou sem o $. Esta função normaliza:
//  - remove barras/contrabarras/aspas iniciais que sejam lixo de escape
//  - garante o $ inicial se a chave começa direto com "aact_"
function limparChaveAsaas(bruta: string): string {
  let k = (bruta || "").trim();
  // remove aspas envolventes acidentais
  k = k.replace(/^["']|["']$/g, "");
  // remove barras/contrabarras iniciais que sobraram do escape (\ ou /)
  k = k.replace(/^[\\/]+/, "");
  // se sobrou "aact_..." sem o $, recoloca o $
  if (k.startsWith("aact_")) k = "$" + k;
  return k;
}

const API_KEY = limparChaveAsaas(process.env.ASAAS_API_KEY || "");

export function asaasConfigurada(): boolean {
  return Boolean(API_KEY) && !API_KEY.includes("COLE_SUA_CHAVE");
}

// Chamada genérica à API do Asaas. Lança erro legível em caso de falha.
export async function asaas<T = any>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  endpoint: string,
  body?: unknown
): Promise<T> {
  if (!asaasConfigurada()) {
    throw new Error("ASAAS_API_KEY não configurada no servidor.");
  }
  // ── Guard-rails de ambiente ────────────────────────────────────────────
  // Os dois sentidos importam, e por razões diferentes.

  // 1) Chave de produção em ambiente sandbox: cobraria de verdade durante um
  //    teste. É o erro caro.
  if (ASAAS_ENV !== "producao" && API_KEY.startsWith("$aact_prod")) {
    throw new Error(
      "Chave de PRODUÇÃO detectada em ambiente sandbox. Abortado por segurança."
    );
  }

  // 2) Chave de sandbox em ambiente de produção: a venda "funciona", o cliente
  //    recebe um link de pagamento que não cobra nada, e a loja acha que
  //    vendeu. Silencioso e pior de descobrir que o primeiro caso.
  if (ASAAS_ENV === "producao" && !API_KEY.startsWith("$aact_prod")) {
    throw new Error(
      "Chave de SANDBOX detectada em ambiente de produção. Abortado: a cobrança não seria real."
    );
  }

  // 3) URL e chave apontando para lugares diferentes: dá erro de autenticação
  //    difícil de diagnosticar, porque a chave parece certa.
  const urlEhSandbox = BASE_URL.includes("sandbox");
  if (ASAAS_ENV === "producao" && urlEhSandbox) {
    throw new Error(
      "ASAAS_ENV=producao mas ASAAS_BASE_URL aponta para sandbox. Corrija a URL."
    );
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "veilig-app",
      access_token: API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
    // a API do Asaas não deve ser cacheada
    cache: "no-store",
  });

  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    // A Asaas devolve a explicação em `errors[].description`, em português e
    // já legível ("O CPF/CNPJ informado é inválido."). Usamos ela como mensagem
    // principal, para o vendedor entender o que corrigir; o endpoint e o código
    // HTTP vão para o log, não para a tela.
    const descricoes = Array.isArray(data?.errors)
      ? data.errors.map((e: any) => e?.description).filter(Boolean)
      : [];
    const msg = descricoes.join(" ") || text || `HTTP ${res.status}`;
    const err = new Error(msg);
    (err as any).endpoint = `${method} ${endpoint}`;
    (err as any).httpStatus = res.status;
    console.error(`[ASAAS] ${method} ${endpoint} → ${res.status}: ${msg}`);
    (err as any).status = res.status;
    (err as any).data = data;
    throw err;
  }
  return data as T;
}

// Cria ou reaproveita um customer no Asaas por CPF. Retorna o id do Asaas.
export async function upsertCustomerAsaas(params: {
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  // Endereço opcional: quando informado, a Asaas já preenche o checkout e o
  // cliente não digita de novo. O boleto exige endereço, então mandar aqui
  // evita atrito no momento em que ele já decidiu pagar.
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
}): Promise<string> {
  const cpf = params.cpf.replace(/\D/g, "");
  const telefoneDigitos = params.telefone.replace(/\D/g, "");
  const busca = await asaas<{ data: { id: string }[] }>(
    "GET",
    `/customers?cpfCnpj=${cpf}`
  );
  if (busca?.data?.length > 0) {
    return busca.data[0].id;
  }
  const criado = await asaas<{ id: string }>("POST", "/customers", {
    name: params.nome,
    cpfCnpj: cpf,
    email: params.email,
    // A Asaas tem DOIS campos de telefone: `phone` (fixo) e `mobilePhone`
    // (celular). Mandávamos só o celular — e a tela de pagamento dela pede o
    // `phone` como obrigatório, obrigando o cliente a digitar o número de novo
    // no meio do checkout. Atrito bobo, e ponto de desistência.
    //
    // Só temos um número cadastrado, então vai nos dois.
    phone: telefoneDigitos,
    mobilePhone: telefoneDigitos,
    // Só envia o que existe: campo vazio na Asaas é pior que campo ausente,
    // porque ela grava a string vazia e o checkout considera preenchido.
    ...(params.cep?.replace(/\D/g, "") ? { postalCode: params.cep.replace(/\D/g, "") } : {}),
    ...(params.logradouro ? { address: params.logradouro } : {}),
    ...(params.numero ? { addressNumber: params.numero } : {}),
    ...(params.complemento ? { complement: params.complemento } : {}),
    ...(params.bairro ? { province: params.bairro } : {}),
  });
  return criado.id;
}

// Cria uma assinatura recorrente no Asaas com split para a loja.
// Não embute cartão: o cliente paga pelo link (invoiceUrl), escolhendo
// cartão, boleto ou pix. Retorna o id da assinatura e o link da 1ª cobrança.
export async function createSubscriptionAsaas(params: {
  asaasCustomerId: string;
  valor: string; // "89.00"
  descricao: string;
  lojaWalletId: string;
  feePercent: number; // fee da Veilig; a loja recebe (100 - fee)%
  primeiroVencimento: string; // "YYYY-MM-DD"
}): Promise<{ subscriptionId: string; linkPagamento: string | null; status: string }> {
  const lojaPercent = Number((100 - params.feePercent).toFixed(4));

  const sub = await asaas<{ id: string; status: string }>("POST", "/subscriptions", {
    customer: params.asaasCustomerId,
    billingType: "UNDEFINED", // deixa o cliente escolher cartão/boleto/pix no link
    value: Number(params.valor),
    nextDueDate: params.primeiroVencimento,
    cycle: "MONTHLY",
    description: params.descricao,
    split: [
      {
        walletId: params.lojaWalletId,
        percentualValue: lojaPercent,
      },
    ],
  });

  // Busca a 1ª cobrança para pegar o link de pagamento (invoiceUrl).
  //
  // CUIDADO: a Asaas cria a assinatura e gera a primeira cobrança em momentos
  // diferentes. Consultando imediatamente, a lista volta VAZIA e a venda ficava
  // sem link — o cliente não recebia como pagar. Por isso tentamos algumas
  // vezes com um respiro entre elas.
  //
  // Se mesmo assim não vier, não é o fim: o ressync repõe o link depois
  // (ver preencherLinksFaltantes em src/lib/ressync.ts).
  let linkPagamento: string | null = null;
  for (let tentativa = 0; tentativa < 4 && !linkPagamento; tentativa++) {
    if (tentativa > 0) await new Promise((r) => setTimeout(r, 700));
    try {
      const cobrancas = await asaas<{ data: { invoiceUrl?: string }[] }>(
        "GET",
        `/subscriptions/${sub.id}/payments`
      );
      linkPagamento = cobrancas?.data?.[0]?.invoiceUrl ?? null;
    } catch {
      // segue tentando; a assinatura já foi criada de qualquer forma
    }
  }

  return { subscriptionId: sub.id, linkPagamento, status: sub.status };
}

/**
 * Busca o link da cobrança em aberto (ou a mais recente) de uma assinatura.
 * Usado para repor links que não vieram na criação e para o botão "Ver fatura"
 * apontar sempre para a cobrança ATUAL, e não para a primeira de todas.
 */
export async function linkFaturaAtualAsaas(
  asaasSubscriptionId: string
): Promise<string | null> {
  try {
    const r = await asaas<{
      data: { status: string; dueDate: string; invoiceUrl?: string }[];
    }>("GET", `/subscriptions/${asaasSubscriptionId}/payments`);
    const cobrancas = r?.data ?? [];
    if (cobrancas.length === 0) return null;

    // prioridade: vencida > aguardando pagamento > a mais recente
    const emAberto = cobrancas.filter((c) =>
      ["OVERDUE", "PENDING", "AWAITING_RISK_ANALYSIS"].includes(c.status)
    );
    const escolhida =
      emAberto.find((c) => c.status === "OVERDUE") ??
      emAberto.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ??
      cobrancas.sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];

    return escolhida?.invoiceUrl ?? null;
  } catch {
    return null;
  }
}

// Consulta o estado de pagamento de uma assinatura no Asaas, para o portal.
// Retorna o meio de pagamento e a cobrança mais relevante (aberta ou a última),
// com o link certo. Resiliente: se falhar, retorna null e o portal degrada bem.
export type EstadoAssinatura = {
  billingType: string; // CREDIT_CARD | BOLETO | PIX | UNDEFINED
  ehCartao: boolean;
  temFaturaAberta: boolean; // há fatura vencida/vencendo para pagar agora
  temPaga: boolean; // há alguma cobrança paga (confirmada ou recebida)
  proximoVencimento: string | null; // data da próxima cobrança futura
  linkFatura: string | null; // invoiceUrl da cobrança relevante
  statusCobranca: string | null;
};

export async function estadoAssinaturaAsaas(
  asaasSubscriptionId: string
): Promise<EstadoAssinatura | null> {
  try {
    // busca as cobranças da assinatura (mais recentes primeiro na prática)
    const resp = await asaas<{
      data: {
        status: string;
        billingType: string;
        invoiceUrl?: string;
        dueDate?: string;
      }[];
    }>("GET", `/subscriptions/${asaasSubscriptionId}/payments`);

    const cobrancas = resp?.data ?? [];
    if (cobrancas.length === 0) {
      return { billingType: "UNDEFINED", ehCartao: false, temFaturaAberta: false, temPaga: false, proximoVencimento: null, linkFatura: null, statusCobranca: null };
    }

    // "Fatura para pagar agora" = vencida (OVERDUE) OU pendente que já venceu/vence
    // em breve. Uma PENDING com vencimento distante (a Asaas gera 40 dias antes)
    // NÃO conta como fatura a pagar agora — senão o cliente em dia veria "Pague
    // agora" o mês todo.
    const hoje = new Date();
    const emBreve = new Date();
    emBreve.setDate(hoje.getDate() + 5); // janela: vencidas ou vencendo em 5 dias

    function ehParaPagarAgora(c: { status: string; dueDate?: string }): boolean {
      if (c.status === "OVERDUE") return true;
      if (c.status === "PENDING" || c.status === "AWAITING_RISK_ANALYSIS") {
        if (!c.dueDate) return false;
        const venc = new Date(c.dueDate);
        return venc <= emBreve; // já venceu ou vence em breve
      }
      return false;
    }

    // paga? (para o portal saber que está tudo certo)
    const pagas = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"]);
    const temPaga = cobrancas.some((c) => pagas.has(c.status));

    const faturaParaPagar = cobrancas.find(ehParaPagarAgora);
    // próxima fatura futura (pendente, ainda não vencida) — para exibir ao cliente
    const proximaFutura = cobrancas
      .filter((c) => (c.status === "PENDING" || c.status === "AWAITING_RISK_ANALYSIS") && c.dueDate)
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())[0];

    const relevante = faturaParaPagar ?? proximaFutura ?? cobrancas[0];
    const billingType = relevante.billingType || "UNDEFINED";
    return {
      billingType,
      ehCartao: billingType === "CREDIT_CARD",
      temFaturaAberta: Boolean(faturaParaPagar),
      temPaga,
      proximoVencimento: proximaFutura?.dueDate ?? null,
      linkFatura: relevante.invoiceUrl ?? null,
      statusCobranca: relevante.status ?? null,
    };
  } catch {
    return null; // portal degrada: mostra o que tiver no banco
  }
}

// Cancela a recorrência de uma assinatura na Asaas SEM apagar o que já foi pago.
// Usa status INACTIVE (não DELETE): a Asaas para de gerar novas cobranças, mas
// não remove cobranças em aberto. É reversível (pode voltar a ACTIVE).
// A Asaas é a fonte da verdade — só marcamos 'cancelada' no nosso banco depois
// que esta chamada tiver sucesso.
export async function cancelarAssinaturaAsaas(asaasSubscriptionId: string): Promise<void> {
  await asaas("PUT", `/subscriptions/${asaasSubscriptionId}`, { status: "INACTIVE" });
}

// Determina o status "da verdade" de uma assinatura consultando a Asaas.
// Usado na ressincronização (quando um webhook se perdeu). Olha as cobranças:
// - alguma CONFIRMED/RECEIVED e sem cobrança em aberto → 'paga'
// - alguma em aberto vencida (OVERDUE) → 'atrasada'
// - alguma em aberto (PENDING) → 'pendente'
// - todas removidas/estornadas → 'cancelada'
// Retorna null se não conseguir consultar (não mexe no banco nesse caso).
export async function statusRealAssinaturaAsaas(
  asaasSubscriptionId: string
): Promise<"paga" | "atrasada" | "pendente" | "cancelada" | null> {
  try {
    const resp = await asaas<{
      data: { status: string }[];
    }>("GET", `/subscriptions/${asaasSubscriptionId}/payments`);
    const cobrancas = resp?.data ?? [];
    if (cobrancas.length === 0) return "pendente";

    const statuses = cobrancas.map((c) => c.status);
    const temVencida = statuses.includes("OVERDUE");
    const temPaga = statuses.some((s) => ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"].includes(s));
    const temPendente = statuses.some((s) => ["PENDING", "AWAITING_RISK_ANALYSIS"].includes(s));
    const todasCanceladas = statuses.every((s) =>
      ["DELETED", "REFUNDED", "REFUND_REQUESTED", "CHARGEBACK_REQUESTED"].includes(s)
    );

    // Ordem de prioridade IMPORTA. A Asaas gera a próxima cobrança 40 dias antes,
    // então uma assinatura em dia SEMPRE tem uma cobrança PENDING futura — isso é
    // normal e NÃO significa 'pendente'. Por isso:
    // 1) todas canceladas → cancelada
    // 2) alguma vencida e não paga → atrasada (o cliente está devendo de fato)
    // 3) alguma paga (CONFIRMED = cliente pagou, mesmo sem liquidar; RECEIVED =
    //    liquidado) → paga, mesmo que exista uma pendente futura
    // 4) só então, se não há nenhuma paga, considera pendente (cliente novo que
    //    ainda não pagou a primeira)
    if (todasCanceladas) return "cancelada";
    if (temVencida) return "atrasada";
    if (temPaga) return "paga";
    if (temPendente) return "pendente";
    return "pendente";
  } catch {
    return null;
  }
}

export type CobrancaHistorico = {
  status: string;        // status cru da Asaas
  statusLabel: string;   // rótulo amigável
  valor: number;
  vencimento: string | null;
  dataPagamento: string | null;
  meio: string;
  link: string | null;
};

// Rótulo amigável para o status de uma cobrança da Asaas.
function rotuloStatusCobranca(s: string): string {
  switch (s) {
    case "CONFIRMED": return "Paga (aguardando repasse)";
    case "RECEIVED":
    case "RECEIVED_IN_CASH": return "Paga";
    case "PENDING": return "Aguardando pagamento";
    case "AWAITING_RISK_ANALYSIS": return "Em análise";
    case "OVERDUE": return "Vencida";
    case "REFUNDED": return "Estornada";
    case "DELETED": return "Removida";
    default: return s;
  }
}

// Histórico de cobranças de uma assinatura (para o admin/loja ver o extrato).
export async function historicoPagamentosAsaas(
  asaasSubscriptionId: string
): Promise<CobrancaHistorico[]> {
  try {
    const resp = await asaas<{
      data: {
        status: string; value: number; dueDate?: string;
        paymentDate?: string; clientPaymentDate?: string;
        billingType: string; invoiceUrl?: string;
      }[];
    }>("GET", `/subscriptions/${asaasSubscriptionId}/payments`);
    const cobrancas = resp?.data ?? [];
    return cobrancas.map((c) => ({
      status: c.status,
      statusLabel: rotuloStatusCobranca(c.status),
      valor: Number(c.value) || 0,
      vencimento: c.dueDate ?? null,
      dataPagamento: c.paymentDate || c.clientPaymentDate || null,
      meio: c.billingType || "UNDEFINED",
      link: c.invoiceUrl ?? null,
    }));
  } catch {
    return [];
  }
}

/**
 * Cobranças EM ABERTO de uma assinatura, com vencimento.
 *
 * A régua precisa de duas coisas que o status sozinho não dá: se existe saldo
 * devedor (não só a última fatura) e desde quando — é do vencimento mais antigo
 * que contam os dias da Cláusula 9.3.
 */
export async function cobrancasEmAbertoAsaas(
  asaasSubscriptionId: string
): Promise<
  | {
      /** TODAS as em aberto — é o que se apaga no cancelamento. */
      pagamentos: { id: string; valor: number; vencimento: string }[];
      /** Só as já vencidas — é o que define o atraso. */
      vencidas: { id: string; valor: number; vencimento: string }[];
      maisAntigo: string | null;
    }
  | null
> {
  try {
    const r = await asaas<any>(
      "GET",
      `/subscriptions/${asaasSubscriptionId}/payments`
    );
    const lista: any[] = r?.data ?? [];

    // PENDING e OVERDUE são as em aberto. CONFIRMED/RECEIVED já foram pagas.
    const abertas = lista
      .filter((p) => p?.status === "OVERDUE" || p?.status === "PENDING")
      .map((p) => ({
        id: String(p.id),
        valor: Number(p.value) || 0,
        vencimento: String(p.dueDate ?? ""),
      }))
      .filter((p) => p.vencimento);

    // Duas listas, porque servem a propósitos diferentes:
    //
    // VENCIDAS definem o atraso. A Asaas gera a próxima cobrança 40 dias antes
    // do vencimento, então uma pendente futura não é dívida — contar os dias a
    // partir dela cancelaria contrato de quem está em dia.
    //
    // TODAS as em aberto é o que se APAGA no cancelamento. Cancelar a
    // assinatura faz a Asaas parar de gerar novas, mas as já geradas com
    // vencimento futuro continuam lá — e o cliente receberia, em outubro, um
    // boleto de um plano cancelado em setembro. É exatamente o que a Cláusula
    // 9.3 quer evitar.
    const hoje = new Date().toISOString().slice(0, 10);
    const vencidas = abertas.filter((p) => p.vencimento < hoje);

    const maisAntigo =
      vencidas.length > 0
        ? vencidas.map((p) => p.vencimento).sort()[0]
        : null;

    return { pagamentos: abertas, vencidas, maisAntigo };
  } catch (e: any) {
    // null = não conseguimos saber. A régua NÃO age em caso de dúvida:
    // suspender por falha de rede seria cortar o serviço de quem está em dia.
    console.error("[ASAAS] falha ao listar cobranças em aberto:", e?.message);
    return null;
  }
}

/**
 * Apaga uma cobrança na Asaas (Cláusula 9.3).
 *
 * DELETE e não apenas cancelamento da assinatura: o contrato manda cancelar as
 * cobranças em aberto do período sem cobertura — cobrar por serviço não
 * prestado é o tipo de coisa que vira reclamação no Procon.
 */
export async function excluirCobrancaAsaas(paymentId: string): Promise<void> {
  await asaas("DELETE", `/payments/${paymentId}`);
}

/**
 * Estorna uma cobrança na Asaas.
 *
 * Estorno TOTAL, sem valor no corpo: a doc é explícita de que o split só é
 * revertido automaticamente no total. No parcial, cada carteira exigiria
 * requisição própria — e a nossa regra (arrependimento, art. 49) é devolução
 * integral de qualquer forma.
 *
 * Só CARTÃO e PIX. Boleto devolve por um link em que o cliente informa dados
 * bancários, e pode nunca se completar — o sistema acharia que devolveu sem ter
 * devolvido.
 */
export async function estornarCobrancaAsaas(paymentId: string): Promise<{
  status: string;
  valor: number | null;
}> {
  const r = await asaas<any>("POST", `/payments/${paymentId}/refund`);
  return {
    status: String(r?.status ?? "REFUNDED"),
    valor: r?.value != null ? Number(r.value) : null,
  };
}

/** Meios em que o estorno devolve direto para a origem. */
export function meioPermiteEstorno(meio: string | null | undefined): boolean {
  const m = String(meio ?? "").toUpperCase();
  return m === "CREDIT_CARD" || m === "DEBIT_CARD" || m === "PIX";
}

/**
 * Altera o valor mensal de uma assinatura (reajuste anual).
 *
 * SEM `updatePendingPayments`: a Asaas só muda as cobranças FUTURAS, e é isso
 * que queremos. Cobrança já gerada foi enviada ao cliente com um valor; mudar
 * o boleto depois de emitido é cobrar a mais sem aviso.
 *
 * Cartão de crédito: a Asaas exige tokenização ativa na conta para alterar
 * valor. Sem ela, a chamada é recusada — e o erro aparece na tela, por
 * assinatura.
 */
export async function atualizarValorAssinaturaAsaas(
  asaasSubscriptionId: string,
  novoValor: number
): Promise<void> {
  await asaas("POST", `/subscriptions/${asaasSubscriptionId}`, {
    value: Number(novoValor.toFixed(2)),
  });
}
