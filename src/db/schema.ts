// Schema do núcleo multi-tenant da Veilig — Fase 1.
// Materializa a hierarquia group → brand → store → customer → vehicle,
// mais person (camada global por CPF) e app_user (operadores).
//
// Planos, assinaturas e pagamentos NÃO entram aqui — são da Fase 2.
// O isolamento entre tenants é garantido por RLS (ver rls.sql), não só pelo app.

import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  date,
  timestamp,
  jsonb,
  pgEnum,
  unique,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ── Enums de status e papéis ────────────────────────────────────────────────

export const statusGeral = pgEnum("status_geral", [
  "ativo",
  "inativo",
  "suspenso",
  "onboarding",
]);

// Papéis dos usuários administrativos.
// veilig_admin = enxerga tudo (group_id nulo).
// group_admin = administra o próprio grupo e suas lojas.
// store_manager = GESTOR da loja: define preços dos planos e vê vendas por vendedor.
// store_admin = VENDEDOR: vende e atende todos os clientes da loja (nome histórico).
// Perfil de uso declarado na venda. Não verificável no ato — o vendedor
// pergunta e anota. A verificação vem depois, com o registro de utilização:
// o odômetro na revisão denuncia quem declarou 'particular' e roda como app.
export const perfilUso = pgEnum("perfil_uso", [
  "particular",
  "aplicativo",
  "entregas",
  "locacao",
  "frota",
]);

export const userRole = pgEnum("user_role", [
  "veilig_admin",
  "group_admin",
  "store_manager",
  "store_admin",
]);

// ── Tabelas ─────────────────────────────────────────────────────────────────

// GROUP — raiz do tenant. O grupo econômico que concentra marcas e lojas.
export const groups = pgTable("group", {
  id: uuid("id").defaultRandom().primaryKey(),
  razaoSocial: text("razao_social").notNull(),
  nomeFantasia: text("nome_fantasia"),
  // Obrigatório desde a migração dos parâmetros de contrato: contrato sem CNPJ
  // da parte contratada não serve para disputa.
  cnpj: text("cnpj").notNull(),
  responsavelNome: text("responsavel_nome").notNull(),
  responsavelEmail: text("responsavel_email").notNull(),
  telefone: text("telefone"),
  feePercentPadrao: numeric("fee_percent_padrao", { precision: 5, scale: 2 })
    .notNull()
    .default("8.00"),

  // ── Parâmetros que as cláusulas do contrato citam ────────────────────────
  // O contrato é do GRUPO com o cliente, então os números moram aqui — não na
  // loja nem no plano. Padrões = tetos usuais em relação de consumo.
  multaPercent: numeric("multa_percent", { precision: 5, scale: 2 }).notNull().default("2.00"),
  jurosMesPercent: numeric("juros_mes_percent", { precision: 5, scale: 2 }).notNull().default("1.00"),
  // Dias de atraso até o cancelamento definitivo. As cobranças em aberto são
  // apagadas — o período estava sem cobertura — e quem voltar assina de novo,
  // com carência nova.
  diasCancelamento: integer("dias_cancelamento").notNull().default(60),
  // Período de apuração de comissão. 1 e 31 = mês cheio.
  apuracaoDiaInicio: integer("apuracao_dia_inicio").notNull().default(1),
  apuracaoDiaFim: integer("apuracao_dia_fim").notNull().default(31),
  indiceReajuste: text("indice_reajuste").notNull().default("IPCA"),
  // NULL = sem teto; a cláusula de teto não aparece no contrato.
  tetoReajustePercent: numeric("teto_reajuste_percent", { precision: 5, scale: 2 }),
  status: statusGeral("status").notNull().default("onboarding"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// BRAND — marca vendida pelo grupo. Um grupo tem N marcas.
export const brands = pgTable(
  "brand",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }),
    nome: text("nome").notNull(),
    status: statusGeral("status").notNull().default("ativo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // nome de marca único dentro do grupo
    uqBrandNomeGroup: unique("uq_brand_nome_group").on(t.groupId, t.nome),
    idxBrandGroup: index("idx_brand_group").on(t.groupId),
  })
);

// STORE — loja/CNPJ. É o recebedor no split (wallet_id da Asaas).
// Pertence a um grupo e representa UM fabricante (Bajaj, Kawasaki, Honda…).
export const stores = pgTable(
  "store",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }),
    fabricante: text("fabricante").notNull(), // montadora que a loja representa
    razaoSocial: text("razao_social").notNull(),
    nomeFantasia: text("nome_fantasia").notNull(),
    cnpj: text("cnpj").notNull(),
    inscricaoEstadual: text("inscricao_estadual"),
    // endereço
    cep: text("cep").notNull(),
    logradouro: text("logradouro").notNull(),
    numero: text("numero").notNull(),
    complemento: text("complemento"),
    bairro: text("bairro").notNull(),
    cidade: text("cidade").notNull(),
    uf: text("uf").notNull(),
    // responsável legal
    responsavelNome: text("responsavel_nome").notNull(),
    responsavelCpf: text("responsavel_cpf"),
    email: text("email").notNull(),
    telefone: text("telefone").notNull(),
    // dados bancários / gateway
    walletId: text("wallet_id"), // preenchido pelo sistema ao criar a subconta na Asaas
    feePercentOverride: numeric("fee_percent_override", { precision: 5, scale: 2 }), // sobrescreve o padrão do grupo
    status: statusGeral("status").notNull().default("onboarding"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqStoreCnpj: unique("uq_store_cnpj").on(t.cnpj),
    idxStoreGroup: index("idx_store_group").on(t.groupId),
    idxStoreFabricante: index("idx_store_fabricante").on(t.fabricante),
  })
);

