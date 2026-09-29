-- 008: propostas comerciais geradas pelo CRM, enviadas pela caixa do closer,
-- com link para o cliente aceitar ou pedir mais prazo.
BEGIN;

CREATE SEQUENCE IF NOT EXISTS proposta_numero;

CREATE TABLE IF NOT EXISTS proposta (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id       uuid NOT NULL REFERENCES grupo(id) ON DELETE CASCADE,
  numero         text NOT NULL UNIQUE,
  token          text NOT NULL UNIQUE,          -- link público /p/<token>
  status         text NOT NULL DEFAULT 'rascunho'
                 CHECK (status IN ('rascunho','enviada','aceita','prazo_pedido','cancelada')),
  dados          jsonb NOT NULL,                -- tudo o que aparece na proposta (editável até o envio)
  validade       date NOT NULL,
  enviada_em     timestamptz,
  enviada_para   text,
  aberta_em      timestamptz,                   -- primeira vez que o cliente abriu o link
  aberturas      int NOT NULL DEFAULT 0,
  aceita_em      timestamptz,
  aceite         jsonb,                          -- nome, cargo, e-mail e IP de quem aceitou
  prazo_pedido   jsonb,                          -- data sugerida e motivo
  criada_por     uuid REFERENCES usuario(id),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposta_grupo ON proposta (grupo_id, criado_em DESC);

-- Caixa que envia as propostas (a do closer) e os valores padrão da tabela.
INSERT INTO config (chave, valor) VALUES
  ('remetente_proposta', '{"email": "fabio.roseiro@vendas.veilig.com.br", "nome": "Fabio Roseiro", "whatsapp": ""}'),
  ('tabela_proposta', '{
     "recorrente": {"essencial": 400, "performance": 900, "completo": 1300},
     "setup": {"ate3": 5000, "ate9": 12000, "mais": null},
     "fee": 10, "validade_dias": 15, "vencimento_dia": 10
   }')
ON CONFLICT (chave) DO NOTHING;

COMMIT;
