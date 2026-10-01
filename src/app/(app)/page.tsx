import Link from "next/link";
import { BotaoRessincronizar } from "./BotaoRessincronizar";
import { SaudeSistema } from "@/components/SaudeSistema";
import { Tour } from "@/components/tour/Tour";
import { TOURS } from "@/lib/tours";
import { BotaoImportarCobrancas } from "./BotaoImportarCobrancas";
import { withTenant, schema, db } from "@/db";
import { emCarencia } from "@/lib/carencia";
import { serieMRR, resumirMRR, passagensDoMes } from "@/lib/mrr";
import { PainelRecorrencia } from "@/components/PainelRecorrencia";
import { getSessionContext } from "@/lib/session";
import { and, eq, gte, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const brlHome = (n: number) => "R$ " + n.toFixed(2).replace(".", ",");

// Métricas do negócio inteiro (painel do Veilig admin).
async function getMetricasVeilig(ctx: any) {
  return withTenant(ctx, async (tx) => {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    // Contagens simples — todas EXCLUINDO inativos.
    //
    // Antes só a de lojas filtrava. O painel mostrava "2 clientes" depois de
    // inativar um, enquanto a lista mostrava 1 — e o rótulo diz "Clientes",
    // que ninguém lê como "inclusive os desativados".
    //
    // Nunca apagamos de verdade (soft delete preserva FK e histórico), então
    // sem o filtro o número só cresce e deixa de significar alguma coisa.
    const [grupos] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.groups)
      .where(sql`${schema.groups.status} <> 'inativo'`);
    // "Lojas ativas" precisa considerar o GRUPO: uma loja de grupo inativo não
    // opera — o login é bloqueado e nenhuma venda acontece —, ainda que o
    // status dela própria diga 'ativo'. Contar só pelo status individual fazia
    // o painel contradizer a lista, que já mostra "Grupo inativo".
    const [lojas] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.stores)
      .leftJoin(schema.groups, eq(schema.groups.id, schema.stores.groupId))
      .where(
        sql`${schema.stores.status} = 'ativo'
            AND coalesce(${schema.groups.status}, 'ativo') <> 'inativo'`
      );
    const [clientes] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.customers)
      .leftJoin(schema.stores, eq(schema.stores.id, schema.customers.storeId))
      .leftJoin(schema.groups, eq(schema.groups.id, schema.stores.groupId))
      .where(
        sql`${schema.customers.status} <> 'inativo'
            AND coalesce(${schema.stores.status}, 'ativo') <> 'inativo'
            AND coalesce(${schema.groups.status}, 'ativo') <> 'inativo'`
      );

    // assinaturas com o fee resolvido (override da loja OU padrão do grupo)
    const subs = await tx
      .select({
        preco: schema.subscriptions.precoContratado,
        status: schema.subscriptions.status,
        createdAt: schema.subscriptions.createdAt,
        feeLoja: schema.stores.feePercentOverride,
        feeGrupo: schema.groups.feePercentPadrao,
        liquido: schema.subscriptions.ultimoValorLiquido,
        carenciaAte: schema.subscriptions.carenciaAte,
      })
      .from(schema.subscriptions)
      .leftJoin(schema.stores, eq(schema.stores.id, schema.subscriptions.storeId))
      .leftJoin(schema.groups, eq(schema.groups.id, schema.subscriptions.groupId))
      // Assinatura de grupo inativo fica de FORA do faturamento e da receita.
      //
      // Diferente das contagens acima, aqui a razão é financeira: inativar o
      // grupo não cancela as cobranças na Asaas, mas essas assinaturas não
      // representam operação corrente — e mantê-las inflava a projeção com
      // dinheiro de uma carteira que foi tirada do ar.
      //
      // Se um dia inativar precisar também cancelar as cobranças, isso é outra
      // decisão, e mais séria: mexe no bolso do cliente final.
      .where(
        sql`coalesce(${schema.stores.status}, 'ativo') <> 'inativo'
            AND coalesce(${schema.groups.status}, 'ativo') <> 'inativo'`
      );

    let vendasMes = 0, vendasTotal = 0;
    let fatMes = 0, fatTotal = 0;      // faturamento (soma dos planos)
    // Duas receitas, e a diferença entre elas não é detalhe:
    //
    // BRUTA  = preço × fee%. É o que a operação gera.
    // LÍQUIDA = netValue × fee%. É o que entra, porque o split da Asaas incide
    //           sobre o valor DEPOIS das taxas — elas saem antes da divisão.
    //
    // Enquanto uma assinatura não tiver pagamento confirmado, não há netValue e
    // o líquido usa o bruto como estimativa. A tela avisa quando isso acontece.
    let recMes = 0, recTotal = 0;            // bruta
    let recMesLiq = 0, recTotalLiq = 0;      // líquida
    let semLiquido = 0;
    const situacao = { paga: 0, atrasada: 0, cancelada: 0, pendente: 0 };
    let emCarenciaN = 0;

    for (const s of subs) {
      const preco = Number(s.preco) || 0;
      const feePct = Number(s.feeLoja ?? s.feeGrupo ?? 8) || 0;
      const fee = preco * (feePct / 100);

      const liq = s.liquido != null ? Number(s.liquido) : null;
      if (liq == null) semLiquido += 1;
      const feeLiq = (liq ?? preco) * (feePct / 100);
      const noMes = new Date(s.createdAt) >= inicioMes;

      vendasTotal += 1;
      fatTotal += preco;
      recTotal += fee;
      recTotalLiq += feeLiq;
      if (noMes) {
        vendasMes += 1;
        fatMes += preco;
        recMes += fee;
        recMesLiq += feeLiq;
      }

      // situação da carteira
      const st = s.status === "ativa" ? "pendente" : s.status; // 'ativa' inicial = ainda pendente
      if (st in situacao) (situacao as any)[st] += 1;

      // Em carência: dimensão INDEPENDENTE do pagamento. Um cliente pode estar
      // em dia e em carência ao mesmo tempo, então este número se cruza com os
      // de cima em vez de somar com eles.
      if (s.status !== "cancelada" && emCarencia(s.carenciaAte)) emCarenciaN += 1;
    }

    return {
      grupos: grupos?.n ?? 0,
      lojas: lojas?.n ?? 0,
      clientes: clientes?.n ?? 0,
      vendasMes, vendasTotal,
      fatMes, fatTotal,
      recMes, recTotal,
      recMesLiq, recTotalLiq, semLiquido,
      situacao,
      emCarencia: emCarenciaN,
    };
  });
}