// APP_USER — operador administrativo. group_id nulo = admin Veilig (vê tudo).
export const appUsers = pgTable(
  "app_user",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }), // nulo para veilig_admin
    storeId: uuid("store_id").references(() => stores.id, { onDelete: "cascade" }), // preenchido p/ vendedor (store_admin)
    nome: text("nome").notNull(),
    email: text("email").notNull(),
    cpf: text("cpf"), // dígitos do CPF da pessoa
    senhaHash: text("senha_hash"), // hash bcrypt; nulo até o usuário definir senha
    role: userRole("role").notNull(),
    precisaTrocarSenha: boolean("precisa_trocar_senha").notNull().default(false),
    status: statusGeral("status").notNull().default("ativo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqUserEmail: unique("uq_user_email").on(t.email),
    idxUserGroup: index("idx_user_group").on(t.groupId),
    idxUserStore: index("idx_user_store").on(t.storeId),
  })
);

// PERSON — camada global por CPF. Um CPF pode originar N customers (lojas diferentes).
export const persons = pgTable(
  "person",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cpf: text("cpf").notNull(),
    nomeCompleto: text("nome_completo").notNull(),
    dataNascimento: date("data_nascimento"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqPersonCpf: unique("uq_person_cpf").on(t.cpf),
  })
);

// CUSTOMER — cliente por loja. Isolado por store; ligado à person global.
export const customers = pgTable(
  "customer",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }), // desnormalizado p/ RLS eficiente
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "restrict" }),
    email: text("email").notNull(),
    telefone: text("telefone").notNull(),
    asaasCustomerId: text("asaas_customer_id"), // id do customer no Asaas (após 1ª venda)
    // endereço (condicional — necessário para boleto/faturamento)
    cep: text("cep"),
    logradouro: text("logradouro"),
    numero: text("numero"),
    complemento: text("complemento"),
    bairro: text("bairro"),
    cidade: text("cidade"),
    uf: text("uf"),
    consentimentoLgpdEm: timestamp("consentimento_lgpd_em", { withTimezone: true }),
    consentimentoLgpdVersao: text("consentimento_lgpd_versao"),
    // Quando o cliente usou um link enviado a este e-mail. A recuperação de
    // senha dele depende do endereço estar certo.
    emailVerificadoEm: timestamp("email_verificado_em", { withTimezone: true }),
    status: statusGeral("status").notNull().default("ativo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // um mesmo CPF só vira um customer por loja (mas pode ter vários em lojas distintas)
    uqCustomerPersonStore: unique("uq_customer_person_store").on(t.personId, t.storeId),
    idxCustomerGroup: index("idx_customer_group").on(t.groupId),
    idxCustomerStore: index("idx_customer_store").on(t.storeId),
  })
);

// VEHICLE — veículo do cliente. Modelo + ano determinam o plano aplicável (Fase 2).
export const vehicles = pgTable(
  "vehicle",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }), // desnormalizado p/ RLS
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    vehicleModelId: uuid("vehicle_model_id").references(() => vehicleModels.id, {
      onDelete: "restrict",
    }), // vínculo com o catálogo (determina o plano aplicável)
    // Placa OU chassi: zero km sai da fábrica sem emplacar, e exigir placa
    // impedia justamente o cliente mais fácil de converter. A placa entra
    // depois, pela ficha do cliente.
    placa: text("placa"),
    marca: text("marca").notNull(),
    modelo: text("modelo").notNull(),
    ano: integer("ano").notNull(),
    chassi: text("chassi"),
    renavam: text("renavam"),
    cor: text("cor"),
    kmAtual: integer("km_atual"),
    // Uso do veículo, capturado na venda. SÓ REGISTRO por enquanto: não altera
    // preço nem elegibilidade. É a matéria-prima da calculadora de preço —
    // sem esse dado, a taxa de utilização continua sendo chute.
    perfilUso: perfilUso("perfil_uso"),
    kmMesEstimado: integer("km_mes_estimado"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxVehicleCustomer: index("idx_vehicle_customer").on(t.customerId),
    idxVehicleGroup: index("idx_vehicle_group").on(t.groupId),
  })
);

// ── Relações (para queries tipadas com Drizzle) ─────────────────────────────

export const groupsRelations = relations(groups, ({ many }) => ({
  brands: many(brands),
  stores: many(stores),
  appUsers: many(appUsers),
}));

