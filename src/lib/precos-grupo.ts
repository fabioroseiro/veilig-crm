import { sql } from "drizzle-orm";

/**
 * Materializa os preços do grupo nas lojas.
 *
 * Quando o plano está marcado como "preço definido pelo grupo", o valor que o
 * grupo cadastrou por modelo passa a valer para todas as lojas — e o plano já
 * nasce vendável, sem a loja precisar entrar na tela de precificação.
 *
 * POR QUE MATERIALIZAR em vez de ler o preço do grupo na hora da venda:
 * criar um segundo caminho de preço obrigaria a mexer na venda, no portal, no
 * ressync e em todo lugar que lê preço — e cada um deles seria uma chance de
 * esquecer o caso novo. Gravando em store_plan_price, essa tabela continua
 * sendo a ÚNICA fonte de preço e o resto do sistema não muda.
 *
 * Respeita a AFINIDADE da loja: uma loja Kawasaki não recebe preços de modelos
 * Bajaj, senão eles apareceriam para venda no balcão dela.
 */
export async function propagarPrecosDoGrupo(
  tx: any,
  groupId: string,
  planId: string
): Promise<void> {
  // 1) Garante que cada loja elegível tenha o plano instanciado.
  //    Elegível = ativa e com afinidade que casa com ao menos um modelo do plano.
  await tx.execute(sql`
    INSERT INTO store_plan (group_id, store_id, plan_id)
    SELECT s.group_id, s.id, ${planId}::uuid
    FROM store s
    WHERE s.group_id = ${groupId}::uuid
      AND s.status = 'ativo'
      AND EXISTS (
        SELECT 1
        FROM plan_model pm
        JOIN vehicle_model vm ON vm.id = pm.vehicle_model_id
        JOIN store_affinity sa
          ON sa.store_id = s.id
         AND sa.fabricante = vm.fabricante
         AND sa.categoria = vm.categoria
        WHERE pm.plan_id = ${planId}::uuid
      )
    ON CONFLICT (store_id, plan_id) DO NOTHING
  `);

  // 2) Grava o preço de cada modelo em cada loja.
  //    DO UPDATE de propósito: no modo central, o preço do grupo MANDA. Se a
  //    loja tinha um preço próprio de antes, ele é substituído — é o que
  //    "definido pelo grupo" significa.
  await tx.execute(sql`
    INSERT INTO store_plan_price (group_id, store_plan_id, vehicle_model_id, preco)
    SELECT sp.group_id, sp.id, pm.vehicle_model_id, pm.preco_minimo
    FROM store_plan sp
    JOIN plan_model pm ON pm.plan_id = sp.plan_id
    JOIN vehicle_model vm ON vm.id = pm.vehicle_model_id
    JOIN store_affinity sa
      ON sa.store_id = sp.store_id
     AND sa.fabricante = vm.fabricante
     AND sa.categoria = vm.categoria
    WHERE sp.plan_id = ${planId}::uuid
      AND sp.group_id = ${groupId}::uuid
    ON CONFLICT (store_plan_id, vehicle_model_id)
    DO UPDATE SET preco = EXCLUDED.preco, updated_at = now()
  `);
}