// Situação da carteira de UMA loja (para o painel do gestor de loja).
async function getSituacaoLoja(ctx: any, storeId: string) {
  return withTenant(ctx, async (tx) => {
    const subs = await tx
      .select({
        status: schema.subscriptions.status,
        carenciaAte: schema.subscriptions.carenciaAte,
      })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.storeId, storeId));
    const situacao = { paga: 0, atrasada: 0, cancelada: 0, pendente: 0, emCarencia: 0 };
    for (const s of subs) {
      const st = s.status === "ativa" ? "pendente" : s.status;
      if (st in situacao) (situacao as any)[st] += 1;
      if (s.status !== "cancelada" && emCarencia(s.carenciaAte)) situacao.emCarencia += 1;
    }
    return situacao;
  });
}

// Métricas consolidadas do grupo (para o painel do group_admin).
async function getDesempenhoGrupo(ctx: any) {
  return withTenant(ctx, async (tx) => {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    const lojas = await tx.select({ id: schema.stores.id }).from(schema.stores);
    const subs = await tx
      .select({
        preco: schema.subscriptions.precoContratado,
        createdAt: schema.subscriptions.createdAt,
        liquido: schema.subscriptions.ultimoValorLiquido,
        feeLoja: schema.stores.feePercentOverride,
        feeGrupo: schema.groups.feePercentPadrao,
      })
      .from(schema.subscriptions)
      .leftJoin(schema.stores, eq(schema.stores.id, schema.subscriptions.storeId))
      .leftJoin(schema.groups, eq(schema.groups.id, schema.subscriptions.groupId));

    // Dois números, e o grupo precisa dos dois:
    //
    // FATURAMENTO = soma dos planos contratados. É o que a concessionária
    //   fatura ao cliente, e sobre o que emite nota (Cláusula 5.5). Não some
    //   daqui só porque não é o que cai na conta.
    //
    // REPASSE = o que efetivamente entra: líquido da Asaas menos o fee da
    //   Veilig. O split incide sobre o valor DEPOIS das taxas.
    let totalMes = 0;
    let totalGeral = 0;
    let repasseMes = 0;
    let repasseGeral = 0;
    let semLiquido = 0;

    for (const s of subs) {
      const preco = Number(s.preco) || 0;
      const feePct = Number(s.feeLoja ?? s.feeGrupo ?? 8) || 0;
      const liq = s.liquido != null ? Number(s.liquido) : null;
      if (liq == null) semLiquido += 1;
      // Sem pagamento confirmado ainda, o preço serve de estimativa.
      const repasse = (liq ?? preco) * (1 - feePct / 100);

      totalGeral += preco;
      repasseGeral += repasse;
      if (new Date(s.createdAt) >= inicioMes) {
        totalMes += preco;
        repasseMes += repasse;
      }
    }
    return {
      qtdLojas: lojas.length,
      totalMes, totalGeral,
      repasseMes, repasseGeral, semLiquido,
    };
  });
}