export const brandsRelations = relations(brands, ({ one, many }) => ({
  group: one(groups, { fields: [brands.groupId], references: [groups.id] }),
  stores: many(stores),
}));

export const storesRelations = relations(stores, ({ one, many }) => ({
  group: one(groups, { fields: [stores.groupId], references: [groups.id] }),
  customers: many(customers),
}));

export const personsRelations = relations(persons, ({ many }) => ({
  customers: many(customers),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  store: one(stores, { fields: [customers.storeId], references: [stores.id] }),
  person: one(persons, { fields: [customers.personId], references: [persons.id] }),
  vehicles: many(vehicles),
}));

export const vehiclesRelations = relations(vehicles, ({ one }) => ({
  customer: one(customers, { fields: [vehicles.customerId], references: [customers.id] }),
}));

// ── Fase 2: catálogo de modelos de veículo ──────────────────────────────────
// Catálogo CENTRAL, gerido pela Veilig e compartilhado por todos os grupos.
// Não tem group_id: é uma tabela de referência global (como uma tabela de CEPs).
// Os planos se amarram a um vehicle_model (fabricante + modelo + ano).
//
// "fabricante" = montadora do veículo (Fiat, Honda). NÃO confundir com a
// "marca" da tenancy (a bandeira comercial do grupo, tabela brand).
export const categoriaVeiculo = pgEnum("categoria_veiculo", [
  "moto",
  "leve",
  "pesado",
  "utilitario",
]);

export const vehicleModels = pgTable(
  "vehicle_model",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fabricante: text("fabricante").notNull(),
    modelo: text("modelo").notNull(),
    versao: text("versao").notNull().default(""), // ex.: TSI, GLI; vazio = sem versão
    // O ANO NÃO FAZ PARTE DO CATÁLOGO. O modelo é fabricante+modelo+versão; o
    // ano é do veículo do cliente e o vendedor digita na venda. Antes o ano
    // estava aqui e obrigava um cadastro por modelo POR ANO — o que também
    // fazia o preço envelhecer sozinho a cada virada de ano.
    categoria: categoriaVeiculo("categoria").notNull().default("leve"),
    status: statusGeral("status").notNull().default("ativo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // não repetir o mesmo fabricante+modelo+versão+ano
    uqModelo: unique("uq_vehicle_model").on(t.fabricante, t.modelo, t.versao),
    idxFabricante: index("idx_vehicle_model_fabricante").on(t.fabricante),
    idxCategoria: index("idx_vehicle_model_categoria").on(t.categoria),
  })
);

// ── Fase 2: afinidade da loja com o catálogo ────────────────────────────────
// Define quais (fabricante, categoria) a loja atende. A loja NÃO recadastra
// modelos: ela indica afinidades e enxerga do catálogo central os modelos
// compatíveis. Um lançamento novo no catálogo aparece para todas as lojas
// com afinidade correspondente, sem trabalho manual.
export const storeAffinities = pgTable(
  "store_affinity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }), // p/ RLS
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    fabricante: text("fabricante").notNull(),
    categoria: categoriaVeiculo("categoria").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // não repetir a mesma afinidade para a mesma loja
    uqAffinity: unique("uq_store_affinity").on(t.storeId, t.fabricante, t.categoria),
    idxAffinityStore: index("idx_store_affinity_store").on(t.storeId),
    idxAffinityGroup: index("idx_store_affinity_group").on(t.groupId),
  })
);

export const storeAffinitiesRelations = relations(storeAffinities, ({ one }) => ({
  store: one(stores, { fields: [storeAffinities.storeId], references: [stores.id] }),
}));

