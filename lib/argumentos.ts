/**
 * Kit de conversa comercial — baseado no estudo "Indicadores de recorrência Veilig"
 * (projeto: claude/INDICADORES-RECORRENCIA.md, 30/09/2026).
 *
 * Fonte a citar: "Dados de uma rede de concessionárias de motos com 3 lojas, cliente Veilig,
 * em 16 meses de operação (mai/2025 a set/2026)." Nunca citar nome, cidade ou marca do cliente.
 *
 * Marcadores: [Nome] e [Grupo] vêm do lead; [Eu] é quem está usando o CRM.
 * Outros marcadores entre colchetes ficam em destaque para você completar antes de enviar.
 */

export type Segmento = "motos" | "outros";

export const FONTE = "Rede de concessionárias de motos, cliente Veilig · 16 meses de operação (mai/2025 a set/2026) · mais de 20 mil ordens de serviço";

export type Etapa = { rotulo: string; texto: string };

export const PITCH: Record<Segmento, Etapa[]> = {
  motos: [
    { rotulo: "Abertura", texto: "[Nome], aqui é [Eu], da Veilig. A gente trabalha com o pós-venda de concessionárias. Posso tomar 30 segundos seus?" },
    { rotulo: "Pergunta", texto: "Nas concessionárias que chegam até a gente, é comum ver perda de 40% a 55% dos clientes já na 2ª revisão, e mais da metade do que sobra na 3ª. Isso também acontece aí na [Grupo]?" },
    { rotulo: "Dado", texto: "Acompanhamos 16 meses de uma rede de concessionárias de motos que usa a Veilig, mais de 20 mil ordens de serviço. Entre os clientes com plano de manutenção, 98% voltaram para a 2ª revisão; sem plano, 74%. E não para aí: depois de um ano de casa, o cliente com plano tinha passado 6,8 vezes pela oficina, contra 3,3 de quem não tem plano." },
    { rotulo: "Convite", texto: "Posso te mostrar em 20 minutos como isso funcionaria na [Grupo]? Tenho [dia] às [hora] ou [dia] às [hora]. Qual fica melhor?" },
  ],
  outros: [
    { rotulo: "Abertura", texto: "[Nome], aqui é [Eu], da Veilig. A gente trabalha com o pós-venda de concessionárias. Posso tomar 30 segundos seus?" },
    { rotulo: "Pergunta", texto: "Nas concessionárias que chegam até a gente, é comum ver perda de 40% a 55% dos clientes já na 2ª revisão, e mais da metade do que sobra na 3ª. Isso também acontece aí na [Grupo]?" },
    { rotulo: "Dado", texto: "O caso em que temos mais dados é o de uma rede de concessionárias de motos que usa a Veilig: em 16 meses, quase todos os clientes com plano de manutenção voltaram para a 2ª revisão e, depois de um ano de casa, tinham passado o dobro de vezes pela oficina. Em carros a lógica do pós-venda é a mesma: o cliente some depois das primeiras revisões. A ideia é medir a curva de vocês e ver o tamanho dessa oportunidade." },
    { rotulo: "Convite", texto: "Posso te mostrar em 20 minutos como isso funcionaria na [Grupo]? Tenho [dia] às [hora] ou [dia] às [hora]. Qual fica melhor?" },
  ],
};

/** Depois da pergunta: o que dizer conforme a resposta, antes de entrar no dado. */
export const PITCH_RESPOSTAS: Etapa[] = [
  { rotulo: "Se disser que sim", texto: "É o padrão que a gente encontra, e é justamente o ponto que o plano de manutenção resolve. Deixa eu te contar o que aconteceu em um cliente nosso." },
  { rotulo: "Se não souber o número", texto: "É o mais comum: pouca concessionária mede isso por revisão. Na conversa de 20 minutos a gente estima juntos com os números de vocês. Só para te dar uma referência do que muda com o plano:" },
  { rotulo: "Se disser que perde menos", texto: "Ótimo, então vocês já estão acima do que a gente costuma ver. O plano ajuda a manter esse cliente nas revisões seguintes, que é onde a perda continua. Olha o que vimos em um cliente nosso:" },
];

export const PITCH_APOIO: Etapa[] = [
  { rotulo: "Se perguntarem o que é a Veilig", texto: "É uma plataforma para a concessionária vender planos de manutenção com mensalidade: o cliente paga todo mês, a concessionária recebe todo mês e o cliente volta para a oficina. A cobrança e o repasse para a conta da loja são automáticos." },
  { rotulo: "Se não puder falar agora", texto: "Sem problema. Posso te mandar um resumo de três linhas pelo WhatsApp e a gente retoma no melhor horário para você?" },
  { rotulo: "Se pedir para mandar por e-mail", texto: "Mando, sim. Para não virar mais um e-mail parado, já deixamos 20 minutos marcados? Se depois de ler não fizer sentido, é só cancelar." },
];