// Painel do vendedor: métrica de clientes do mês + planos da loja com descrição.
async function getPainelVendedor(storeId: string) {
  const ctx = await getSessionContext();
  return withTenant(ctx, async (tx) => {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    const meuId = ctx.userId ?? null;

    // MINHAS vendas (assinaturas onde eu sou o vendedor)
    // Preço e status vêm junto: o vendedor precisa ver QUANTO vendeu, não só
    // quantas vezes — a comissão sai daqui, e quem não consegue conferir o
    // próprio número vai conferir de outro jeito, ou desconfiar.
    const camposVenda = {
      id: schema.subscriptions.id,
      preco: schema.subscriptions.precoContratado,
      status: schema.subscriptions.status,
    };

    const minhasMes = await tx
      .select(camposVenda)
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.storeId, storeId),
          meuId ? eq(schema.subscriptions.vendedorId, meuId) : sql`false`,
          gte(schema.subscriptions.createdAt, inicioMes)
        )
      );
    const minhasTotal = await tx
      .select(camposVenda)
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.storeId, storeId),
          meuId ? eq(schema.subscriptions.vendedorId, meuId) : sql`false`
        )
      );

    // Vendido x líquido. Venda cancelada não gera receita, então comissionar
    // sobre ela é pagar a mais — a mesma base que o gestor vê em Desempenho,
    // para os dois olharem o mesmo número.
    const somar = (linhas: typeof minhasMes) => {
      let vendido = 0;
      let cancelado = 0;
      for (const l of linhas) {
        const v = Number(l.preco) || 0;
        vendido += v;
        if (l.status === "cancelada") cancelado += v;
      }
      return { vendido, cancelado, liquido: vendido - cancelado };
    };

    const valorMes = somar(minhasMes);
    const valorTotal = somar(minhasTotal);

    // vendas GERAIS da loja (todas as assinaturas da loja)
    const lojaMes = await tx
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(and(eq(schema.subscriptions.storeId, storeId), gte(schema.subscriptions.createdAt, inicioMes)));
    const lojaTotal = await tx
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.storeId, storeId));

    // planos que a loja vende (store_plan) com nome, descrição e menor preço
    const sp = await tx
      .select({
        planId: schema.storePlans.planId,
        nome: schema.plans.nome,
        descricao: schema.plans.descricao,
      })
      .from(schema.storePlans)
      .innerJoin(schema.plans, eq(schema.storePlans.planId, schema.plans.id))
      .where(eq(schema.storePlans.storeId, storeId));

    // menor preço praticado por plano nesta loja (para exibir "a partir de")
    const planosComPreco = [];
    for (const p of sp) {
      const precos = await tx
        .select({ preco: schema.storePlanPrices.preco })
        .from(schema.storePlanPrices)
        .innerJoin(schema.storePlans, eq(schema.storePlanPrices.storePlanId, schema.storePlans.id))
        .where(and(eq(schema.storePlans.storeId, storeId), eq(schema.storePlans.planId, p.planId)));
      const valores = precos.map((x) => Number(x.preco)).filter((n) => !isNaN(n));
      const menor = valores.length ? Math.min(...valores) : null;
      planosComPreco.push({
        nome: p.nome,
        descricao: p.descricao || "",
        aPartirDe: menor !== null ? menor.toFixed(2).replace(".", ",") : null,
      });
    }

    return {
      minhasMes: minhasMes.length,
      valorMes,
      valorTotal,
      minhasTotal: minhasTotal.length,
      lojaMes: lojaMes.length,
      lojaTotal: lojaTotal.length,
      planos: planosComPreco,
    };
  });
}