// ── Fase 2: planos (template do grupo) ──────────────────────────────────────
// O grupo cria um plano com nome, descrição e preço padrão (obrigatório).
// O plano cobre VÁRIOS modelos, via a tabela de ligação plan_model.
// A loja depois instancia o plano (etapa seguinte), herdando ou ajustando preço.
export const plans = pgTable(
  "plan",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }),
    nome: text("nome").notNull(),
    descricao: text("descricao").notNull().default(""),
    // periodicidade fixa mensal no MVP; deixamos o campo para o futuro
    periodicidade: text("periodicidade").notNull().default("mensal"),

    // ── Política de aceitação e carência (definida pelo GRUPO) ──────────────
    // A carência é o período em que o cliente já paga mas ainda não pode usar.
    // Protege o modelo: sem ela, um seminovo já precisando de revisão assina
    // hoje e usa amanhã. Ver src/lib/carencia.ts.
    aceitaZeroKm: boolean("aceita_zero_km").notNull().default(true),
    // 0 = plano só para zero km; 99 = sem limite de idade
    idadeMaximaAnos: integer("idade_maxima_anos").notNull().default(99),
    // carência em MESES por faixa de idade do veículo
    carenciaZeroKm: integer("carencia_zero_km").notNull().default(0),
    carenciaAte2Anos: integer("carencia_ate_2_anos").notNull().default(0),
    carencia3a5Anos: integer("carencia_3_a_5_anos").notNull().default(0),
    carencia6Mais: integer("carencia_6_mais").notNull().default(0),

    // Acréscimo percentual por faixa de idade. O preço que a loja cadastra é o
    // do VEÍCULO NOVO; para seminovo o sistema soma este percentual. Usa as
    // mesmas faixas da carência, para o lojista não raciocinar duas vezes.
    acrescimoAte2Anos: numeric("acrescimo_ate_2_anos", { precision: 5, scale: 2 }).notNull().default("0"),
    acrescimo3a5Anos: numeric("acrescimo_3_a_5_anos", { precision: 5, scale: 2 }).notNull().default("0"),
    acrescimo6Mais: numeric("acrescimo_6_mais", { precision: 5, scale: 2 }).notNull().default("0"),

    // ── Tetos de utilização (todos opcionais e COMBINÁVEIS) ────────────────
    // NULL = sem limite naquela dimensão. Com mais de um preenchido, vale o
    // que for atingido PRIMEIRO.
    //
    // ATENÇÃO: hoje NÃO bloqueiam nada automaticamente — não existe registro
    // de utilização. Servem ao contrato, ao balcão e à calculadora.
    limiteRevisoesAno: integer("limite_revisoes_ano"),
    limiteValorPecasAno: numeric("limite_valor_pecas_ano", { precision: 10, scale: 2 }),
    limiteValorMaoObraAno: numeric("limite_valor_mao_obra_ano", { precision: 10, scale: 2 }),
    limiteValorTotalAno: numeric("limite_valor_total_ano", { precision: 10, scale: 2 }),
    limiteKmAno: integer("limite_km_ano"),
    // texto livre: linguagem de contrato, não entra em cálculo
    exclusoes: text("exclusoes").notNull().default(""),
    // Diferente de exclusões: não é o que o plano deixa de cobrir, é COMO a
    // cobertura funciona ("peça com nota fiscal", "a loja não responde por
    // peça trazida pelo cliente"). Vai para o contrato.
    condicoes: text("condicoes").notNull().default(""),
    // Preço central: o valor definido pelo grupo vale para todas as lojas, e
    // o plano já nasce vendável. Ver propagarPrecosDoGrupo() — o preço é
    // MATERIALIZADO em store_plan_price, então o resto do sistema não muda.
    precoPeloGrupo: boolean("preco_pelo_grupo").notNull().default(false),
    status: statusGeral("status").notNull().default("ativo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxPlanGroup: index("idx_plan_group").on(t.groupId),
  })
);

// Ligação plano ↔ modelo (N:N). Um plano cobre vários modelos; um modelo pode
// estar em vários planos. group_id desnormalizado para RLS.
export const planModels = pgTable(
  "plan_model",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    vehicleModelId: uuid("vehicle_model_id")
      .notNull()
      .references(() => vehicleModels.id, { onDelete: "restrict" }),
    // Piso de preço DAQUELE modelo dentro deste plano. Era um valor único no
    // plano, mas uma 160cc e uma 400cc no mesmo plano têm custos de manutenção
    // muito diferentes — o piso único ficava alto para uma e baixo para a outra.
    precoMinimo: numeric("preco_minimo", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    // Quanto este modelo custa para revisar EM RELAÇÃO ao modelo de referência
    // (fator 1,00), que é o custo cadastrado nas revisões do plano. Uma 400cc
    // com 1,40 custa 40% mais por revisão.
    //
    // Alternativa descartada: custo por modelo exigiria cadastrar cada revisão
    // para cada modelo — modelos × revisões de trabalho. O fator é um número
    // só, e é o raciocínio que o lojista já faz.
    fatorCusto: numeric("fator_custo", { precision: 5, scale: 2 })
      .notNull()
      .default("1.00"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqPlanModel: unique("uq_plan_model").on(t.planId, t.vehicleModelId),
    idxPlanModelPlan: index("idx_plan_model_plan").on(t.planId),
    idxPlanModelGroup: index("idx_plan_model_group").on(t.groupId),
  })
);

export const plansRelations = relations(plans, ({ one, many }) => ({
  group: one(groups, { fields: [plans.groupId], references: [groups.id] }),
  models: many(planModels),
}));

export const planModelsRelations = relations(planModels, ({ one }) => ({
  plan: one(plans, { fields: [planModels.planId], references: [plans.id] }),
  vehicleModel: one(vehicleModels, {
    fields: [planModels.vehicleModelId],
    references: [vehicleModels.id],
  }),
}));

