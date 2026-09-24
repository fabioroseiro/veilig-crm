-- CRM Veilig — estrutura inicial (Entrega 1)
-- Rodar UMA vez no banco novo do Neon (projeto veilig-crm), pelo SQL Editor.

BEGIN;

CREATE TABLE usuario (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          text NOT NULL,
  email         text NOT NULL UNIQUE,
  senha_hash    text NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

-- Falhas de login: 5 em 15 minutos bloqueiam a conta (no banco, não em memória).
CREATE TABLE login_falha (
  id     bigserial PRIMARY KEY,
  email  text NOT NULL,
  em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_falha_email_em ON login_falha (email, em);

CREATE TABLE importacao (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arquivo     text,
  modelo      text NOT NULL,
  grupos      int NOT NULL DEFAULT 0,
  usuario_id  uuid REFERENCES usuario(id),
  em          timestamptz NOT NULL DEFAULT now()
);

-- O grupo é o que anda no funil (um lead = um grupo/concessionária).
CREATE TABLE grupo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL,
  tipo            text NOT NULL DEFAULT 'Concessionária',
  origem          text,             -- aparece nas mensagens (ex.: Fenabrave)
  origem_interna  text,             -- só interno (ex.: Fabricante)
  segmento        text,             -- motos | leves | pesados | agricolas | outro
  marcas          text,
  num_lojas       int NOT NULL DEFAULT 1 CHECK (num_lojas >= 1),
  entregas_mes    int,
  etapa           smallint NOT NULL DEFAULT 1 CHECK (etapa BETWEEN 1 AND 7),
  situacao        text NOT NULL DEFAULT 'ativo' CHECK (situacao IN ('ativo','pausado','perdido')),
  pausado_ate     date,
  perdido_motivo  text,
  temperatura     text NOT NULL DEFAULT 'frio' CHECK (temperatura IN ('quente','morno','frio','oscilante')),
  estrategico     boolean NOT NULL DEFAULT false,
  responsavel_id  uuid REFERENCES usuario(id),
  pacote          text NOT NULL DEFAULT 'essencial' CHECK (pacote IN ('essencial','performance','completo')),
  ultimo_sinal    timestamptz,      -- última vez que o lead deu sinal de vida
  diagnostico     jsonb NOT NULL DEFAULT '{}'::jsonb,
  observacoes     text,
  importacao_id   uuid REFERENCES importacao(id),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX grupo_situacao_etapa ON grupo (situacao, etapa);
CREATE INDEX grupo_responsavel ON grupo (responsavel_id);

CREATE TABLE contato (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id       uuid NOT NULL REFERENCES grupo(id) ON DELETE CASCADE,
  nome           text,
  cargo          text,
  email          text,
  email_status   text NOT NULL DEFAULT 'ok'
                 CHECK (email_status IN ('ok','corrigir','ausente','devolvido','descadastrado')),
  email_sugestao text,
  whatsapp       text,              -- só dígitos, com 55 + DDD (pronto para o wa.me)
  telefone       text,              -- como veio na planilha
  principal      boolean NOT NULL DEFAULT false,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contato_grupo ON contato (grupo_id);
CREATE INDEX contato_whatsapp ON contato (whatsapp);
CREATE INDEX contato_email ON contato (lower(email));

CREATE TABLE loja (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id       uuid NOT NULL REFERENCES grupo(id) ON DELETE CASCADE,
  razao_social   text,
  nome_fantasia  text,
  cidade         text,
  uf             text,
  regiao         text,
  cep            text
);
CREATE INDEX loja_grupo ON loja (grupo_id);

-- Histórico: tudo o que aconteceu com o lead.
CREATE TABLE atividade (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id    uuid NOT NULL REFERENCES grupo(id) ON DELETE CASCADE,
  tipo        text NOT NULL,        -- nota | whatsapp | ligacao | email | reuniao | etapa | temperatura | sistema
  resumo      text NOT NULL,
  detalhe     text,
  usuario_id  uuid REFERENCES usuario(id),
  em          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX atividade_grupo_em ON atividade (grupo_id, em DESC);

-- Fila de trabalho: os toques e ações com data.
CREATE TABLE tarefa (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id    uuid NOT NULL REFERENCES grupo(id) ON DELETE CASCADE,
  tipo        text NOT NULL DEFAULT 'outro' CHECK (tipo IN ('whatsapp','ligacao','email','outro')),
  titulo      text NOT NULL,
  texto       text,                 -- mensagem pronta (WhatsApp/e-mail) ou roteiro (ligação)
  vence_em    date NOT NULL,
  usuario_id  uuid REFERENCES usuario(id),
  feita_em    timestamptz,
  resultado   text,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tarefa_pendente ON tarefa (usuario_id, vence_em) WHERE feita_em IS NULL;
CREATE INDEX tarefa_grupo ON tarefa (grupo_id);

-- Configurações editáveis pela tela (preços dos pacotes, lojas do piloto, closer).
CREATE TABLE config (
  chave  text PRIMARY KEY,
  valor  jsonb NOT NULL
);
INSERT INTO config (chave, valor) VALUES
  ('precos', '{"essencial": 300, "performance": null, "completo": null}'),
  ('lojas_piloto', '4'),
  ('closer_email', '"fabio.roseiro@vendas.veilig.com.br"'),
  ('dominios_excluidos', '["shineraydobrasil.com.br"]');

COMMIT;