export const PERGUNTAS = [
  "De cada 4 clientes que fazem a 1ª revisão, quantos voltam para a 2ª?",
  "Quantas vezes, em média, um cliente passa pela oficina no primeiro ano?",
  "Quanto do movimento da oficina vem de clientes que já são da casa?",
  "Vocês vendem algum plano ou pacote de revisões hoje? Como é cobrado e acompanhado?",
  "Quantos veículos novos cada loja entrega por mês?",
  "Quem decide sobre o pós-venda no grupo: diretoria, gerente de pós-venda ou os dois?",
];

export type Indicador = { n: number; numero: string; titulo: string; comparacao?: string; base: string; frase: string; so_motos?: boolean };

export const INDICADORES: Indicador[] = [
  { n: 1, numero: "98%", titulo: "dos clientes com plano voltaram para a 2ª revisão", comparacao: "Sem plano: 74%", base: "44 de 45 motos com plano", frase: "O momento em que a concessionária mais perde cliente é a 2ª revisão. Com o plano, praticamente ninguém deixou de voltar." },
  { n: 9, numero: "6,8 × 3,3", titulo: "passagens na oficina por moto depois de 12 meses de casa", comparacao: "Com plano × sem plano, mesmo tempo de casa (12 a 17 meses)", base: "46 motos com plano e 1.790 sem plano", frase: "A fidelização não para na 2ª revisão. Depois de um ano, o cliente com plano continua voltando: passou mais que o dobro de vezes pela oficina." },
  { n: 2, numero: "5,0 × 2,4", titulo: "passagens na oficina por moto, com e sem plano", comparacao: "Diferença de 2,1x a 2,3x a partir do 6º mês, no mesmo tempo de casa", base: "4.767 motos acompanhadas", frase: "Cada cliente com plano rende o dobro de visitas à oficina. É receita de pós-venda que se repete todo mês." },
  { n: 3, numero: "2,2x", titulo: "mais serviços avulsos por cliente com plano", comparacao: "1,8 contra 0,8 por moto", base: "Peças, óleo e acessórios fora do plano", frase: "O plano não troca a receita da oficina por mensalidade. Quem tem plano compra mais que o dobro de serviços avulsos." },
  { n: 4, numero: "67%", titulo: "dos clientes com plano fizeram 3 passagens ou mais", comparacao: "Sem plano: 36%", base: "16 meses de operação", frase: "O plano transforma o comprador em cliente frequente: 2 em cada 3 clientes com plano voltaram 3 vezes ou mais, o dobro de quem não tem plano." },
  { n: 5, numero: "75%", titulo: "voltaram da 1ª para a 2ª revisão (toda a base)", base: "Coorte de 1.433 motos", frase: "Com agendamento, lembretes e acompanhamento, 3 em cada 4 clientes voltaram para a 2ª revisão." },
  { n: 6, numero: "81%", titulo: "voltaram para algum serviço depois da 1ª revisão", base: "Toda a base atendida com a plataforma", frase: "A primeira revisão é a porta de entrada. Oito em cada dez clientes voltaram." },
  { n: 7, numero: "74%", titulo: "dos atendimentos vieram de clientes recorrentes", comparacao: "6.442 passagens recorrentes em 12 meses", base: "Setembro de 2026", frase: "Três em cada quatro atendimentos da oficina vêm de clientes que já são da casa." },
  { n: 8, numero: "+65%", titulo: "ordens de serviço no mesmo trimestre, um ano depois", comparacao: "1.639 (jun–ago/2025) → 2.700 (jun–ago/2026)", base: "Efeito da operação inteira, não só do plano", frase: "Em um ano com a plataforma, a oficina fez 65% mais ordens de serviço no mesmo período." },
];

export type Mensagem = { id: string; titulo: string; quando: string; texto: string };