// ── Fase 2: instanciação do plano pela loja ─────────────────────────────────
// A loja escolhe vender um plano do grupo (store_plan) e define o preço de
// cada modelo que quer vender (store_plan_price). Modelo sem preço = não vende.
// Cronograma de revisões que o plano cobre — o CONTEÚDO da obrigação.
// Antes o plano dizia o preço mas não dizia o que entregava, e não há como
// calcular preço seguro para algo indefinido.
//
// `km` é ACUMULADO no odômetro (1.000, 5.000, 10.000…), como na tabela de
// fábrica; `meses` conta da venda. Com os dois preenchidos vale O QUE VIER
// PRIMEIRO — padrão do setor, e é onde mora o risco: quem roda muito atinge
// o km antes do prazo e consome mais revisões pelo mesmo preço.
export const planRevisoes = pgTable(
  "plan_revisao",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),

    ordem: integer("ordem").notNull(),
    nome: text("nome").notNull().default(""),
    km: integer("km"),
    meses: integer("meses"),

    // marcados por revisão porque isso varia entre planos do mesmo grupo
    // recorrente = false → `km` é ACUMULADO ("a revisão dos 10.000 km")
    // recorrente = true  → `km` é INTERVALO ("a cada 10.000 km, enquanto pagar")
    // O caso real costuma ser misto: 1ª aos 1.000 km + a cada 5.000 depois.
    recorrente: boolean("recorrente").notNull().default(false),
    incluiPecas: boolean("inclui_pecas").notNull().default(true),
    incluiMaoObra: boolean("inclui_mao_obra").notNull().default(true),
    custoPecas: numeric("custo_pecas", { precision: 10, scale: 2 }).notNull().default("0"),
    custoMaoObra: numeric("custo_mao_obra", { precision: 10, scale: 2 }).notNull().default("0"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqOrdem: unique("uq_plan_revisao_ordem").on(t.planId, t.ordem),
    idxPlan: index("idx_plan_revisao_plan").on(t.planId),
    idxGroup: index("idx_plan_revisao_group").on(t.groupId),
  })
);

export const planRevisoesRelations = relations(planRevisoes, ({ one }) => ({
  plan: one(plans, {
    fields: [planRevisoes.planId],
    references: [plans.id],
  }),
}));

// Benefícios que não são revisão — o principal deles, mão de obra grátis em
// manutenções avulsas, é o que cria motivo de retorno FORA do calendário: o
// cliente volta para trocar um pneu e compra o pneu ali.
export const planBeneficios = pgTable(
  "plan_beneficio",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),

    ordem: integer("ordem").notNull(),
    nome: text("nome").notNull(),
    descricao: text("descricao").notNull().default(""),

    // Caminho "mão de obra": horas/ano × custo da hora. São os dois números
    // que o lojista realmente conhece — o custo-hora da oficina é dado dele.
    horasAno: numeric("horas_ano", { precision: 6, scale: 2 }),
    custoHora: numeric("custo_hora", { precision: 10, scale: 2 }),
    // O que entra na conta da carteira (da multiplicação ou digitado direto).
    custoAnoEstimado: numeric("custo_ano_estimado", { precision: 10, scale: 2 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqOrdem: unique("uq_plan_beneficio_ordem").on(t.planId, t.ordem),
    idxPlan: index("idx_plan_beneficio_plan").on(t.planId),
    idxGroup: index("idx_plan_beneficio_group").on(t.groupId),
  })
);

// Argumentos de venda — a peça COMERCIAL do plano, editável por grupo.
//
// Diferente da minuta, que é o contrato em linguagem jurídica. Aqui o texto é
// de balcão, e por isso mesmo precisa de cuidado: material de venda escrito
// pesa mais que o contrato numa disputa de consumo.
// Espelho local das cobranças da Asaas.
//
// O webhook já recebia cada evento e só usávamos para atualizar status. Sem
// guardar, toda pergunta sobre pagamento vira consulta ao vivo — e não existe
// histórico próprio para apurar comissão recorrente.
export const cobrancas = pgTable(
  "cobranca",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    asaasPaymentId: text("asaas_payment_id").notNull(),
    asaasSubscriptionId: text("asaas_subscription_id"),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "set null" }),
    storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),
    // Desnormalizado: a apuração consulta por vendedor e período, e o vendedor
    // da assinatura não muda depois da venda.
    vendedorId: uuid("vendedor_id").references(() => appUsers.id, { onDelete: "set null" }),
    valor: numeric("valor", { precision: 10, scale: 2 }),
    valorLiquido: numeric("valor_liquido", { precision: 10, scale: 2 }),
    meioPagamento: text("meio_pagamento"),
    status: text("status").notNull(),
    criadaEm: timestamp("criada_em", { withTimezone: true }),
    vencimento: date("vencimento"),
    /** Competência: quando o cliente pagou. */
    pagaEm: timestamp("paga_em", { withTimezone: true }),
    /** Caixa: quando o dinheiro fica disponível. */
    compensadaEm: timestamp("compensada_em", { withTimezone: true }),
    canceladaEm: timestamp("cancelada_em", { withTimezone: true }),
    atualizadaEm: timestamp("atualizada_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqAsaas: unique("uq_cobranca_asaas").on(t.asaasPaymentId),
    idxVendedor: index("idx_cobranca_vendedor_paga").on(t.vendedorId, t.pagaEm),
    idxGrupo: index("idx_cobranca_grupo_paga").on(t.groupId, t.pagaEm),
    idxCompensacao: index("idx_cobranca_compensacao").on(t.compensadaEm),
    idxSub: index("idx_cobranca_sub").on(t.subscriptionId),
  })
);