// A série roda dentro de withTenant, então o RLS já recorta o que cada papel
// enxerga. O storeId serve ao gestor, que precisa recortar a própria loja
// dentro do que já lhe é permitido.
async function getRecorrencia(ctx: any, storeId?: string) {
  return withTenant(ctx, async (tx) => ({
    resumo: resumirMRR(await serieMRR(tx, { storeId })),
    passagens: await passagensDoMes(tx, { storeId }),
  }));
}

export default async function Home() {
  const ctx = await getSessionContext();

  // Painel do vendedor
  if (ctx.role === "store_admin" && ctx.storeId) {
    const { minhasMes, minhasTotal, lojaMes, lojaTotal, planos, valorMes, valorTotal } =
      await getPainelVendedor(ctx.storeId);
    return (
        <main className="content">
          <h1>Seu painel</h1>
          <Tour id="painel" passos={TOURS.painel_vendedor} />
          <p className="subtitle">Acompanhe suas vendas e conheça os planos para vender melhor.</p>

          <div className="section-label" style={{ marginTop: 8 }}>Minhas vendas</div>
          <div className="stat-row" data-tour="painel-numeros">
            <div className="stat-card">
              <div className="stat-num">{minhasMes}</div>
              <div className="stat-label">Minhas vendas este mês</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{minhasTotal}</div>
              <div className="stat-label">Minhas vendas no total</div>
            </div>
            {/* Quanto vendeu, não só quantas vezes: a comissão sai daqui, e um
                vendedor que não consegue conferir o próprio número desconfia
                do sistema. */}
            <div className="stat-card">
              <div className="stat-num" style={{ color: "var(--accent-ink)" }}>
                {brlHome(valorMes.vendido)}
              </div>
              <div className="stat-label">Vendido este mês</div>
            </div>
            <div className="stat-card">
              <div className="stat-num" style={{ color: "var(--accent-ink)" }}>
                {brlHome(valorMes.liquido)}
              </div>
              <div className="stat-label">
                Líquido este mês
                {valorMes.cancelado > 0 && (
                  <div className="store-sub" style={{ fontSize: 12 }}>
                    −{brlHome(valorMes.cancelado)} cancelado
                  </div>
                )}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-num" style={{ color: "var(--accent-ink)" }}>
                {brlHome(valorTotal.liquido)}
              </div>
              <div className="stat-label">
                Líquido acumulado
                {valorTotal.cancelado > 0 && (
                  <div className="store-sub" style={{ fontSize: 12 }}>
                    −{brlHome(valorTotal.cancelado)} cancelado
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="section-label" style={{ marginTop: 20 }}>Vendas da loja</div>
          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-num">{lojaMes}</div>
              <div className="stat-label">Loja este mês</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{lojaTotal}</div>
              <div className="stat-label">Loja no total</div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <div className="section-label">Planos que você pode vender</div>
            {planos.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>
                Nenhum plano precificado para sua loja ainda. Fale com o gestor do grupo.
              </p>
            ) : (
              <div className="plan-cards">
                {planos.map((p, i) => (
                  <div key={i} className="plan-pitch">
                    <div className="plan-pitch-head">
                      <span className="plan-pitch-name">{p.nome}</span>
                      {p.aPartirDe && (
                        <span className="plan-pitch-price">a partir de R$ {p.aPartirDe}/mês</span>
                      )}
                    </div>
                    {p.descricao && <p className="plan-pitch-desc">{p.descricao}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <p style={{ marginTop: 20 }}>
            <Link href="/clientes/nova" className="btn-link-primary">
              + Cadastrar cliente
            </Link>
          </p>
        </main>

    );
  }

  // Painel do gestor de loja
  if (ctx.role === "store_manager" && ctx.storeId) {
    // Em paralelo: são consultas independentes, então o tempo passa a ser o da
    // mais lenta em vez da soma das três. Em série, cada uma esperava a
    // anterior terminar a viagem de ida e volta até o banco.
    const [{ lojaMes, lojaTotal }, situacao, recorrencia] = await Promise.all([
      getPainelVendedor(ctx.storeId),
      getSituacaoLoja(ctx, ctx.storeId),
      getRecorrencia(ctx, ctx.storeId),
    ]);
    return (
        <main className="content">
          <h1>Painel da loja</h1>
          <Tour id="painel" passos={TOURS.painel_gestor_loja} />
          <p className="subtitle">Gerencie os preços, a equipe e acompanhe as vendas.</p>

          <PainelRecorrencia resumo={recorrencia.resumo} passagens={recorrencia.passagens} titulo="Receita recorrente da loja" />

          <div className="section-label" style={{ marginTop: 8 }}>Vendas da loja</div>
          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-num">{lojaMes}</div>
              <div className="stat-label">Vendas este mês</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{lojaTotal}</div>
              <div className="stat-label">Vendas no total</div>
            </div>
          </div>

          <div className="section-label" style={{ marginTop: 20 }}>Situação das assinaturas</div>
          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-num" style={{ color: "var(--ok, #34a853)" }}>{situacao.paga}</div>
              <div className="stat-label">Pagas</div>
            </div>
            <div className="stat-card">
              <div className="stat-num" style={{ color: "#e0a800" }}>{situacao.pendente}</div>
              <div className="stat-label">Pendentes</div>
            </div>
            <div className="stat-card">
              <div className="stat-num" style={{ color: "#d33" }}>{situacao.atrasada}</div>
              <div className="stat-label">Inadimplentes</div>
            </div>
            <div className="stat-card">
              <div className="stat-num" style={{ color: "var(--ink-soft)" }}>{situacao.cancelada}</div>
              <div className="stat-label">Canceladas</div>
            </div>
            <div className="stat-card">
              <div className="stat-num" style={{ color: "#4ec3e0" }}>{situacao.emCarencia}</div>
              <div className="stat-label">Em carência</div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <div className="section-label">Atalhos</div>
            <p style={{ margin: "0 0 10px" }}>
              <Link href="/precos">Definir preços dos planos →</Link>
            </p>
            <p style={{ margin: "0 0 10px" }}>
              <Link href="/vendas">Ver vendas por vendedor →</Link>
            </p>
            <p style={{ margin: "0 0 10px" }}>
              <Link href="/usuarios">Gerenciar vendedores →</Link>
            </p>
            <p style={{ margin: 0 }}>
              <Link href="/clientes">Ver clientes →</Link>
            </p>
          </div>
        </main>

    );
  }

  // Painel do gestor de grupo
  if (ctx.role === "group_admin") {
    const [dados, recorrencia] = await Promise.all([
      getDesempenhoGrupo(ctx),
      getRecorrencia(ctx),
    ]);
    return (
        <main className="content">
          <h1>Painel do grupo</h1>
          <Tour id="painel" passos={TOURS.painel_gestor_grupo} />
          <p className="subtitle">Visão consolidada das lojas do seu grupo.</p>

          <PainelRecorrencia resumo={recorrencia.resumo} passagens={recorrencia.passagens} titulo="Receita recorrente do grupo" />

          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-num">{dados.qtdLojas}</div>
              <div className="stat-label">Lojas no grupo</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{brlHome(dados.totalMes)}</div>
              <div className="stat-label">Faturamento este mês</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{brlHome(dados.totalGeral)}</div>
              <div className="stat-label">Faturamento total</div>
            </div>
            {/* Repasse na MESMA linha: é o mesmo assunto que o faturamento, e
                a grade acomoda os quatro sem espremer. */}
            <div className="stat-card">
              <div className="stat-num" style={{ color: "var(--accent-ink)" }}>
                {brlHome(dados.repasseMes)}
              </div>
              <div className="stat-label">Repasse este mês</div>
            </div>
            <div className="stat-card">
              <div className="stat-num" style={{ color: "var(--accent-ink)" }}>
                {brlHome(dados.repasseGeral)}
              </div>
              <div className="stat-label">Repasse total</div>
            </div>
          </div>

          <p className="hint" style={{ marginTop: 8 }}>
            O <strong>faturamento</strong> é a soma dos planos contratados — é
            sobre ele que a nota é emitida. O <strong>repasse</strong> é o que
            entra na conta: já sem as taxas da Asaas e sem a comissão da Veilig.
            {dados.semLiquido > 0 && (
              <>
                {" "}
                {dados.semLiquido}{" "}
                {dados.semLiquido === 1 ? "assinatura ainda não teve" : "assinaturas ainda não tiveram"}{" "}
                pagamento confirmado; nelas o repasse é estimado pelo preço do
                plano.
              </>
            )}
          </p>

          <div className="card" style={{ marginTop: 20 }}>
            <div className="section-label">Atalhos</div>
            <p style={{ margin: "0 0 10px" }}>
              <Link href="/desempenho">Ver desempenho por loja →</Link>
            </p>
            <p style={{ margin: "0 0 10px" }}>
              <Link href="/lojas">Ver lojas →</Link>
            </p>
            <p style={{ margin: "0 0 10px" }}>
              <Link href="/planos">Ver planos →</Link>
            </p>
            <p style={{ margin: 0 }}>
              <Link href="/usuarios">Gerenciar usuários →</Link>
            </p>
          </div>
        </main>

    );
  }

  // Painel do Veilig admin — visão executiva do negócio inteiro
  const [m, recorrencia, exclusoesPendentes, motivosCancelamento] = await Promise.all([
    getMetricasVeilig(ctx),
    getRecorrencia(ctx),
    // Cobranças que a régua não conseguiu apagar na Asaas depois de 3
    // tentativas. Ficam aqui porque o contrato (9.3) manda cancelá-las, e
    // pendência invisível não é resolvida — o cliente receberia boleto de um
    // plano que não existe mais.
    (async () => {
      try {
        const r = await db.execute(sql`SELECT * FROM exclusoes_para_tratar_manualmente()`);
        return (Array.isArray(r) ? r : (r as any).rows) as any[];
      } catch {
        return [];
      }
    })(),
    // Por que os clientes saem. Inadimplência é problema de cobrança;
    // desistência é de produto ou de venda. Somá-los num "churn" único
    // esconderia os dois.
    withTenant(ctx, async (tx) => {
      try {
        const r = await tx.execute(sql`
          SELECT cancelamento_origem AS origem, count(*)::int AS qtd
          FROM subscription
          WHERE status = 'cancelada'
          GROUP BY cancelamento_origem
        `);
        return (Array.isArray(r) ? r : (r as any).rows) as any[];
      } catch {
        return [];
      }
    }),
  ]);

  const porOrigem = (o: string) =>
    Number(motivosCancelamento.find((x: any) => x.origem === o)?.qtd ?? 0);
  const semOrigem = Number(
    motivosCancelamento.find((x: any) => x.origem === null)?.qtd ?? 0
  );
  const totalCancelados = motivosCancelamento.reduce(
    (s: number, x: any) => s + Number(x.qtd ?? 0),
    0
  );
  return (
      <main className="content">
        <h1>Painel Veilig</h1>

        {/* Primeiro: se uma rotina automática parou, é a informação mais
            importante da tela — os números abaixo dependem dela. */}
        <SaudeSistema />

      {exclusoesPendentes.length > 0 && (
        <div className="banner banner-error" style={{ marginBottom: 16 }}>
          <strong>
            {exclusoesPendentes.length} cobrança(s) precisam ser excluídas à mão
            na Asaas.
          </strong>{" "}
          A régua tentou 3 vezes e não conseguiu. Enquanto não forem apagadas, o
          cliente pode receber boleto de um plano já cancelado.
          <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20, fontSize: 13 }}>
            {exclusoesPendentes.slice(0, 5).map((e: any) => (
              <li key={e.id}>
                {e.contrato_numero ?? "—"} · cobrança {e.asaas_payment_id} ·
                vencimento {e.vencimento} · {e.ultimo_erro}
              </li>
            ))}
          </ul>
        </div>
      )}
        <p className="subtitle">Visão geral da plataforma.</p>

        {/* Receita recorrente vem primeiro: é o número que responde "como o
            negócio está indo", diferente do faturamento do mês (que ignora quem
            já era cliente) e do acumulado (que soma meses passados). */}
        <PainelRecorrencia resumo={recorrencia.resumo} passagens={recorrencia.passagens} mostrarReceitaVeilig titulo="Receita recorrente da plataforma" />

        {/* Alcance da plataforma */}
        <div className="section-label" style={{ marginTop: 8 }}>Alcance</div>
        <div className="stat-row">
          <div className="stat-card">
            <div className="stat-num">{m.grupos}</div>
            <div className="stat-label">Grupos</div>
          </div>
          <div className="stat-card">
            <div className="stat-num">{m.lojas}</div>
            <div className="stat-label">Lojas ativas</div>
          </div>
          <div className="stat-card">
            <div className="stat-num">{m.clientes}</div>
            <div className="stat-label">Clientes</div>
          </div>
        </div>

        {/* Vendas */}
        <div className="section-label" style={{ marginTop: 20 }}>Planos vendidos</div>
        <div className="stat-row">
          <div className="stat-card">
            <div className="stat-num">{m.vendasMes}</div>
            <div className="stat-label">Este mês</div>
          </div>
          <div className="stat-card">
            <div className="stat-num">{m.vendasTotal}</div>
            <div className="stat-label">Total</div>
          </div>
        </div>

        {/* Faturamento x Receita da Veilig (lado a lado) */}
        <div className="section-label" style={{ marginTop: 20 }}>Faturamento e receita</div>
        <div className="stat-row">
          <div className="stat-card">
            <div className="stat-num">{brlHome(m.fatMes)}</div>
            <div className="stat-label">Faturamento este mês</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "var(--accent-ink)" }}>{brlHome(m.recMes)}</div>
            <div className="stat-label">Receita bruta este mês</div>
          </div>
          {/* O número que realmente entra: o split da Asaas incide sobre o
              valor DEPOIS das taxas, então elas saem antes da divisão. */}
          <div className="stat-card">
            <div className="stat-num" style={{ color: "var(--accent-ink)" }}>{brlHome(m.recMesLiq)}</div>
            <div className="stat-label">Receita líquida este mês</div>
          </div>
        </div>
        <div className="stat-row" style={{ marginTop: 12 }}>
          <div className="stat-card">
            <div className="stat-num">{brlHome(m.fatTotal)}</div>
            <div className="stat-label">Faturamento total</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "var(--accent-ink)" }}>{brlHome(m.recTotal)}</div>
            <div className="stat-label">Receita bruta total</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "var(--accent-ink)" }}>{brlHome(m.recTotalLiq)}</div>
            <div className="stat-label">Receita líquida total</div>
          </div>
        </div>

        <p className="hint" style={{ marginTop: 8 }}>
          A <strong>bruta</strong> é o percentual sobre o preço do plano. A{" "}
          <strong>líquida</strong> desconta as taxas da Asaas, que saem antes da
          divisão com a loja — é o que entra na conta.
          {m.semLiquido > 0 && (
            <>
              {" "}
              {m.semLiquido}{" "}
              {m.semLiquido === 1 ? "assinatura ainda não teve" : "assinaturas ainda não tiveram"}{" "}
              pagamento confirmado; nelas a líquida repete a bruta até o primeiro
              pagamento.
            </>
          )}
        </p>

        {/* Situação da carteira */}
        {totalCancelados > 0 && (
          <>
            <div className="section-label" style={{ marginTop: 20 }}>
              Por que os clientes saem
            </div>
            <div className="stat-row">
              <div className="stat-card">
                <div className="stat-num" style={{ color: "var(--danger)" }}>
                  {porOrigem("inadimplencia")}
                </div>
                <div className="stat-label">Por inadimplência</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">{porOrigem("cliente")}</div>
                <div className="stat-label">Cancelados pelo cliente</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">{porOrigem("loja") + porOrigem("veilig")}</div>
                <div className="stat-label">Cancelados pela loja</div>
              </div>
              {semOrigem > 0 && (
                <div className="stat-card">
                  <div className="stat-num" style={{ color: "var(--ink-soft)" }}>
                    {semOrigem}
                  </div>
                  <div className="stat-label">
                    Sem origem
                    <div className="store-sub" style={{ fontSize: 12 }}>
                      anteriores ao registro
                    </div>
                  </div>
                </div>
              )}
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              Inadimplência é problema de cobrança. Cancelamento pelo cliente é
              de produto ou de venda. Pedem ações diferentes.
            </p>
          </>
        )}

        <div className="section-label" style={{ marginTop: 20 }}>Situação das assinaturas</div>
        <div className="stat-row">
          <div className="stat-card">
            <div className="stat-num" style={{ color: "var(--ok, #34a853)" }}>{m.situacao.paga}</div>
            <div className="stat-label">Pagas</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "#e0a800" }}>{m.situacao.pendente}</div>
            <div className="stat-label">Pendentes</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "#d33" }}>{m.situacao.atrasada}</div>
            <div className="stat-label">Inadimplentes</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "var(--ink-soft)" }}>{m.situacao.cancelada}</div>
            <div className="stat-label">Canceladas</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "#4ec3e0" }}>{m.emCarencia}</div>
            <div className="stat-label">Em carência</div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <div className="section-label">Atalhos</div>
          <p style={{ margin: "0 0 10px" }}>
            <Link href="/lojas">Ver lojas →</Link>
          </p>
          <p style={{ margin: 0 }}>
            <Link href="/clientes">Ver clientes →</Link>
          </p>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-label">Manutenção</div>
          <BotaoRessincronizar />
          <BotaoImportarCobrancas />
        </div>
      </main>

  );
}