export const WHATSAPP: Mensagem[] = [
  { id: "primeiro-pergunta", titulo: "Primeiro contato: a pergunta", quando: "Lead que ainda não conversou com a gente",
    texto: "Olá, [Nome]! Aqui é [Eu], da Veilig. Uma pergunta direta: de cada 4 clientes que fazem a 1ª revisão na [Grupo], quantos voltam para a 2ª?\n\nEm uma rede de concessionárias de motos que usa a Veilig, foram 3 em cada 4, acompanhando mais de 1.400 motos. Se o número de vocês for menor, a diferença é receita de oficina que hoje fica na rua.\n\nPosso te mostrar em 20 minutos como medimos isso?" },
  { id: "primeiro-98", titulo: "Primeiro contato: o dado do plano", quando: "Lead que já conhece o conceito de plano de manutenção",
    texto: "Olá, [Nome]! Aqui é [Eu], da Veilig. Em uma rede de concessionárias de motos que usa a Veilig, 98% dos clientes com plano de manutenção voltaram para a 2ª revisão. Sem plano, foram 74%. E eles continuam voltando: depois de um ano, o cliente com plano tinha passado mais que o dobro de vezes pela oficina.\n\nHoje vocês sabem quantos clientes da [Grupo] voltam para a 2ª revisão? Posso te mostrar como medimos isso em 20 minutos." },
  { id: "pos-simulacao", titulo: "Depois da simulação no site", quando: "Lead que veio pelo simulador",
    texto: "Olá, [Nome]! Aqui é [Eu], da Veilig. Recebi a simulação que você fez no nosso site. Um dado que ajuda a ler aqueles números: em uma rede de concessionárias de motos que usa a Veilig, o cliente com plano passou o dobro de vezes pela oficina e comprou 2,2 vezes mais serviços avulsos.\n\nPosso te mostrar como chegamos na simulação e como ficariam os planos para a [Grupo]? Qual o melhor horário?" },
  { id: "retomada", titulo: "Retomada sem resposta", quando: "Lead que parou de responder",
    texto: "[Nome], um dado da nossa operação: em uma rede de concessionárias de motos, o cliente com plano de manutenção passou 5 vezes pela oficina em média. O cliente sem plano, 2,4. Mesmo tempo de casa, o dobro de visitas.\n\nVale uma conversa rápida para estimar esse efeito na [Grupo]?" },
  { id: "frequencia", titulo: "Cliente frequente", quando: "Reforço em cadência ou follow-up",
    texto: "[Nome], em 16 meses de operação de uma rede que usa a Veilig, 2 em cada 3 clientes com plano de manutenção passaram pela oficina 3 vezes ou mais. Sem plano, foi 1 em cada 3.\n\nQuer ver como estruturamos esse plano para a [Grupo], sem mudar a operação de vocês?" },
  { id: "fidelizacao", titulo: "Fidelização além da 2ª revisão", quando: "Lead que pergunta se o cliente some depois",
    texto: "[Nome], uma dúvida comum é se o cliente com plano volta só na 2ª revisão e depois some. Nos nossos dados, não: em uma rede de concessionárias de motos que usa a Veilig, 2 em cada 3 clientes com plano passaram pela oficina 3 vezes ou mais (sem plano, 1 em cada 3). Depois de um ano de casa, foram 6,8 passagens por cliente com plano, contra 3,3 sem plano.\n\nPosso te mostrar como isso funcionaria na [Grupo]?" },
  { id: "recorrentes", titulo: "Base recorrente", quando: "Conversa com dono ou financeiro",
    texto: "[Nome], quanto do movimento da oficina da [Grupo] hoje vem de clientes que voltam? Em uma rede que usa a Veilig, 74% dos atendimentos do último mês foram de clientes recorrentes.\n\nOficina com base recorrente tem receita previsível. Posso te mostrar como chegamos lá?" },
  { id: "resultado-65", titulo: "Resultado da operação", quando: "Lead que pede resultado concreto",
    texto: "[Nome], um resultado de cliente: em um ano usando a Veilig, uma rede de concessionárias de motos fez 65% mais ordens de serviço na oficina, comparando o mesmo trimestre. Foi o efeito da operação inteira: agendamento, lembretes e os planos.\n\nQuer entender o que mudou na operação deles?" },
  { id: "pos-reuniao", titulo: "Depois da reunião", quando: "Mesmo dia da conversa",
    texto: "[Nome], obrigado pela conversa de hoje. Como combinamos, o próximo passo é [próximo passo] até [data].\n\nPara deixar registrado o dado que comentei: em uma rede de concessionárias de motos que usa a Veilig, clientes com plano passaram o dobro de vezes pela oficina (5,0 contra 2,4) e 98% voltaram para a 2ª revisão. Qualquer dúvida, estou por aqui." },
  { id: "pos-proposta", titulo: "Acompanhar a proposta", quando: "2 a 3 dias depois do envio",
    texto: "[Nome], conseguiu olhar a proposta que enviei para a [Grupo]? Se ajudar, passo por ela com você em 15 minutos, principalmente a parte de retorno estimado. Tem um horário amanhã?" },
];