// Credenciais de integração — a API que os DMS consomem.
export const apiCredenciais = pgTable("api_credencial", {
  id: uuid("id").defaultRandom().primaryKey(),
  // NULL = credencial da Veilig, enxerga todos os grupos. Preenchido = só o
  // grupo dela, para o DMS de um grupo não consultar as placas de outro.
  groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  // Só o HASH, como fazemos com senha: vazamento do banco não entrega as
  // chaves ativas.
  chaveHash: text("chave_hash").notNull(),
  chavePrefixo: text("chave_prefixo").notNull(),
  ativa: boolean("ativa").notNull().default(true),
  criadaEm: timestamp("criada_em", { withTimezone: true }).notNull().defaultNow(),
  criadaPor: uuid("criada_por").references(() => appUsers.id, { onDelete: "set null" }),
  revogadaEm: timestamp("revogada_em", { withTimezone: true }),
  ultimoUso: timestamp("ultimo_uso", { withTimezone: true }),
  limiteHora: integer("limite_hora").notNull().default(600),
});

export const statusIsencao = pgEnum("status_isencao", ["pendente", "aprovada", "negada"]);

// Isenção de carência negociada.
//
// Caso real: o cliente acabou de pagar uma revisão e quer o plano. Cobrar
// carência dele é cobrar duas vezes pelo mesmo serviço.
//
// O vendedor solicita, o gestor aprova, e SÓ ENTÃO a venda acontece — já sem
// carência. Assim o contrato nasce correto e nunca precisa ser alterado depois,
// o que preservaria o congelamento.
export const isencoesCarencia = pgTable(
  "isencao_carencia",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "restrict" }),
    storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "restrict" }),
    // CPF e não customerId: o cliente pode nem existir quando a isenção é pedida.
    cpf: text("cpf").notNull(),
    vehicleModelId: uuid("vehicle_model_id").references(() => vehicleModels.id, { onDelete: "set null" }),
    planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
    motivo: text("motivo").notNull(),
    status: statusIsencao("status").notNull().default("pendente"),
    solicitadoPor: uuid("solicitado_por").references(() => appUsers.id, { onDelete: "set null" }),
    solicitadoEm: timestamp("solicitado_em", { withTimezone: true }).notNull().defaultNow(),
    decididoPor: uuid("decidido_por").references(() => appUsers.id, { onDelete: "set null" }),
    decididoEm: timestamp("decidido_em", { withTimezone: true }),
    observacao: text("observacao"),
    // Uso único: marcado quando a venda acontece.
    usadaEm: timestamp("usada_em", { withTimezone: true }),
    subscriptionId: uuid("subscription_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxStore: index("idx_isencao_store").on(t.storeId, t.status),
    idxGroup: index("idx_isencao_group").on(t.groupId, t.status),
    idxCpf: index("idx_isencao_cpf").on(t.cpf, t.status),
  })
);

export const planArgumentos = pgTable(
  "plan_argumento",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    ordem: integer("ordem").notNull(),
    titulo: text("titulo").notNull(),
    texto: text("texto").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqOrdem: unique("uq_plan_argumento_ordem").on(t.planId, t.ordem),
    idxPlan: index("idx_plan_argumento_plan").on(t.planId),
    idxGroup: index("idx_plan_argumento_group").on(t.groupId),
  })
);

export const storePlans = pgTable(
  "store_plan",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    status: statusGeral("status").notNull().default("ativo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqStorePlan: unique("uq_store_plan").on(t.storeId, t.planId),
    idxStorePlanStore: index("idx_store_plan_store").on(t.storeId),
    idxStorePlanGroup: index("idx_store_plan_group").on(t.groupId),
  })
);

// Preço de um modelo específico dentro do plano da loja.
export const storePlanPrices = pgTable(
  "store_plan_price",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }),
    storePlanId: uuid("store_plan_id")
      .notNull()
      .references(() => storePlans.id, { onDelete: "cascade" }),
    vehicleModelId: uuid("vehicle_model_id")
      .notNull()
      .references(() => vehicleModels.id, { onDelete: "restrict" }),
    preco: numeric("preco", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqStorePlanModel: unique("uq_store_plan_price").on(t.storePlanId, t.vehicleModelId),
    idxSppStorePlan: index("idx_spp_store_plan").on(t.storePlanId),
    idxSppGroup: index("idx_spp_group").on(t.groupId),
  })
);

export const storePlansRelations = relations(storePlans, ({ one, many }) => ({
  store: one(stores, { fields: [storePlans.storeId], references: [stores.id] }),
  plan: one(plans, { fields: [storePlans.planId], references: [plans.id] }),
  prices: many(storePlanPrices),
}));

export const storePlanPricesRelations = relations(storePlanPrices, ({ one }) => ({
  storePlan: one(storePlans, {
    fields: [storePlanPrices.storePlanId],
    references: [storePlans.id],
  }),
  vehicleModel: one(vehicleModels, {
    fields: [storePlanPrices.vehicleModelId],
    references: [vehicleModels.id],
  }),
}));

