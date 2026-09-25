-- 007: rodízio de contatos na cadência Frio.
-- Ao fim de cada ciclo sem resposta, o próximo contato do grupo vira principal
-- e recebe a cadência inteira depois da pausa (30 dias porte A/B, 60 dias porte C).
BEGIN;
ALTER TABLE cadencia ADD COLUMN IF NOT EXISTS contato_original uuid REFERENCES contato(id) ON DELETE SET NULL;
UPDATE cadencia k
   SET contato_original = (SELECT c.id FROM contato c WHERE c.grupo_id = k.grupo_id AND c.principal LIMIT 1)
 WHERE k.tipo = 'frio' AND k.contato_original IS NULL;
COMMIT;
