-- CRM Veilig — responsáveis pela regra combinada:
-- Natália conduz os leads até "Proposta enviada"; a partir daí, Fabio (closer).
BEGIN;

INSERT INTO config (chave, valor) VALUES ('sdr_email', '"natalia@vendas.veilig.com.br"')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;

-- Leads antes da proposta → Natália
UPDATE grupo SET responsavel_id = (SELECT id FROM usuario WHERE lower(email) = 'natalia@vendas.veilig.com.br'), atualizado_em = now()
 WHERE etapa < 4
   AND (SELECT id FROM usuario WHERE lower(email) = 'natalia@vendas.veilig.com.br') IS NOT NULL;

-- Leads da proposta em diante → Fabio
UPDATE grupo SET responsavel_id = (SELECT id FROM usuario WHERE lower(email) = 'fabio.roseiro@vendas.veilig.com.br'), atualizado_em = now()
 WHERE etapa >= 4
   AND (SELECT id FROM usuario WHERE lower(email) = 'fabio.roseiro@vendas.veilig.com.br') IS NOT NULL;

-- As ações pendentes acompanham o novo responsável do lead
UPDATE tarefa t SET usuario_id = g.responsavel_id
  FROM grupo g
 WHERE g.id = t.grupo_id AND t.feita_em IS NULL AND g.responsavel_id IS NOT NULL;

-- Confira: quantos leads ficaram com cada um
SELECT u.nome, count(*) AS leads
  FROM grupo g JOIN usuario u ON u.id = g.responsavel_id
 GROUP BY u.nome ORDER BY u.nome;

COMMIT;