// ── Fase 2: assinatura (o contrato da venda) ────────────────────────────────
// Amarra cliente + veículo + plano, congela o preço contratado e registra o
// vendedor. O status entra na Fase 3 (dirigido pela Asaas via webhook).
// Regra: um veículo só pode ter UMA assinatura ativa por vez (índice parcial).
export const subscriptions = pgTable(
  "subscription",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    // preço congelado no momento da venda (não muda se o plano reajustar depois)
    precoContratado: numeric("preco_contratado", { precision: 10, scale: 2 }).notNull(),
    // rastro de COMO se chegou nesse preço: base do modelo + acréscimo da faixa.
    // Sem isso, ninguém consegue explicar ao cliente por que a mensalidade é
    // R$ 115 e não R$ 100.
    precoBase: numeric("preco_base", { precision: 10, scale: 2 }),
    acrescimoPercent: numeric("acrescimo_percent", { precision: 5, scale: 2 }),
    // vendedor que fez a venda (base da comissão). Nulo se criada por admin.
    vendedorId: uuid("vendedor_id").references(() => appUsers.id, { onDelete: "set null" }),
    // status: por ora 'ativa' ao criar; na Fase 3 a Asaas passa a ditar.
    status: text("status").notNull().default("ativa"),

    // ── Carência CONGELADA no ato da venda ─────────────────────────────────
    // Guardamos os cinco campos de propósito: a tela consegue explicar POR QUE
    // aquela data ("veículo de 4 anos → faixa 3 a 5 → 3 meses → 10/06/2026").
    // E se o grupo editar a carência do plano amanhã, quem já assinou não muda.
    // carenciaAte NULL = sem carência (inclui assinaturas anteriores a esta
    // funcionalidade, que ficam liberadas).
    veiculoZeroKm: boolean("veiculo_zero_km").notNull().default(false),
    veiculoIdadeAnos: integer("veiculo_idade_anos"),
    carenciaFaixa: text("carencia_faixa"), // zero_km | ate_2_anos | 3_a_5_anos | 6_mais
    carenciaMeses: integer("carencia_meses"),
    carenciaAte: date("carencia_ate"),

    // ── Aceite do contrato ─────────────────────────────────────────────────
    // No contrato de adesão o aceite É o pagamento da primeira mensalidade.
    // Gravados UMA VEZ pelo webhook (ver registrar_aceite_contrato) e nunca
    // mais alterados — um aceite cuja data pudesse mudar não provaria nada.
    aceitoEm: timestamp("aceito_em", { withTimezone: true }),

    // Data do cancelamento, carimbada por GATILHO no banco — existem dois
    // caminhos que cancelam (app e atualizar_status_assinatura), e o gatilho
    // cobre inclusive UPDATE manual no console.
    canceladaEm: timestamp("cancelada_em", { withTimezone: true }),
    aceitePaymentId: text("aceite_payment_id"),
    aceiteBillingType: text("aceite_billing_type"),

    // Valores do último pagamento compensado, vindos da Asaas.
    //
    // O split incide sobre o LÍQUIDO (netValue), não sobre o bruto — então a
    // taxa da Asaas sai antes da divisão e a receita real da Veilig é menor
    // que `preço × fee%`.
    ultimoValorBruto: numeric("ultimo_valor_bruto", { precision: 10, scale: 2 }),
    ultimoValorLiquido: numeric("ultimo_valor_liquido", { precision: 10, scale: 2 }),
    ultimoMeioPagamento: text("ultimo_meio_pagamento"),

    // ── Contrato ───────────────────────────────────────────────────────────
    // Conteúdo do plano CONGELADO na venda. Sem isto, um contrato de 2026
    // aberto em 2028 mostraria o plano de 2028 — revisões que o cliente nunca
    // contratou. Mesma razão de preço e carência serem congelados.
    planoSnapshot: jsonb("plano_snapshot"),
    // Número legível: um UUID no cabeçalho de um contrato é impossível de ler
    // ao telefone ou no balcão.
    contratoNumero: text("contrato_numero"),
    contratoVersao: text("contrato_versao").notNull().default("v1"),

    // O contrato RENDERIZADO na venda — o documento que o cliente aceitou.
    //
    // O snapshot congela o conteúdo do plano; isto congela as CLÁUSULAS. Sem
    // ele, alterar o contrato faz um documento assinado antes exibir texto que
    // aquele cliente nunca aceitou.
    //
    // NUNCA recalcular: o valor probatório vem justamente de não depender do
    // código de hoje.
    contratoHtml: text("contrato_html"),

    // Carência dispensada por aprovação do gestor. O motivo vai para o
    // contrato: é o registro de que houve negociação, não erro de cadastro.
    // Quem cancelou. Cancelamento por inadimplência e por vontade do cliente
    // são fenômenos diferentes — o primeiro é problema de cobrança, o segundo
    // de produto ou de venda. Somá-los num "churn" esconde os dois.
    cancelamentoOrigem: text("cancelamento_origem"),
    cancelamentoPor: uuid("cancelamento_por"),

    // A migração do reajuste criou a coluna no banco, mas ela nunca entrou no
    // schema — sem isto a transferência não consegue herdar o aniversário.
    ultimoReajusteEm: date("ultimo_reajuste_em"),

    // Transferência para o novo proprietário do veículo. A anterior fica com
    // cancelamento_origem = 'transferencia', para não contar como churn.
    transferidaDe: uuid("transferida_de"),
    transferidaEm: timestamp("transferida_em", { withTimezone: true }),
    transferidaPor: uuid("transferida_por"),

    // Cliente vindo de plano anterior da concessionária, com preço preservado.
    migrada: boolean("migrada").notNull().default(false),
    migradaObservacao: text("migrada_observacao"),

    carenciaIsenta: boolean("carencia_isenta").notNull().default(false),
    carenciaIsencaoId: uuid("carencia_isencao_id"),
    carenciaIsencaoMotivo: text("carencia_isencao_motivo"),
    // integração Asaas (preenchidos quando a cobrança é criada lá)
    asaasSubscriptionId: text("asaas_subscription_id"),
    asaasLinkPagamento: text("asaas_link_pagamento"), // link p/ o cliente pagar (reenviável)
    asaasSyncStatus: text("asaas_sync_status").notNull().default("pendente"), // pendente|sincronizada|erro
    asaasSyncErro: text("asaas_sync_erro"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxSubStore: index("idx_sub_store").on(t.storeId),
    idxSubGroup: index("idx_sub_group").on(t.groupId),
    idxSubCustomer: index("idx_sub_customer").on(t.customerId),
    idxSubVendedor: index("idx_sub_vendedor").on(t.vendedorId),
    idxSubCarenciaAte: index("idx_sub_carencia_ate").on(t.carenciaAte),
    // Um veículo só pode ter UMA assinatura VIGENTE (índice único parcial).
    // Cuidado histórico: antes a condição era `status = 'ativa'`. Como a
    // assinatura vira 'paga' no primeiro webhook, o índice deixava de valer e
    // o mesmo veículo podia receber uma segunda assinatura — duas cobranças
    // recorrentes rodando em paralelo. 'vigente' = tudo que não está cancelado.
    uqVehicleVigente: uniqueIndex("uq_sub_vehicle_vigente")
      .on(t.vehicleId)
      .where(sql`status <> 'cancelada'`),
  })
);

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  customer: one(customers, { fields: [subscriptions.customerId], references: [customers.id] }),
  vehicle: one(vehicles, { fields: [subscriptions.vehicleId], references: [vehicles.id] }),
  plan: one(plans, { fields: [subscriptions.planId], references: [plans.id] }),
  vendedor: one(appUsers, { fields: [subscriptions.vendedorId], references: [appUsers.id] }),
}));