export type Objecao = { objecao: string; resposta: string; dado?: string };

export const OBJECOES: Objecao[] = [
  { objecao: "\"O plano vai canibalizar a oficina.\"", dado: "2,2x mais serviços avulsos",
    resposta: "É uma dúvida comum, e nos dados acontece o contrário: o cliente com plano comprou 2,2 vezes mais serviços avulsos (peças, óleo, acessórios) do que o cliente sem plano. O plano traz o cliente para dentro da loja, e ele compra mais enquanto está lá." },
  { objecao: "\"O cliente não vai querer pagar mensalidade.\"", dado: "98% × 74% na 2ª revisão",
    resposta: "Nem todo cliente vai querer, e nem precisa. Na base Veilig a adesão fica entre 6% e 10% das vendas, conforme o valor da mensalidade. E quem adere volta e continua voltando: 98% dos clientes com plano fizeram a 2ª revisão na loja e, depois de um ano, tinham passado mais que o dobro de vezes pela oficina. O plano é oferecido na entrega do veículo, quando o cliente já está decidindo pela concessionária." },
  { objecao: "\"Já vendemos pacote de revisões.\"",
    resposta: "Ótimo, então o cliente de vocês já entende a ideia. A diferença é que o pacote pago à vista antecipa a receita e acaba; o plano vira mensalidade, com cobrança automática, repasse na conta da loja e o acompanhamento de quem está voltando ou não. Uma pergunta: hoje vocês sabem quantos clientes do pacote deixaram de voltar?" },
  { objecao: "\"Não temos tempo ou time para implantar.\"",
    resposta: "A Veilig faz a parametrização. No onboarding online são cerca de 3 semanas até a primeira venda, com sessões curtas por vídeo. Para grupos com várias lojas, o consultivo leva cerca de 6 semanas, com o nosso time junto na operação." },
  { objecao: "\"Isso é seguro ou garantia estendida?\"",
    resposta: "Não. O plano cobre a manutenção programada que a própria concessionária define: revisões, itens e limites. Não cobre defeitos, falhas ou sinistros. Por isso não depende de seguradora e a receita fica com a concessionária." },
  { objecao: "\"Quanto custa?\"",
    resposta: "Depende do número de lojas e do pacote: é um valor mensal por loja mais uma taxa de sucesso sobre o que a concessionária recebe dos clientes. Na conversa de 20 minutos eu simulo com os números de vocês, e o retorno estimado aparece junto com o custo." },
  { objecao: "\"Esses dados são de motos, a gente vende carros.\"",
    resposta: "É verdade, é o caso com mais dados hoje, e não vou projetar os percentuais de motos para carros. Mas o problema é o mesmo: o cliente some depois das primeiras revisões. A proposta é medir a curva de vocês e começar por um piloto, para que a decisão seja com os números da própria operação." },
  { objecao: "\"Manda por e-mail que eu vejo.\"",
    resposta: "Mando, sim. Para não virar mais um e-mail parado, já deixamos 20 minutos marcados? Se depois de ler não fizer sentido, é só cancelar." },
];

export const PODE = [
  "\"Clientes com plano voltam o dobro à oficina.\"",
  "\"A fidelização continua depois da 2ª revisão: 6,8 passagens contra 3,3 depois de um ano.\"",
  "\"Em uma rede de concessionárias de motos, cliente Veilig.\"",
  "\"16 meses de dados, mais de 20 mil ordens de serviço.\"",
  "Perguntar o número do lead antes de mostrar o nosso.",
  "Para leads de carros: \"resultado em concessionárias de motos\".",
];

export const EVITE = [
  "\"O plano dobra o retorno\": parte da diferença vem do perfil de quem contrata o plano.",
  "\"100%\" no dado da 2ª revisão: são 44 de 45.",
  "\"O mercado perde 50%\": diga \"nas concessionárias que chegam até a gente\". É o que vemos antes dos planos, não um dado de mercado.",
  "Atribuir os +65% de OS só ao plano: é efeito da operação inteira.",
  "Valores em R$ tirados do estudo: ele não tem o faturamento das OS.",
  "Qualquer detalhe que identifique o cliente: nome, cidade, marca ou número de lojas com a região.",
  "Projetar os percentuais de motos para carros.",
  "Usar a curva revisão a revisão da base toda (64%, 60%…) como se fosse de clientes com plano: ela não separa quem tem plano.",
];
