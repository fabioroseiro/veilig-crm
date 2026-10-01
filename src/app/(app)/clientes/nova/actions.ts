"use server";

import { revalidatePath } from "next/cache";
import { enviarBoasVindas } from "@/lib/boas-vindas";
import { db, withTenant, schema } from "@/db";
import { getSessionContext } from "@/lib/session";
import { clienteVeiculoSchema, normalizaPlaca } from "@/lib/cliente-validation";
import { soDigitos } from "@/lib/loja-validation";
import { logDev } from "@/lib/log";
import { and, eq, sql } from "drizzle-orm";
import { asaasConfigurada, upsertCustomerAsaas, createSubscriptionAsaas } from "@/lib/asaas";
import { avaliarCarencia, calcularPreco, paraISO } from "@/lib/carencia";
import { gerarSenhaProvisoria } from "@/lib/senha";
import { montarSnapshotDoPlano } from "@/lib/contrato";
import { montarDadosCliente } from "@/lib/contrato-cliente";
import { congelarContrato } from "@/lib/congelar-contrato";
import bcrypt from "bcryptjs";

export type FormState = {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
  /**
   * Senha provisória do cliente, devolvida UMA VEZ para a tela mostrar ao
   * vendedor com o cliente ainda no balcão.
   *
   * Antes ela era os 5 primeiros dígitos do CPF e o vendedor podia deduzir.
   * Agora é aleatória: se não for exibida aqui, ninguém mais a conhece e o
   * cliente fica sem acesso ao portal.
   *
   * Não vai por redirect/query string de propósito — URL fica no histórico do
   * navegador e nos logs do servidor.
   */
  senhaCliente?: string;
  /** Preenchido quando o contrato NÃO pôde ser congelado. */
  avisoContrato?: string | null;
  nomeCliente?: string;
  /** Quando a placa já tem plano: id do cliente dono, para link direto. */
  clienteExistenteId?: string;
};

