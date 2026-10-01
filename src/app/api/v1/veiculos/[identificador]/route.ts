import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/veiculos/{placa-ou-chassi}
 *
 * Responde a pergunta do consultor no balcão: este veículo tem plano ativo e
 * em dia? Se sim, ele executa a manutenção sem cobrar.
 *
 * ── Por que /v1 no caminho ───────────────────────────────────────────────
 *
 * O primeiro consumidor é o sistema de check-list, mas qualquer DMS vem
 * depois. Sem versão, mudar o formato quebraria integrações de terceiros que
 * não temos como avisar — e a versão é o que permite evoluir sem isso.
 *
 * ── O que NÃO devolvemos ────────────────────────────────────────────────
 *
 * Nome, CPF, telefone e valor pago ficam de fora. Placa é dado quase público:
 * está estampada no veículo. Com a chave e uma lista de placas, devolver dados
 * pessoais entregaria a base de clientes da concessionária.
 *
 * O consultor precisa decidir se atende — não precisa saber quanto o cliente
 * paga.
 *
 * Autenticação: cabeçalho `X-Api-Key`.
 */

function hash(chave: string): string {
  return crypto.createHash("sha256").update(chave).digest("hex");
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ identificador: string }> }
) {
  const { identificador } = await params;
  const chave = req.headers.get("x-api-key") ?? "";

  if (!chave) {
    return NextResponse.json(
      { erro: "credencial_ausente", mensagem: "Informe a chave no cabeçalho X-Api-Key." },
      { status: 401 }
    );
  }

  // Autenticação e limite numa consulta só.
  let cred: { credencial_id: string; group_id: string | null; dentro_limite: boolean } | null = null;
  try {
    const r = await db.execute(sql`SELECT * FROM api_autenticar(${hash(chave)})`);
    cred = ((Array.isArray(r) ? r : (r as any).rows)[0] as any) ?? null;
  } catch (e: any) {
    console.error("[API] falha ao autenticar:", e?.message);
    return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
  }

  if (!cred) {
    return NextResponse.json(
      { erro: "credencial_invalida", mensagem: "Chave inválida ou revogada." },
      { status: 401 }
    );
  }

  if (!cred.dentro_limite) {
    // 429 com Retry-After: o cliente sabe que deve esperar, em vez de insistir.
    return NextResponse.json(
      { erro: "limite_excedido", mensagem: "Muitas consultas nesta hora." },
      { status: 429, headers: { "Retry-After": "3600" } }
    );
  }

  const alvo = String(identificador ?? "").trim();
  if (alvo.length < 7) {
    return NextResponse.json(
      { erro: "identificador_invalido", mensagem: "Informe uma placa ou chassi." },
      { status: 400 }
    );
  }

  try {
    const r = await db.execute(
      sql`SELECT * FROM api_consultar_veiculo(${alvo}, ${cred.group_id}::uuid)`
    );
    const linha = (Array.isArray(r) ? r : (r as any).rows)[0] as any;

    // Registra a consulta ANTES de responder: é o que permite perceber alguém
    // varrendo placas em sequência.
    await db.execute(
      sql`INSERT INTO api_consulta (credencial_id, identificador, encontrado, status_http)
          VALUES (${cred.credencial_id}::uuid, ${alvo}, ${Boolean(linha)}, ${linha ? 200 : 404})`
    );
    await db.execute(
      // Função SECURITY DEFINER: a tabela tem RLS e esta rota não tem contexto
      // de tenant — um UPDATE direto afetaria zero linhas, sem erro.
      sql`SELECT api_registrar_uso(${cred.credencial_id}::uuid)`
    );

    if (!linha) {
      // 404 com corpo explicativo: "não tem plano" é uma resposta útil, não um
      // erro. O consultor precisa distinguir isso de falha na integração.
      return NextResponse.json(
        {
          encontrado: false,
          identificador: alvo,
          mensagem: "Nenhum plano ativo para este veículo.",
        },
        { status: 404 }
      );
    }

    const snapshot = linha.plano_snapshot ?? null;
    const emCarencia = linha.em_carencia === true;

    return NextResponse.json({
      encontrado: true,
      identificador: alvo,

      plano: {
        nome: linha.plano_nome,
        contrato: linha.contrato_numero,
        loja: linha.loja_nome,
      },

      // O que o consultor precisa decidir, em campos diretos — para o DMS não
      // ter que interpretar strings.
      situacao: {
        status: linha.status,
        adimplente: linha.status === "paga",
        // A DECISÃO pronta, e a razão de a API existir: o DMS pergunta uma
        // coisa e recebe sim ou não, sem interpretar status nem datas.
        //
        // Sumiu numa limpeza minha e o Bubble passou a ler `undefined`,
        // exibindo bloqueio para cliente em dia. Se um dia a regra mudar
        // (suspensão, novos estados), muda aqui — e nenhum DMS precisa saber.
        pode_atender: linha.status === "paga" && !emCarencia,
        em_carencia: emCarencia,
        carencia_ate: linha.carencia_ate,
      },

      // Conteúdo do plano como estava na venda — o que está coberto.
      cobertura: snapshot?.plano
        ? {
            revisoes: snapshot.plano.revisoes ?? [],
            beneficios: snapshot.plano.beneficios ?? [],
            exclusoes: snapshot.plano.exclusoes ?? null,
          }
        : null,
    });
  } catch (e: any) {
    console.error("[API] falha na consulta:", e?.message);
    return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
  }
}