// ── Fase 3: eventos de webhook do Asaas (idempotência) ──────────────────────
// Registra cada evento processado para não reprocessar o mesmo aviso.
// Passagem do cliente pela loja — um contador de visitas.
//
// Deliberadamente simples: sem km, sem custo, sem vínculo com teto. O registro
// completo de utilização só faz sentido quando o pós-venda estiver desenhado
// dentro da concessionária; antes disso viraria formulário em branco.
//
// O dado que interessa agora é a FREQUÊNCIA — quantas vezes o cliente com
// plano voltou à loja. É o começo da prova de que o plano retém.
export const passagensLoja = pgTable(
  "passagem_loja",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    // Vinculada à ASSINATURA, não ao cliente: o mesmo CPF pode ter dois
    // veículos com planos diferentes, e "quantas vezes voltou" é por veículo.
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    // Quem registrou: se ninguém clicar, o problema é adoção, e é melhor
    // descobrir por dado do que por suposição.
    registradoPor: uuid("registrado_por").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    observacao: text("observacao").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxSub: index("idx_passagem_subscription").on(t.subscriptionId, t.createdAt),
    idxGroup: index("idx_passagem_group").on(t.groupId),
    idxStore: index("idx_passagem_store").on(t.storeId, t.createdAt),
  })
);

export const webhookEvents = pgTable("webhook_event", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: text("event_id").notNull().unique(), // id do evento no Asaas
  evento: text("evento").notNull(), // ex.: PAYMENT_CONFIRMED
  asaasSubscriptionId: text("asaas_subscription_id"),
  novoStatus: text("novo_status"),
  processadoEm: timestamp("processado_em", { withTimezone: true }).notNull().defaultNow(),
});

// ── Fase 3: acesso do cliente final (dono do veículo) ───────────────────────
// Circuito de login SEPARADO dos funcionários (app_user), por segurança.
// Liga-se ao person (global por CPF). Senha provisória gerada na venda.
export const customerAuth = pgTable(
  "customer_auth",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    cpf: text("cpf").notNull(), // identificador de login
    senhaHash: text("senha_hash").notNull(),
    precisaTrocarSenha: boolean("precisa_trocar_senha").notNull().default(true),
    status: text("status").notNull().default("ativo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqCustomerAuthCpf: unique("uq_customer_auth_cpf").on(t.cpf),
    uqCustomerAuthPerson: unique("uq_customer_auth_person").on(t.personId),
  })
);