export async function criarClienteVeiculo(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await getSessionContext();

  const raw = Object.fromEntries(formData) as Record<string, string>;

  // Fora de qualquer bloco: precisa alcançar o retorno da action.
  // Congelamento que falha em silêncio é pior que não existir — todos acham
  // que o documento está arquivado, e a descoberta vem na disputa.
  let avisoContratoFinal: string | null = "não executado";
  const parsed = clienteVeiculoSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors, values: raw, message: "Verifique os campos." };
  }
  const d = parsed.data;

  // Loja alvo: vendedor usa a própria; admin escolhe no form.
  const storeId =
    ctx.role === "store_admin" ? ctx.storeId ?? null : (d.storeId || null);
  if (!storeId) {
    return {
      ok: false,
      errors: ctx.role === "store_admin" ? undefined : { storeId: "Selecione a loja." },
      values: raw,
      message: "Loja não definida para a venda.",
    };
  }

  const cpf = soDigitos(d.cpf);

  // dados do plano escolhido (vêm de campos ocultos do formulário)
  const planId = String(formData.get("planId") || "") || null;
  // O preço do formulário serve apenas para saber se houve escolha de plano.
  // O valor real é recalculado no servidor a partir do preço cadastrado.
  const precoContratado = String(formData.get("precoContratado") || "") || null;
  let precoFinalServidor: string | null = null;

  // ── Primeiro vencimento (migração de clientes) ─────────────────────────
  //
  // Cliente que vem de outro plano costuma ter data de cobrança própria.
  // Forçar o vencimento no dia da venda geraria uma cobrança fora do ciclo
  // dele — atrito logo na migração.
  //
  // Só a Veilig. O papel é conferido AQUI, no servidor: o campo escondido na
  // tela não impede um POST montado à mão, e isto mexe com cobrança.
  //
  // Não altera carência nem aceite: a carência continua contando da data da
  // VENDA, e o aceite continua sendo o primeiro pagamento.
  //
  // Fica no nível da ação, e não dentro da transação: aqui o return realmente
  // interrompe a venda e devolve o erro para a tela.
  const hojeISO = new Date().toISOString().slice(0, 10);
  const limiteISO = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const vencimentoPedido = String(formData.get("primeiroVencimento") || "").trim();
  let primeiroVencimentoEscolhido: string | null = null;

  if (ctx.role === "veilig_admin" && /^\d{4}-\d{2}-\d{2}$/.test(vencimentoPedido)) {
    if (vencimentoPedido < hojeISO) {
      return { ok: false, values: raw, message: "O primeiro vencimento não pode estar no passado." };
    }
    if (vencimentoPedido > limiteISO) {
      return { ok: false, values: raw, message: "O primeiro vencimento não pode passar de 60 dias da data de hoje." };
    }
    primeiroVencimentoEscolhido = vencimentoPedido;
  }
  // Fora da transação: o acesso ao portal é criado depois da venda salva, e a
  // senha precisa chegar à tela para o vendedor passar ao cliente.
  let senhaDoCliente: string | null = null;
  // Guardadas para o e-mail de boas-vindas, que é enviado FORA do try da
  // venda: ela já está concluída, e um e-mail não pode desfazê-la.
  let personIdDaVenda: string | null = null;
  let nomeLojaDaVenda: string | null = null;
  let nomePlanoDaVenda: string | null = null;
  let placaOuChassiDaVenda: string | null = null;
  let carenciaAteDaVenda: string | null = null;

  try {
    // person é GLOBAL por CPF. Criar/resolver via função SECURITY DEFINER
    // upsert_person (roda com privilégios do dono, contornando o RLS de tenant
    // de forma controlada — o insert direto era bloqueado pelo RLS de person).
    let personId: string;
    const resultadoTx = await withTenant(ctx, async (tx) => {
      const r = await tx.execute(
        sql`SELECT upsert_person(${cpf}, ${d.nome}) AS id`
      );
      // Drizzle pode retornar array direto ou { rows: [...] }
      const rows = (Array.isArray(r) ? r : (r as any).rows) as { id: string }[];
      personId = rows[0]?.id;
      if (!personId) throw new Error("person-falhou");
      personIdDaVenda = personId;

      // grupo da loja (para desnormalizar no customer/vehicle)
      const lojaRows = await tx
        .select({ groupId: schema.stores.groupId })
        .from(schema.stores)
        .where(eq(schema.stores.id, storeId))
        .limit(1);
      const groupId = lojaRows[0]?.groupId;
      if (!groupId) throw new Error("loja-invalida");

      // reusa customer se já existir nesta loja para esta pessoa
      const jaCliente = await tx
        .select({ id: schema.customers.id })
        .from(schema.customers)
        .where(
          and(eq(schema.customers.personId, personId), eq(schema.customers.storeId, storeId))
        )
        .limit(1);

      let customerId: string;
      if (jaCliente[0]) {
        customerId = jaCliente[0].id;
      } else {
        const insC = await tx
          .insert(schema.customers)
          .values({
            groupId,
            storeId,
            personId,
            email: d.email.toLowerCase(),
            telefone: soDigitos(d.telefone),
            // Endereço: entra no contrato e vai para a Asaas, poupando o
            // cliente de digitá-lo de novo no checkout.
            cep: soDigitos(d.cep) || null,
            logradouro: d.logradouro || null,
            numero: d.numero || null,
            complemento: d.complemento || null,
            bairro: d.bairro || null,
            cidade: d.cidade || null,
            uf: d.uf.toUpperCase() || null,
          })
          .returning({ id: schema.customers.id });
        customerId = insC[0].id;
      }

      // dados do modelo do catálogo (para preencher marca/modelo/ano do veículo)
      const modeloRows = await tx
        .select({
          fabricante: schema.vehicleModels.fabricante,
          modelo: schema.vehicleModels.modelo,
          versao: schema.vehicleModels.versao,
        })
        .from(schema.vehicleModels)
        .where(eq(schema.vehicleModels.id, d.vehicleModelId))
        .limit(1);
      const m = modeloRows[0];
      if (!m) throw new Error("modelo-invalido");

      // Loja sem walletId não pode vender: a Asaas recusaria o split, e a
      // venda ficaria gravada com erro de sincronização — cliente cadastrado,
      // ninguém cobrado. Melhor barrar antes de criar qualquer coisa.
      const lojaWallet = await tx
        .select({ walletId: schema.stores.walletId, nome: schema.stores.nomeFantasia })
        .from(schema.stores)
        .where(eq(schema.stores.id, storeId))
        .limit(1);
      if (!lojaWallet[0]?.walletId) {
        throw new Error(`loja-sem-wallet:${lojaWallet[0]?.nome ?? ""}`);
      }
      // Vai no remetente do e-mail: o cliente reconhece a concessionária.
      nomeLojaDaVenda = lojaWallet[0]?.nome ?? null;

      // Um veículo só pode ter UMA assinatura vigente. O índice único no banco
      // é por vehicle_id, mas aqui sempre inserimos um veículo NOVO — então a
      // mesma placa vendida duas vezes geraria dois vehicle_id distintos e
      // escaparia do índice. A checagem real precisa ser pela PLACA.
      // Assinatura cancelada não conta: revenda após cancelamento é permitida.
      const placaNormalizada = d.placa?.trim() ? normalizaPlaca(d.placa) : null;
      // Um dos dois sempre existe — o schema garante.
      const chassiNormalizado = d.chassi?.trim()
        ? d.chassi.toUpperCase().replace(/[^0-9A-HJ-NPR-Z]/g, "")
        : null;
      const jaVigente = await tx
        .select({
          id: schema.subscriptions.id,
          customerId: schema.subscriptions.customerId,
          nome: schema.persons.nomeCompleto,
        })
        .from(schema.subscriptions)
        .innerJoin(schema.vehicles, eq(schema.subscriptions.vehicleId, schema.vehicles.id))
        .innerJoin(schema.customers, eq(schema.customers.id, schema.subscriptions.customerId))
        .innerJoin(schema.persons, eq(schema.persons.id, schema.customers.personId))
        .where(
          and(
            // Duplicidade vale pela PLACA ou pelo CHASSI: sem isto, um zero km
            // sem placa poderia receber dois planos, e ninguém perceberia até
            // a segunda cobrança.
            placaNormalizada
              ? eq(schema.vehicles.placa, placaNormalizada)
              : eq(schema.vehicles.chassi, chassiNormalizado!),
            sql`${schema.subscriptions.status} <> 'cancelada'`
          )
        )
        .limit(1);
      if (jaVigente[0]) {
        // Diz DE QUEM é a placa: "já tem plano" sem dizer com quem obriga o
        // vendedor a caçar na lista de clientes para entender o que houve.
        throw new Error(
          `placa-com-assinatura-vigente:${jaVigente[0].nome ?? ""}:${jaVigente[0].customerId ?? ""}`
        );
      }

      const insV = await tx.insert(schema.vehicles).values({
        groupId,
        customerId,
        vehicleModelId: d.vehicleModelId,
        placa: placaNormalizada,
        // Sem esta linha o chassi era validado, usado na checagem de
        // duplicidade e depois DESCARTADO — o veículo ficava sem placa e sem
        // chassi, impossível de identificar.
        chassi: chassiNormalizado,
        marca: m.fabricante,
        modelo: `${m.modelo}${m.versao ? " " + m.versao : ""}`,
        ano: d.ano, // ano do veículo do cliente, digitado pelo vendedor
        kmAtual: d.kmAtual,
        kmMesEstimado: d.kmMesEstimado,
        perfilUso: d.perfilUso,
      }).returning({ id: schema.vehicles.id });
      const vehicleId = insV[0].id;

      // Cria a ASSINATURA (o contrato da venda), se um plano foi escolhido.
      let subId: string | null = null;
      // Motivo da falha ao congelar o contrato, se houver — vai para a tela.
      // Congelamento que falha em silêncio é pior que não existir: todos acham
      // que o documento está arquivado, e a descoberta vem na disputa.
      let avisoContrato: string | null = "não executado";
      if (planId && precoContratado) {
        // CARÊNCIA — recalculada aqui no servidor, não aceita da tela.
        // A tela usa a mesma função (src/lib/carencia.ts), então o vendedor viu
        // exatamente isto; mas quem grava é o servidor, com a política lida do
        // banco no instante da venda.
        const planoRows = await tx
          .select({
            aceitaZeroKm: schema.plans.aceitaZeroKm,
            idadeMaximaAnos: schema.plans.idadeMaximaAnos,
            carenciaZeroKm: schema.plans.carenciaZeroKm,
            carenciaAte2Anos: schema.plans.carenciaAte2Anos,
            carencia3a5Anos: schema.plans.carencia3a5Anos,
            carencia6Mais: schema.plans.carencia6Mais,
            acrescimoAte2Anos: schema.plans.acrescimoAte2Anos,
            acrescimo3a5Anos: schema.plans.acrescimo3a5Anos,
            acrescimo6Mais: schema.plans.acrescimo6Mais,
          })
          .from(schema.plans)
          .where(eq(schema.plans.id, planId))
          .limit(1);
        if (!planoRows[0]) throw new Error("plano-invalido");

        const av = avaliarCarencia({
          politica: planoRows[0],
          anoVeiculo: d.ano,
          zeroKm: d.zeroKm,
        });

        // Guarda de elegibilidade no servidor: o botão já fica desabilitado na
        // tela, mas isso não impede um POST montado à mão.
        if (!av.elegivel) throw new Error(`inelegivel:${av.motivo ?? ""}`);

        // PREÇO — recalculado a partir do que a loja cadastrou, NUNCA do que
        // veio no formulário. O campo oculto do form é manipulável; o preço
        // cadastrado no banco não é.
        const precoRows = await tx
          .select({ preco: schema.storePlanPrices.preco })
          .from(schema.storePlanPrices)
          .innerJoin(
            schema.storePlans,
            eq(schema.storePlanPrices.storePlanId, schema.storePlans.id)
          )
          .where(
            and(
              eq(schema.storePlans.storeId, storeId),
              eq(schema.storePlans.planId, planId),
              eq(schema.storePlanPrices.vehicleModelId, d.vehicleModelId)
            )
          )
          .limit(1);
        if (!precoRows[0]) throw new Error("sem-preco");

        const politicaPreco = {
          acrescimoAte2Anos: Number(planoRows[0].acrescimoAte2Anos),
          acrescimo3a5Anos: Number(planoRows[0].acrescimo3a5Anos),
          acrescimo6Mais: Number(planoRows[0].acrescimo6Mais),
        };
        const preco = calcularPreco(Number(precoRows[0].preco), politicaPreco, av.faixa);

        // SNAPSHOT do plano: congela o conteúdo contratado. Sem isto, o
        // contrato deste cliente mudaria junto com o plano, e um documento de
        // hoje aberto daqui a dois anos descreveria outra coisa.
        // ── Isenção de carência ──────────────────────────────────────────
        //
        // Verificada no servidor, não aceita da tela. A função no banco confere
        // as três condições que importam: aprovada, ainda não usada, e dentro
        // das 24 horas.
        let isencaoId: string | null = null;
        let isencaoMotivo: string | null = null;
        try {
          const r = await tx.execute(
            sql`SELECT isencao_valida(${cpf}, ${storeId}::uuid, ${d.vehicleModelId}::uuid) AS id`
          );
          isencaoId = ((Array.isArray(r) ? r : (r as any).rows)[0]?.id as string) ?? null;
          if (isencaoId) {
            const [iso] = await tx
              .select({ motivo: schema.isencoesCarencia.motivo })
              .from(schema.isencoesCarencia)
              .where(eq(schema.isencoesCarencia.id, isencaoId))
              .limit(1);
            isencaoMotivo = iso?.motivo ?? null;
          }
        } catch (e: any) {
          // Falha aqui NÃO cancela a venda — ela sai com carência normal, que é
          // o comportamento seguro. Perder a isenção é recuperável; perder a
          // venda, não.
          console.error("[VENDA] falha ao checar isenção:", e?.message);
        }

        // ── Migração de cliente ──────────────────────────────────────────
        //
        // O preço normalmente é recalculado do cadastro, nunca do formulário —
        // sem isso, um POST montado à mão venderia por R$ 1.
        //
        // A exceção é a migração: o cliente vinha de um plano anterior da
        // concessionária e mantém o que pagava, senão a migração vira aumento
        // e ele cancela.
        //
        // SÓ Veilig admin. E fica MARCADO como migrada: exceção sem registro
        // vira mistério seis meses depois, quando alguém vê R$ 89 num plano de
        // R$ 149 e não sabe se foi migração ou erro.
        const ehMigracao =
          ctx.role === "veilig_admin" && String(formData.get("migracao") || "") === "on";

        const precoMigracao = ehMigracao
          ? Number(String(formData.get("precoMigracao") || "").replace(/\./g, "").replace(",", "."))
          : NaN;

        const usaPrecoMigracao =
          ehMigracao && Number.isFinite(precoMigracao) && precoMigracao >= 5;

        const vendedorMigracao =
          ehMigracao ? String(formData.get("vendedorMigracao") || "") || null : null;

        const snapshot = await montarSnapshotDoPlano(tx, planId, storeId);

        // Dados que o e-mail de boas-vindas mostra ao cliente.
        // O nome do plano vive em snapshot.plano.nome — snapshot.nome não
        // existe, e o e-mail saía com o nome em branco.
        nomePlanoDaVenda = (snapshot as any)?.plano?.nome ?? null;
        placaOuChassiDaVenda = placaNormalizada ?? d.chassi ?? null;
        carenciaAteDaVenda =
          isencaoId ? null : av.carenciaAte ? paraISO(av.carenciaAte) : null;

        // Número legível do contrato, gerado por sequência no banco.
        const numRows = await tx.execute(sql`SELECT gerar_numero_contrato() AS n`);
        const numeroContrato =
          ((Array.isArray(numRows) ? numRows : (numRows as any).rows)[0]?.n as string) ?? null;

        const insS = await tx.insert(schema.subscriptions).values({
          groupId,
          storeId,
          customerId,
          vehicleId,
          planId,
          precoContratado: (usaPrecoMigracao ? precoMigracao : preco.final).toFixed(2),
          migrada: usaPrecoMigracao,
          migradaObservacao: usaPrecoMigracao
            ? String(formData.get("migracaoObs") || "").trim() ||
              `Migrado de plano anterior. Preço do plano na data: R$ ${preco.final.toFixed(2)}.`
            : null,
          precoBase: preco.base.toFixed(2),
          acrescimoPercent: preco.acrescimoPercent.toFixed(2),
          // Na migração, a Veilig indica quem foi o vendedor — senão o
          // histórico do cliente migrado fica sem dono e ele some da apuração.
          vendedorId: vendedorMigracao ?? (ctx.role === "store_admin" ? ctx.userId ?? null : null),
          status: "ativa",
          asaasSyncStatus: "pendente",
          veiculoZeroKm: d.zeroKm,
          veiculoIdadeAnos: av.idadeAnos,
          carenciaFaixa: av.faixa,
          // A isenção zera a carência. Quem decide é o SERVIDOR, consultando o
          // banco: a tela pode dizer que há aprovação, mas um POST montado à
          // mão diria o mesmo.
          carenciaMeses: isencaoId ? 0 : av.meses,
          carenciaAte: isencaoId
            ? null
            : av.carenciaAte
            ? paraISO(av.carenciaAte)
            : null,
          carenciaIsenta: Boolean(isencaoId),
          carenciaIsencaoId: isencaoId,
          carenciaIsencaoMotivo: isencaoMotivo,
          planoSnapshot: snapshot,
          contratoNumero: numeroContrato,
        }).returning({ id: schema.subscriptions.id });
        subId = insS[0].id;
        precoFinalServidor = (usaPrecoMigracao ? precoMigracao : preco.final).toFixed(2);

        // Marca a isenção como USADA: uso único, senão a mesma aprovação
        // serviria para várias vendas.
        if (isencaoId) {
          await tx
            .update(schema.isencoesCarencia)
            .set({ usadaEm: new Date(), subscriptionId: subId })
            .where(eq(schema.isencoesCarencia.id, isencaoId));
        }

        // ── Congela o TEXTO do contrato ─────────────────────────────────
        //
        // O snapshot acima congela o conteúdo do PLANO; isto congela as
        // CLÁUSULAS. Sem os dois, alterar o contrato faria um documento
        // assinado hoje exibir texto que este cliente nunca aceitou.
        //
        // Roda DEPOIS do insert porque precisa dos dados já gravados — é o
        // mesmo caminho que a tela usa para exibir, então o que fica guardado
        // é exatamente o que o cliente vê.
        //
        // Falha aqui NÃO derruba a venda: o cliente pagou, e o texto pode ser
        // regenerado a partir do snapshot. Por isso o try/catch.
        //
        // O motivo da falha é DEVOLVIDO à tela, não só registrado no log.
        // Congelamento que falha em silêncio é pior que não existir: todo mundo
        // acha que o contrato está arquivado, e a descoberta vem na disputa.
        try {
          const [subGravada] = await tx
            .select()
            .from(schema.subscriptions)
            .where(eq(schema.subscriptions.id, subId))
            .limit(1);

          if (!subGravada) {
            avisoContrato = "assinatura não encontrada após gravar";
          } else {
            const info = await montarDadosCliente(tx, subGravada);
            if (!info) {
              avisoContrato = "não foi possível montar os dados do contrato";
            } else {
              const html = congelarContrato(
                info.dados,
                info.cliente,
                new Date().toLocaleDateString("pt-BR")
              );
              if (!html) {
                avisoContrato = "o documento saiu vazio na geração";
              } else {
                await tx
                  .update(schema.subscriptions)
                  .set({ contratoHtml: html })
                  .where(eq(schema.subscriptions.id, subId));
                avisoContrato = null;
              }
            }
          }
        } catch (e: any) {
          avisoContrato = e?.message ?? "erro desconhecido";
          console.error("[VENDA] nao foi possivel congelar o contrato:", e?.message, e?.stack);
        }
      }

      return { customerId, subId, personId, precoFinalServidor, avisoContrato };
    });

    // === Cria o ACESSO do cliente (portal) — resiliente, após a venda salva ===
    // Fora da transação: se falhar, a venda não é perdida e o erro fica no log.
    try {
      // Senha ALEATÓRIA, não derivada do CPF: CPF não é segredo, está em nota
      // fiscal e ficha de oficina. Ela é devolvida para a tela mostrar ao
      // vendedor uma única vez, com o cliente ainda no balcão.
      const senhaProvisoria = gerarSenhaProvisoria();
      senhaDoCliente = senhaProvisoria;
      const senhaHashCliente = bcrypt.hashSync(senhaProvisoria, 10);
      await db.execute(
        sql`SELECT upsert_customer_auth(${resultadoTx.personId}::uuid, ${cpf}, ${senhaHashCliente})`
      );
      logDev("[PORTAL] acesso do cliente criado/garantido para CPF", cpf.slice(0, 3) + "…");
    } catch (eAuth: any) {
      console.error("[PORTAL] falha ao criar acesso do cliente:", eAuth?.message);
      // não derruba a venda; o acesso pode ser recriado depois
    }

    // === Sincronização com o Asaas (resiliente) ===
    // Roda DEPOIS da venda estar salva. Se falhar (rede, API fora), a venda NÃO
    // é perdida — fica marcada com o motivo para reprocessar/diagnosticar depois.
    const { customerId, subId } = resultadoTx;
    avisoContratoFinal = resultadoTx.avisoContrato;

    const precoParaAsaas = resultadoTx.precoFinalServidor;
    if (!asaasConfigurada()) {
      // chave não configurada neste ambiente: registra o motivo claramente
      console.warn("[ASAAS] chave não configurada — sincronização pulada");
      if (subId) {
        await withTenant(ctx, async (tx) => {
          await tx
            .update(schema.subscriptions)
            .set({ asaasSyncStatus: "erro", asaasSyncErro: "ASAAS_API_KEY não configurada neste ambiente." })
            .where(eq(schema.subscriptions.id, subId!));
        });
      }
    } else {
      try {
        const asaasCustomerId = await upsertCustomerAsaas({
          nome: d.nome,
          cpf,
          email: d.email,
          telefone: d.telefone,
          // Endereço vai junto: menos campo para o cliente preencher no
          // checkout, e o boleto exige endereço de qualquer forma.
          cep: d.cep,
          logradouro: d.logradouro,
          numero: d.numero,
          complemento: d.complemento,
          bairro: d.bairro,
        });
        // guarda o id do Asaas no nosso customer (reuso em vendas futuras)
        await withTenant(ctx, async (tx) => {
          await tx
            .update(schema.customers)
            .set({ asaasCustomerId })
            .where(eq(schema.customers.id, customerId));
        });
        logDev("[ASAAS] customer criado/reusado:", asaasCustomerId);

        // Cria a ASSINATURA na Asaas com SPLIT (se houver plano na venda).
        if (subId && planId && precoParaAsaas) {
          // busca fee (override da loja ou padrão do grupo) e walletId da loja
          const dados = await withTenant(ctx, async (tx) => {
            const lojaRows = await tx
              .select({
                walletId: schema.stores.walletId,
                feeOverride: schema.stores.feePercentOverride,
                groupId: schema.stores.groupId,
              })
              .from(schema.stores)
              .where(eq(schema.stores.id, storeId))
              .limit(1);
            const loja = lojaRows[0];
            const grpRows = await tx
              .select({ feePadrao: schema.groups.feePercentPadrao })
              .from(schema.groups)
              .where(eq(schema.groups.id, loja.groupId))
              .limit(1);
            const planRows = await tx
              .select({ nome: schema.plans.nome })
              .from(schema.plans)
              .where(eq(schema.plans.id, planId))
              .limit(1);
            return {
              walletId: loja?.walletId ?? null,
              fee: Number(loja?.feeOverride ?? grpRows[0]?.feePadrao ?? "8.00"),
              planoNome: planRows[0]?.nome ?? "Plano de manutenção",
            };
          });

          if (!dados.walletId) {
            // loja sem walletId não pode receber split — registra e não quebra
            await withTenant(ctx, async (tx) => {
              await tx
                .update(schema.subscriptions)
                .set({
                  asaasSyncStatus: "erro",
                  asaasSyncErro: "Loja sem walletId configurado (necessário para o split).",
                })
                .where(eq(schema.subscriptions.id, subId));
            });
          } else {
            const hoje = new Date().toISOString().slice(0, 10);
            logDev("[ASAAS] tentando criar assinatura:", {
              customer: asaasCustomerId,
              valor: precoParaAsaas,
              wallet: dados.walletId?.slice(0, 8) + "…",
              fee: dados.fee,
            });
            try {
              const sub = await createSubscriptionAsaas({
                asaasCustomerId,
                valor: precoParaAsaas,
                descricao: `${dados.planoNome} — ${d.placa.toUpperCase()}`,
                lojaWalletId: dados.walletId,
                feePercent: dados.fee,
                // Em branco = comportamento de sempre: vence no dia da venda.
                primeiroVencimento: primeiroVencimentoEscolhido ?? hoje,
              });
              await withTenant(ctx, async (tx) => {
                await tx
                  .update(schema.subscriptions)
                  .set({
                    asaasSubscriptionId: sub.subscriptionId,
                    asaasLinkPagamento: sub.linkPagamento,
                    asaasSyncStatus: "sincronizada",
                    asaasSyncErro: null,
                  })
                  .where(eq(schema.subscriptions.id, subId));
              });
              logDev("[ASAAS] assinatura criada:", sub.subscriptionId, "link:", sub.linkPagamento);
            } catch (eSub: any) {
              // erro ESPECÍFICO da criação da assinatura (separado do customer)
              const msgSub = String(eSub?.message || "erro na assinatura");
              console.error("[ASAAS] falha ao criar ASSINATURA:", msgSub);
              await withTenant(ctx, async (tx) => {
                await tx
                  .update(schema.subscriptions)
                  .set({ asaasSyncStatus: "erro", asaasSyncErro: ("[assinatura] " + msgSub).slice(0, 300) })
                  .where(eq(schema.subscriptions.id, subId));
              });
            }
          }
        } else if (subId) {
          // venda sem plano: só o customer foi sincronizado
          await withTenant(ctx, async (tx) => {
            await tx
              .update(schema.subscriptions)
              .set({ asaasSyncStatus: "sincronizada", asaasSyncErro: null })
              .where(eq(schema.subscriptions.id, subId));
          });
        }
      } catch (e: any) {
        const msg = String(e?.message || "erro desconhecido");
        console.error("[ASAAS] falha ao criar customer:", msg);
        // marca a assinatura como erro de sync, mas NÃO derruba a venda
        if (subId) {
          await withTenant(ctx, async (tx) => {
            await tx
              .update(schema.subscriptions)
              .set({ asaasSyncStatus: "erro", asaasSyncErro: msg.slice(0, 300) })
              .where(eq(schema.subscriptions.id, subId!));
          });
        }
        // não relança: a venda foi salva; a sincronização pode ser refeita
      }
    }
  } catch (e: any) {
    // Traduz os erros que o vendedor precisa entender para agir. Sem isto ele
    // recebe "não foi possível cadastrar" e não sabe o que fazer.
    const msg = String(e?.message || "");

    if (msg.startsWith("placa-com-assinatura-vigente")) {
      const [, nome, customerId] = msg.split(":");
      return {
        ok: false,
        values: raw,
        errors: { placa: "Esta placa já tem um plano vigente." },
        message:
          `Este veículo já possui um plano ativo${nome ? `, em nome de ${nome}` : ""}. ` +
          "Cancele o plano atual antes de vender outro para a mesma placa.",
        clienteExistenteId: customerId || undefined,
      };
    }
    if (msg.startsWith("inelegivel:")) {
      return {
        ok: false,
        values: raw,
        message:
          msg.slice("inelegivel:".length) ||
          "Este plano não aceita este veículo.",
      };
    }
    if (msg === "sem-preco") {
      return {
        ok: false,
        values: raw,
        message: "Este plano não tem preço cadastrado para este modelo nesta loja.",
      };
    }
    if (msg === "plano-invalido") {
      return { ok: false, values: raw, message: "Plano não encontrado. Recarregue a página." };
    }

    if (msg.startsWith("loja-sem-wallet")) {
      const nome = msg.split(":")[1];
      return {
        ok: false,
        values: raw,
        errors: { storeId: "Loja sem conta de recebimento." },
        message:
          `A loja ${nome ? `"${nome}" ` : ""}ainda não tem a conta da Asaas configurada ` +
          "(walletId). Sem ela o pagamento não pode ser dividido, e a venda não " +
          "seria cobrada. Informe o walletId no cadastro da loja antes de vender.",
      };
    }

    if (msg === "modelo-invalido") {
      return {
        ok: false,
        values: raw,
        errors: { vehicleModelId: "Modelo não encontrado." },
        message:
          "O modelo selecionado não existe mais no catálogo. Recarregue a página e escolha de novo.",
      };
    }
    if (msg === "loja-invalida") {
      return {
        ok: false,
        values: raw,
        errors: { storeId: "Loja não encontrada." },
        message: "A loja da venda não foi encontrada. Recarregue a página.",
      };
    }
    if (msg === "person-falhou") {
      return {
        ok: false,
        values: raw,
        errors: { cpf: "Não foi possível registrar este CPF." },
        message:
          "Não foi possível registrar o CPF informado. Confira o número e tente novamente.",
      };
    }

    // Rede de segurança: qualquer erro não previsto acima. A mensagem técnica
    // vai para a tela porque, sem ela, o vendedor fica sem saber o que
    // corrigir — e nós sem saber o que aconteceu.
    console.error("[VENDA] falha ao cadastrar cliente:", msg, e?.stack);
    return {
      ok: false,
      values: raw,
      message: `Não foi possível cadastrar o cliente. Detalhe: ${msg || "erro desconhecido"}`,
    };
  }

  // Boas-vindas por e-mail: rede de segurança para quando o vendedor esquece
  // de enviar o acesso pelo WhatsApp. Fora de qualquer try da venda — ela já
  // está concluída, e um e-mail não pode desfazê-la.
  if (personIdDaVenda) {
    await enviarBoasVindas({
      personId: personIdDaVenda,
      loja: nomeLojaDaVenda,
      plano: nomePlanoDaVenda,
      veiculo: placaOuChassiDaVenda,
      carenciaAte: carenciaAteDaVenda,
    });
  }

  revalidatePath("/clientes");
  // Sem redirect: a senha provisória precisa aparecer nesta tela. Mandar por
  // query string deixaria a credencial no histórico do navegador e nos logs.
  return {
    ok: true,
    senhaCliente: senhaDoCliente ?? undefined,
    avisoContrato: avisoContratoFinal,
    nomeCliente: d.nome,
    message: "Cliente cadastrado com sucesso.",
  };
}
