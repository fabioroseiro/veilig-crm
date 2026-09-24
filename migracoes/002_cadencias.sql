-- CRM Veilig — Entrega 2: cadência de e-mail (Frio) pelo Zoho
-- Rodar UMA vez no SQL Editor do Neon, depois da 001.

BEGIN;

-- Textos dos e-mails. Só modelo aprovado é enviado.
CREATE TABLE modelo_email (
  chave          text PRIMARY KEY,           -- ex.: frio_1, frio_encerramento
  nome           text NOT NULL,
  assunto        text NOT NULL,
  corpo          text NOT NULL,
  aprovado       boolean NOT NULL DEFAULT false,
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

-- Uma cadência por lead. O plano de toques (dias e canais) vive no código (lib/plano.ts).
CREATE TABLE cadencia (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id      uuid NOT NULL REFERENCES grupo(id) ON DELETE CASCADE,
  tipo          text NOT NULL DEFAULT 'frio',
  ciclo         smallint NOT NULL DEFAULT 1,
  porte         char(1) NOT NULL,
  passo         smallint NOT NULL DEFAULT 0,  -- índice do próximo toque no plano
  proximo_em    date,
  status        text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','pausa','concluida','parada')),
  retomar_em    date,
  motivo        text,
  iniciada_por  uuid REFERENCES usuario(id),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
-- No máximo uma cadência viva (ativa ou em pausa) por lead.
CREATE UNIQUE INDEX cadencia_viva ON cadencia (grupo_id) WHERE status IN ('ativa','pausa');
CREATE INDEX cadencia_proximo ON cadencia (status, proximo_em);

-- Cada e-mail: entra na fila, é enviado (ou falha, ou volta).
CREATE TABLE envio (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cadencia_id   uuid REFERENCES cadencia(id) ON DELETE SET NULL,
  grupo_id      uuid NOT NULL REFERENCES grupo(id) ON DELETE CASCADE,
  contato_id    uuid REFERENCES contato(id) ON DELETE SET NULL,
  chave         text NOT NULL,
  toque         smallint,
  para          text NOT NULL,
  assunto       text NOT NULL,
  corpo         text NOT NULL,
  status        text NOT NULL DEFAULT 'fila' CHECK (status IN ('fila','enviado','erro','devolvido','cancelado','simulado')),
  erro          text,
  message_id    text,
  em_resposta_a text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  enviado_em    timestamptz
);
CREATE INDEX envio_fila ON envio (status, criado_em);
CREATE INDEX envio_grupo ON envio (grupo_id, criado_em DESC);
CREATE INDEX envio_para ON envio (lower(para));

-- Até onde a caixa do Zoho já foi lida (para não processar a mesma resposta duas vezes).
CREATE TABLE caixa_estado (
  caixa        text PRIMARY KEY,
  uidvalidity  bigint,
  ultimo_uid   bigint NOT NULL DEFAULT 0,
  lido_em      timestamptz
);

INSERT INTO config (chave, valor) VALUES
  ('envio_ativo', 'false'),
  ('limite_diario', '15'),
  ('remetente', '{"email": "natalia@vendas.veilig.com.br", "nome": "Natália Artale"}')
ON CONFLICT (chave) DO NOTHING;

-- Textos aprovados em 24/09/2026.
INSERT INTO modelo_email (chave, nome, assunto, corpo, aprovado) VALUES
('frio_1', 'Frio · toque 1 · dia 0', 'Pós-venda da [Grupo]: receita que volta todo mês',
'Olá, [Nome]. Sou a Natália, da Veilig.

Chegamos até vocês por meio de conversas na [Origem] sobre a rede de concessionárias.

Boa parte dos clientes que compram na concessionária deixa de voltar depois das primeiras revisões. A Veilig permite que a própria concessionária venda planos de manutenção com mensalidade fixa: o cliente volta à oficina, e a loja recebe todo mês, antes de o serviço acontecer.

Em 20 minutos, calculo com os números da [Grupo] quanto isso representaria. Se preferir ver antes por conta própria, o simulador está em veilig.com.br/simulador.', true),
('frio_1_ciclo2', 'Frio · toque 1 · segundo ciclo', 'Retomando nossa conversa',
'Olá, [Nome]. Faz alguns meses desde o nosso último contato.

Retomo porque o cenário de pós-venda costuma mudar de um semestre para o outro, e talvez agora faça mais sentido olhar para os planos de manutenção na [Grupo].

Em 20 minutos, calculo com os números da [Grupo] quanto isso representaria. Se preferir ver antes por conta própria, o simulador está em veilig.com.br/simulador.', true),
('frio_2', 'Frio · toque 2 · dia +5 (resposta ao toque 1)', '(mesmo assunto do toque 1)',
'Olá, [Nome].

Retomo a mensagem anterior com uma sugestão prática: o simulador da Veilig calcula, com os números da [Grupo], quanto da receita de revisões hoje fica fora da concessionária e quanto um plano de manutenção pode trazer de volta. Leva menos de um minuto: veilig.com.br/simulador

Se preferir, fazemos juntos em 20 minutos. É só responder com o melhor dia.', true),
('frio_3', 'Frio · toque 3 · dia +10', 'O cliente que comprou com vocês e faz a revisão em outro lugar',
'Olá, [Nome].

Depois das primeiras revisões, parte dos clientes passa a levar o veículo para oficinas independentes ou para outra concessionária. Com o plano de manutenção, o cliente paga uma mensalidade fixa e já tem as revisões e os serviços contratados com a sua loja. O motivo para voltar passa a estar no orçamento dele todo mês.

Vale uma conversa de 20 minutos para ver como isso ficaria na [Grupo]?', true),
('frio_5', 'Frio · toque 5 · dia +16', 'Como funciona na prática, sem integração com o seu sistema',
'Olá, [Nome].

Deixo aqui um resumo de como os planos funcionam: a concessionária monta os planos, o vendedor oferece na entrega do veículo, o cliente paga todo mês por cartão, boleto ou Pix, e a parte da loja cai direto na conta dela. Para começar, não é preciso integrar com o sistema da concessionária.

O passo a passo está em veilig.com.br/como-funciona, e há exemplos de planos para o seu segmento em [Link dos planos].

Fico à disposição.', true),
('frio_8', 'Frio · toque 8 · dia +35', 'Números da sua operação, não média de mercado',
'Olá, [Nome].

Sei que propostas de novas ferramentas chegam com frequência. O que muda aqui é o ponto de partida: a simulação usa o número de lojas, as vendas e o ticket de revisão da [Grupo], e não uma média de mercado. Você vê quanto fica na rua hoje, qual mensalidade faz sentido e em quanto tempo o investimento se paga, antes de decidir qualquer coisa.

Posso preparar essa simulação para vocês?', true),
('frio_10', 'Frio · toque 10 · dia +45', 'Uma forma de testar com risco controlado',
'Olá, [Nome].

Para quem prefere ver funcionando antes de decidir, a Veilig trabalha com um piloto controlado: escopo pequeno, poucas lojas, prazo definido e resultados acompanhados junto com vocês. A decisão de ampliar vem depois, com os números da própria operação.

Quer entender como seria o piloto na [Grupo]?', true),
('frio_12', 'Frio · toque 12 · dia +60', 'O essencial em 2 minutos',
'Olá, [Nome].

Reuni o essencial sobre os planos de manutenção recorrente numa página: o que a concessionária ganha, como funciona no dia a dia e como começar. A leitura leva uns 2 minutos: veilig.com.br/como-funciona', true),
('frio_13', 'Frio · toque 13 · dia +70', 'Ainda faz sentido para vocês?',
'Olá, [Nome].

Vou ser direta: ainda faz sentido eu seguir em contato sobre os planos de manutenção, ou prefere que eu pause por aqui? Uma resposta curta já me ajuda, inclusive um "agora não".', true),
('frio_14', 'Frio · toque 14 · dia +80', 'Antes de pausar',
'Olá, [Nome].

Este deve ser um dos meus últimos contatos antes de pausar por um tempo. Se em algum momento quiser retomar a conversa, é só responder esta mensagem.', true),
('frio_encerramento', 'Frio · encerramento (toque 15 no A, 11 no B, 8 no C)', 'Fico à disposição',
'Olá, [Nome].

Vou pausar o contato por aqui, mas a Veilig segue à disposição caso o cenário mude para a [Grupo]. Se quiser retomar, basta responder esta mensagem. O simulador continua disponível em veilig.com.br/simulador.

Obrigada pela atenção até aqui.', true);

COMMIT;
