import type { DadosContrato } from "@/lib/contrato";
import { descreverRevisao } from "@/lib/contrato";

/**
 * Rótulo da revisão no contrato.
 *
 * Uma linha RECORRENTE nomeada "1ª revisão" se contradiz: o texto diz "a cada
 * 6.000 km, enquanto o contrato estiver vigente", mas o rótulo sugere que só a
 * primeira está coberta. O cadastro já evita isso nas linhas novas; aqui é a
 * proteção para os planos que foram salvos antes.
 */
function rotuloRevisao(
  r: { nome: string; recorrente: boolean },
  i: number
): string {
  const nome = (r.nome ?? "").trim();
  const ehOrdinalAutomatico = /^\d+ª revisão$/.test(nome);
  if (r.recorrente && (nome === "" || ehOrdinalAutomatico)) {
    return "Revisões periódicas";
  }
  return nome || `${i + 1}ª revisão`;
}

/**
 * Dados do cliente no contrato. Ausente = MINUTA (o modelo do plano, sem
 * cliente), e os campos aparecem destacados como "a preencher".
 */
export type DadosCliente = {
  numero: string | null;
  versao: string;
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  endereco: string | null;
  fabricante: string;
  modelo: string;
  ano: string;
  placa: string;
  chassi: string;
  carenciaIsenta?: boolean;
  carenciaIsencaoMotivo?: string | null;
  condicao: string;
  km: string;
  precoBase: string;
  acrescimo: string;
  precoContratado: string;
  dataVenda: string;
  vendedor: string | null;
  carenciaFaixa: string | null;
  carenciaMeses: string | null;
  carenciaAte: string | null;
  aceitoEm: string | null;
  meioPagamento: string | null;
};

/**
 * O documento do contrato, usado em DOIS lugares: a minuta do plano e o
 * contrato do cliente.
 *
 * É um componente só de propósito. Se fossem duas telas, o texto divergiria
 * com o tempo — e a diferença entre o que o vendedor mostrou e o que o cliente
 * assinou é exatamente o tipo de coisa que aparece numa disputa.
 */
export function DocumentoContrato({
  dados,
  cliente,
  hoje,
}: {
  dados: DadosContrato;
  cliente?: DadosCliente | null;
  hoje: string;
}) {
  const { grupo, loja, plano } = dados;
  const c = cliente ?? null;

  const M = ({ children }: { children: React.ReactNode }) => (
    <span className="marcador">{children}</span>
  );

  return (
      <div className="documento">
        {!c && (
          <div className="tarja nao-imprimir">
            Minuta — os campos destacados são preenchidos na contratação
          </div>
        )}

        <h2 style={{ textAlign: "center", marginTop: 0 }}>
          CONTRATO DE ADESÃO — PLANO DE MANUTENÇÃO PREVENTIVA VEICULAR
        </h2>
        <p style={{ textAlign: "center", fontSize: 13, color: "#666" }}>
          Contrato nº {c?.numero ?? <M>a gerar</M>}
          {c ? ` · Emitido em ${hoje}` : ` · Minuta emitida em ${hoje}`}
        </p>

        <h3>1. DAS PARTES</h3>
        <p>
          <strong>CONTRATADA:</strong>{" "}
          {loja ? (
            <>
              {loja.razaoSocial}, inscrita no CNPJ sob o nº {loja.cnpj},
              estabelecida em {loja.enderecoCompleto}
            </>
          ) : (
            <M>loja vendedora</M>
          )}
          , doravante denominada <strong>CONCESSIONÁRIA</strong>
          {/* Matriz e filiais são a MESMA pessoa jurídica — só muda o número do
              estabelecimento no CNPJ. Chamar isso de "grupo econômico" sugere
              entidades separadas e enfraquece o documento, porque as obrigações
              na verdade vinculam a empresa inteira.

              Grupo econômico de verdade (raízes de CNPJ diferentes) mantém a
              redação original, que aí está correta. */}
          {!loja || loja.relacao === "grupo_economico" ? (
            <>
              , integrante do grupo econômico {grupo.razaoSocial}, CNPJ nº{" "}
              {grupo.cnpj}
            </>
          ) : loja.relacao === "filial" ? (
            <>
              , <strong>estabelecimento filial</strong> de {grupo.razaoSocial},
              cuja matriz está inscrita no CNPJ sob o nº {grupo.cnpj}
            </>
          ) : (
            <> ({loja.ehMatriz ? "estabelecimento matriz" : "estabelecimento único"})</>
          )}
          .
        </p>
        <p>
          <strong>CONTRATANTE:</strong> {c?.nome ?? <M>nome do cliente</M>},
          inscrito no CPF sob o nº {c?.cpf ?? <M>CPF</M>}
          {c?.endereco ? `, com endereço em ${c.endereco}` : <>, com endereço em <M>endereço</M></>}
          , e-mail {c?.email ?? <M>e-mail</M>}, telefone{" "}
          {c?.telefone ?? <M>telefone</M>}, doravante denominado{" "}
          <strong>CLIENTE</strong>.
        </p>
        <p>
          {/* "Intermediação de pagamentos" descreve atividade privativa de
              instituição autorizada pelo BCB, que a Veilig não exerce. E sem a
              quitação expressa, o cliente que pagou ficaria teoricamente
              exposto a nova cobrança pela concessionária. */}
          <strong>Parágrafo único.</strong> A plataforma tecnológica utilizada
          para contratação, cobrança e gestão deste plano é operada pela{" "}
          <strong>Veilig</strong>, que atua exclusivamente como prestadora de
          serviços de tecnologia à CONCESSIONÁRIA e como sua mandatária para
          emissão de cobranças e recebimento de valores, por meio de instituição
          de pagamento autorizada pelo Banco Central do Brasil. A Veilig{" "}
          <strong>não é parte</strong> deste contrato e{" "}
          <strong>não presta</strong> os serviços de manutenção aqui descritos,
          cuja execução é de responsabilidade exclusiva da CONCESSIONÁRIA. O
          pagamento realizado pelo CLIENTE por meio da plataforma opera plena e
          integral quitação perante a CONCESSIONÁRIA.
        </p>

        <h3>2. DO OBJETO</h3>
        <p>
          Este contrato tem por objeto a prestação, pela CONCESSIONÁRIA ao
          CLIENTE, dos serviços de manutenção preventiva descritos na Cláusula 4,
          mediante pagamento mensal antecipado, em regime de plano de manutenção
          pré-pago.
        </p>
        <p><strong>2.1.</strong> O plano contratado é: <strong>{plano.nome}</strong>.</p>
        {plano.descricao && <p><strong>2.2.</strong> Descrição: {plano.descricao}</p>}
        <p>
          <strong>2.3.</strong> O plano é vinculado ao veículo identificado na
          Cláusula 3 e ao CLIENTE identificado na Cláusula 1.{" "}
          <strong>Não é seguro, não é garantia estendida</strong> e não cobre
          sinistros, avarias ou defeitos — cobre exclusivamente os serviços
          listados na Cláusula 4.
        </p>
        <p>
          <strong>2.4.</strong> Veículos aceitos:{" "}
          {plano.aceitaZeroKm && plano.idadeMaximaAnos === 0
            ? "exclusivamente zero km."
            : !plano.aceitaZeroKm
            ? `exclusivamente seminovos com até ${plano.idadeMaximaAnos} anos de idade.`
            : plano.idadeMaximaAnos >= 99
            ? "zero km e seminovos, sem limite de idade."
            : `zero km e seminovos com até ${plano.idadeMaximaAnos} anos de idade.`}
        </p>

        {/* Trava de escopo: a Cláusula 4 é gerada do cadastro do plano. Sem
            este limite, um benefício do tipo "reparo de falha" ou "guincho"
            faria a 2.3 virar letra morta e o plano seria caracterizável como
            garantia estendida — operação privativa de seguradora. */}
        <p>
          <strong>2.5.</strong> Os serviços abrangidos por este plano
          restringem-se à manutenção preventiva programada e aos benefícios
          expressamente listados na Cláusula 4, não abrangendo, em nenhuma
          hipótese, cobertura de <strong>eventos futuros e incertos</strong>.
        </p>

        <h3>3. DO VEÍCULO COBERTO</h3>
        <table className="doc-tabela">
          <tbody>
            <tr><td>Fabricante</td><td>{c?.fabricante ?? <M>a preencher</M>}</td></tr>
            <tr><td>Modelo / versão</td><td>{c?.modelo ?? <M>a preencher</M>}</td></tr>
            <tr><td>Ano</td><td>{c?.ano ?? <M>a preencher</M>}</td></tr>
            {/* Zero km é vendido sem placa. O contrato identifica o veículo
                pelo chassi, e fica congelado assim — era o dado disponível na
                contratação. */}
            <tr>
              <td>Placa</td>
              <td>{c ? (c.placa || "a ser informada após o emplacamento") : <M>a preencher</M>}</td>
            </tr>
            <tr>
              <td>Chassi</td>
              <td>{c ? (c.chassi || "—") : <M>a preencher</M>}</td>
            </tr>
            <tr><td>Condição na contratação</td><td>{c?.condicao ?? <M>zero km ou seminovo</M>}</td></tr>
            <tr><td>Quilometragem declarada</td><td>{c?.km ?? <M>a preencher</M>}</td></tr>
          </tbody>
        </table>
        <p>
          <strong>3.1.</strong> A cobertura alcança exclusivamente o veículo
          acima. A substituição do veículo não transfere automaticamente o plano.
        </p>
        <p>
          <strong>3.2.</strong> As informações do veículo foram declaradas pelo
          CLIENTE no ato da contratação. Informação incorreta que altere a faixa
          de preço ou a carência aplicável autoriza a CONCESSIONÁRIA a corrigir
          as condições ou, não havendo acordo, a rescindir o contrato.
        </p>

        <h3>4. DO QUE O PLANO COBRE</h3>
        <p><strong>4.1. Revisões incluídas:</strong></p>
        {plano.revisoes.length === 0 ? (
          // Plano sem revisões é uma escolha válida — existem planos só de
          // benefícios. O texto anterior tratava isso como cadastro incompleto,
          // e ainda aparecia como alerta no contrato que o cliente lê.
          <p>Este plano não contempla revisões.</p>
        ) : (
          <ul>
            {plano.revisoes.map((r, i) => (
              <li key={i}>
                <strong>{rotuloRevisao(r, i)}:</strong> {descreverRevisao(r)}
              </li>
            ))}
          </ul>
        )}

        {plano.beneficios.length > 0 && (
          <>
            <p><strong>4.2. Benefícios adicionais:</strong></p>
            <ul>
              {plano.beneficios.map((b, i) => (
                <li key={i}>
                  <strong>{b.nome}</strong>
                  {b.descricao ? ` — ${b.descricao}` : ""}
                </li>
              ))}
            </ul>
          </>
        )}

        <p><strong>4.3. Limites de utilização:</strong></p>
        {plano.tetos.length === 0 ? (
          <p>Não há limite de utilização, observadas as exclusões abaixo.</p>
        ) : (
          <>
            <table className="doc-tabela">
              <tbody>
                {plano.tetos.map((t, i) => (
                  <tr key={i}><td>{t.rotulo}</td><td>{t.valor}</td></tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 13 }}>
              Havendo mais de um limite, prevalece o que for atingido primeiro.
            </p>
          </>
        )}

        <p><strong>4.4. O que NÃO está coberto:</strong></p>
        {plano.exclusoes && <p>{plano.exclusoes}</p>}
        <p>Além disso, em nenhuma hipótese estão cobertos:</p>
        <p>
          {/* "peças e serviços" excluía também a mão de obra, e isso impedia
              o benefício de mão de obra grátis de valer num reparo. A exclusão
              passa a ser do FORNECIMENTO e do REPARO — o benefício de hora
              trabalhada segue seus próprios limites (ver 4.7). */}
          a) <strong>peças</strong> decorrentes de acidente, colisão,
          capotamento, incêndio, furto, roubo ou vandalismo, bem como a
          reparação dos danos deles resultantes;<br />
          b) danos causados por uso indevido, competição, sobrecarga, adulteração
          de componentes ou modificação não autorizada pelo fabricante;<br />
          c) serviços realizados fora da rede da CONCESSIONÁRIA sem autorização
          prévia e por escrito;<br />
          d) itens de desgaste natural não expressamente listados na Cláusula 4.1;<br />
          e) reparos decorrentes da não realização das revisões nos prazos e
          quilometragens recomendados pelo fabricante.
        </p>

        {plano.condicoes && (
          <>
            <p><strong>4.5. Condições de execução:</strong></p>
            <p>{plano.condicoes}</p>
          </>
        )}

        <p>
          <strong>4.6.</strong> As revisões devem ser realizadas nas dependências
          da CONCESSIONÁRIA, mediante agendamento prévio, dentro dos intervalos
          de quilometragem e tempo recomendados pelo fabricante do veículo.
        </p>

        {/* Fronteira com a Cláusula 2.5: o benefício de mão de obra pode ser
            usado em qualquer serviço, inclusive reparo de colisão, SEM que isso
            transforme o plano em cobertura de evento futuro e incerto. O que se
            concede é hora trabalhada, não indenização — e com limite próprio.
            Sem esta cláusula, a leitura conjunta da 4.4 e da 4.2 fica ambígua. */}
        <p>
          <strong>4.7.</strong> As exclusões da Cláusula 4.4 referem-se ao{" "}
          <strong>fornecimento de peças e à execução de reparos</strong>. Os
          benefícios de mão de obra eventualmente contratados na Cláusula 4.2
          seguem seus próprios termos e limites, e sua fruição{" "}
          <strong>não implica cobertura, indenização ou assunção de risco</strong>{" "}
          pela CONCESSIONÁRIA quanto ao evento que originou o serviço.
        </p>

        <h3>5. DO PREÇO E DA FORMA DE PAGAMENTO</h3>
        <table className="doc-tabela">
          <tbody>
            <tr><td>Preço base do plano para o modelo</td><td>{c?.precoBase ?? <M>a preencher</M>}</td></tr>
            <tr><td>Acréscimo por faixa de idade</td><td>{c?.acrescimo ?? <M>conforme tabela abaixo</M>}</td></tr>
            <tr><td><strong>Valor mensal contratado</strong></td><td><strong>{c?.precoContratado ?? <M>a preencher</M>}</strong></td></tr>
            <tr><td>Periodicidade</td><td>Mensal</td></tr>
            <tr><td>Data da contratação</td><td>{c?.dataVenda ?? <M>a preencher</M>}</td></tr>
          </tbody>
        </table>

        {plano.acrescimos.length > 0 && (
          <>
            <p style={{ marginTop: 12 }}><strong>5.1. Acréscimo por idade do veículo:</strong></p>
            <table className="doc-tabela">
              <tbody>
                {plano.acrescimos.map((a, i) => (
                  <tr key={i}>
                    <td>{a.faixa}</td>
                    <td>{a.percent > 0 ? `+${a.percent.toFixed(2).replace(".", ",")}%` : "sem acréscimo"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <p>
          {/* A redação anterior dizia que a plataforma era contratada pela
              concessionária. Não é o que acontece: a cobrança nasce na conta da
              Veilig. Esta cláusula, com o parágrafo único da 1, é o que dá
              lastro documental à tese de que os valores não são receita da
              Veilig. */}
          <strong>5.2.</strong> O pagamento é mensal e antecipado, processado por
          meio da plataforma Veilig, que emite as cobranças e recebe os valores{" "}
          <strong>em nome e por conta da CONCESSIONÁRIA</strong>, na modalidade
          escolhida pelo CLIENTE no ato do pagamento (cartão de crédito, boleto
          ou Pix).
        </p>
        <p>
          <strong>5.3.</strong> O valor mensal permanece inalterado durante toda
          a vigência, ressalvado o reajuste anual previsto na Cláusula 8.
          Alterações posteriores no preço de tabela do plano{" "}
          <strong>não afetam</strong> este contrato.
        </p>
        <p>
          <strong>5.4.</strong> As condições registradas neste contrato — preço,
          carência, conteúdo do plano e regras de aceitação — são as vigentes na
          data da contratação e ficam <strong>congeladas</strong> para o CLIENTE,
          ainda que a CONCESSIONÁRIA altere o plano para novas contratações.
        </p>

        {/* "Quando aplicável" é proposital: permite emitir a nota das peças na
            execução da revisão, com os itens efetivamente aplicados, em vez de
            estimar na mensalidade. Sem esta cláusula, nada no contrato indicava
            quem emite nota. */}
        <p>
          <strong>5.5.</strong> A CONCESSIONÁRIA é a única responsável pela
          emissão dos documentos fiscais devidos ao CLIENTE, na forma exigida
          pela legislação, discriminando, quando aplicável, as peças fornecidas
          e os serviços prestados.
        </p>

        <h3>6. DA CARÊNCIA</h3>
        <p>
          <strong>6.1.</strong> Carência é o período em que o CLIENTE{" "}
          <strong>já paga as mensalidades, mas ainda não pode utilizar</strong>{" "}
          os serviços do plano.
        </p>
        {plano.carencias.length > 0 && (
          <>
            <p><strong>6.2.</strong> Prazos por faixa de idade do veículo na contratação:</p>
            <table className="doc-tabela">
              <tbody>
                {plano.carencias.map((c, i) => (
                  <tr key={i}>
                    <td>{c.faixa}</td>
                    <td>{c.meses === 0 ? "sem carência" : `${c.meses} ${c.meses === 1 ? "mês" : "meses"}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {/* Isenção negociada: precisa constar no contrato, com o motivo. Sem
            isto, um contrato sem carência contradiz a política do plano e
            ninguém consegue explicar por quê. */}
        {c?.carenciaIsenta && (
          <p>
            <strong>6.2.1. Isenção de carência.</strong> Fica dispensado o
            período de carência para este contrato, mediante autorização da
            CONCESSIONÁRIA
            {c.carenciaIsencaoMotivo ? `, pelo seguinte motivo: ${c.carenciaIsencaoMotivo}` : ""}.
            O CLIENTE pode utilizar os serviços do plano desde a contratação.
          </p>
        )}

        {!c?.carenciaIsenta && c?.carenciaFaixa && (
          <>
            <p><strong>6.2.1. Carência aplicada a este contrato:</strong></p>
            <table className="doc-tabela">
              <tbody>
                <tr><td>Faixa do veículo na contratação</td><td>{c.carenciaFaixa}</td></tr>
                <tr><td>Prazo de carência</td><td>{c.carenciaMeses}</td></tr>
                <tr><td><strong>Liberação do uso em</strong></td><td><strong>{c.carenciaAte}</strong></td></tr>
              </tbody>
            </table>
          </>
        )}
        <p>
          <strong>6.3.</strong> A carência é contada da data da contratação,
          fixada uma única vez e não recalculada.
        </p>
        <p>
          <strong>6.4.</strong> A carência <strong>não suspende nem reduz</strong>{" "}
          a obrigação de pagamento das mensalidades do período.
        </p>
        <p>
          <strong>6.5.</strong> O CLIENTE declara ciência de que a carência
          decorre da idade e da condição do veículo na data da contratação, e que
          sua finalidade é preservar o equilíbrio econômico do plano.
        </p>

        <h3>7. DA VIGÊNCIA E DO ACEITE</h3>
        <p>
          <strong>7.1.</strong> Este contrato vigora por prazo indeterminado, com
          renovação automática a cada ciclo mensal pago, até que uma das partes o
          encerre na forma da Cláusula 10.
        </p>
        <p>
          <strong>7.2. ACEITE.</strong> O CLIENTE manifesta sua concordância
          integral com os termos deste contrato ao{" "}
          <strong>realizar o pagamento da primeira mensalidade</strong>. O
          pagamento constitui aceite eletrônico, válido e vinculante, dispensada
          assinatura física.
        </p>
        <p>
          <strong>7.3.</strong> Enquanto não houver o pagamento da primeira
          mensalidade, <strong>não há contrato</strong>, e nenhuma cobertura é
          devida.
        </p>

        <h3>8. DO REAJUSTE</h3>
        <p>
          <strong>8.1.</strong> O valor mensal será reajustado a cada 12 (doze)
          meses, contados da data de contratação, observada a periodicidade
          mínima legal (Lei nº 10.192/2001).
        </p>
        <p>
          <strong>8.2.</strong> O índice de reajuste é{" "}
          <strong>{grupo.indiceReajuste}</strong>, acumulado no período de 12
          meses.
        </p>
        {grupo.tetoReajustePercent !== null && (
          <p>
            <strong>8.3.</strong> O reajuste fica limitado a{" "}
            <strong>{grupo.tetoReajustePercent.toFixed(2).replace(".", ",")}% ao ano</strong>,
            ainda que o índice acumulado seja superior.
          </p>
        )}
        <p>
          <strong>8.4.</strong> Extinto o índice previsto, aplicar-se-á o que a
          legislação determinar e, na ausência de previsão legal, outro índice
          oficial acordado entre as partes.
        </p>
        <p>
          <strong>8.5.</strong> O CLIENTE será comunicado do reajuste com
          antecedência mínima de 30 (trinta) dias, pelos canais de contato
          informados na Cláusula 1.
        </p>
        <p>
          <strong>8.6.</strong> Reajuste não aplicado no aniversário do contrato{" "}
          <strong>não poderá ser cobrado retroativamente</strong>.
        </p>

        <h3>9. DO ATRASO E DA INADIMPLÊNCIA</h3>
        <p>
          <strong>9.1.</strong> O atraso no pagamento acarreta{" "}
          <strong>suspensão imediata do direito de utilização</strong> do plano, a
          partir da data do vencimento não pago.
        </p>
        <p>
          <strong>9.2.</strong> Sobre o valor em atraso incidem multa de{" "}
          <strong>{grupo.multaPercent.toFixed(2).replace(".", ",")}%</strong> e
          juros de mora de{" "}
          <strong>{grupo.jurosMesPercent.toFixed(2).replace(".", ",")}% ao mês</strong>,
          calculados pro rata die.
        </p>
        <p>
          <strong>9.3.</strong> Persistindo o atraso por{" "}
          <strong>{grupo.diasCancelamento} dias</strong>, o contrato será{" "}
          <strong>cancelado definitivamente</strong>, cessando a cobrança de
          novas mensalidades e sendo canceladas as cobranças em aberto relativas
          ao período sem cobertura.
        </p>
        <p>
          <strong>9.4.</strong> O cancelamento por inadimplência{" "}
          <strong>não admite reativação</strong> deste contrato. Havendo interesse
          em nova contratação, será firmado novo contrato, com{" "}
          <strong>nova carência</strong> conforme a Cláusula 6.
        </p>

        <h3>10. DO CANCELAMENTO</h3>
        <p>
          <strong>10.1.</strong> O CLIENTE pode cancelar este contrato a qualquer
          momento, <strong>sem multa</strong>, pelo portal do cliente ou
          diretamente na CONCESSIONÁRIA.
        </p>
        <p>
          <strong>10.2.</strong> O cancelamento produz efeitos ao final do ciclo
          mensal já pago. Não há devolução proporcional, e o CLIENTE mantém o
          direito de uso até o fim do período pago, respeitada a carência.
        </p>
        <p>
          {/* Mutualismo é o fundamento técnico do SEGURO. Invocá-lo aqui, tendo
              a 2.3 negado ser seguro, era a contradição mais explorável do
              contrato. A justificativa agora é a disponibilidade contratada —
              que sustenta a retenção sem invocar lógica securitária. */}
          <strong>10.3.</strong> Mensalidades pagas não são restituídas em razão
          de não utilização dos serviços, dado que o plano remunera a{" "}
          <strong>disponibilidade permanente</strong> dos serviços contratados
          durante o período pago, independentemente de sua efetiva fruição pelo
          CLIENTE.
        </p>
        <p>
          <strong>10.4.</strong> A CONCESSIONÁRIA pode rescindir este contrato em
          caso de inadimplência não regularizada; fraude ou informação falsa
          prestada pelo CLIENTE; ou uso do plano em veículo diverso do indicado
          na Cláusula 3.
        </p>
        <p>
          <strong>10.5.</strong> Havendo nova contratação por CLIENTE que tenha
          cancelado plano anterior, aplicam-se integralmente as carências
          previstas na Cláusula 6.
        </p>

        <h3>11. DAS OBRIGAÇÕES DO CLIENTE</h3>
        <p>
          a) manter em dia o pagamento das mensalidades;<br />
          b) agendar previamente as revisões;<br />
          c) apresentar o veículo na CONCESSIONÁRIA nos prazos e quilometragens
          recomendados pelo fabricante;<br />
          d) manter atualizados seus dados de contato;<br />
          e) comunicar a alienação do veículo, hipótese em que o plano não é
          transferido automaticamente ao novo proprietário;<br />
          f) não utilizar o plano em veículo diverso do indicado na Cláusula 3.
        </p>

        <h3>12. DAS OBRIGAÇÕES DA CONCESSIONÁRIA</h3>
        <p>
          a) executar os serviços descritos na Cláusula 4, dentro dos limites
          contratados, com mão de obra qualificada e peças conformes às
          especificações do fabricante;<br />
          b) disponibilizar agendamento em prazo razoável;<br />
          c) informar previamente qualquer alteração nas condições do plano que
          dependa de anuência do CLIENTE;<br />
          d) manter este contrato disponível ao CLIENTE no portal, durante toda a
          vigência e pelo prazo legal de guarda após o encerramento;<br />
          g) emitir os documentos fiscais relativos aos valores recebidos e aos
          serviços executados, na forma da Cláusula 5.5.
        </p>

        <h3>13. DO DIREITO DE ARREPENDIMENTO</h3>
        <p>
          Nas contratações realizadas fora do estabelecimento comercial da
          CONCESSIONÁRIA (internet, telefone ou domicílio), o CLIENTE pode
          desistir do contrato em até <strong>7 (sete) dias</strong> contados da
          contratação ou do primeiro pagamento, o que ocorrer por último, com
          restituição integral dos valores pagos, nos termos do art. 49 do Código
          de Defesa do Consumidor.
        </p>

        <h3>14. DOS DADOS PESSOAIS (LGPD)</h3>
        <p>
          <strong>14.1.</strong> Os dados pessoais do CLIENTE são tratados para
          execução deste contrato, cobrança, comunicação sobre o plano e
          cumprimento de obrigações legais, nos termos da Lei nº 13.709/2018.
        </p>
        <p>
          <strong>14.2.</strong> Atuam no tratamento: a CONCESSIONÁRIA e o grupo
          econômico a que pertence, como <strong>controladores</strong>; a Veilig,
          como <strong>operadora</strong> da plataforma; e a instituição de
          pagamento contratada, para processamento das cobranças.
        </p>
        <p>
          <strong>14.3.</strong> O CLIENTE pode exercer os direitos previstos em
          lei — acesso, correção, portabilidade e eliminação — pelos canais da
          CONCESSIONÁRIA.
        </p>

        <h3>15. DAS DISPOSIÇÕES GERAIS</h3>
        <p>
          <strong>15.1.</strong> A tolerância quanto ao descumprimento de qualquer
          cláusula não implica novação nem renúncia.
        </p>
        <p><strong>15.2.</strong> A nulidade de uma cláusula não invalida as demais.</p>
        <p>
          <strong>15.3.</strong> Fica eleito o foro do domicílio do CLIENTE para
          dirimir controvérsias, conforme art. 101, I, do Código de Defesa do
          Consumidor.
        </p>

        <h3>16. REGISTRO DO ACEITE ELETRÔNICO</h3>
        <table className="doc-tabela">
          <tbody>
            <tr><td>Contrato nº</td><td>{c?.numero ?? <M>a gerar</M>}</td></tr>
            <tr><td>Data da contratação</td><td>{c?.dataVenda ?? <M>a preencher</M>}</td></tr>
            {/* Sem vendedor não é campo esquecido: a venda foi feita por
                administrador, que não é vendedor de loja. Dizer "a preencher"
                num contrato firmado passa impressão de documento incompleto. */}
            <tr>
              <td>Vendedor responsável</td>
              <td>
                {c
                  ? c.vendedor ?? "Contratação realizada pela administração"
                  : <M>a preencher</M>}
              </td>
            </tr>
            <tr><td>Aceite formalizado pelo pagamento em</td><td>{c?.aceitoEm ?? <M>aguardando primeiro pagamento</M>}</td></tr>
            <tr><td>Meio de pagamento do aceite</td><td>{c?.meioPagamento ?? <M>aguardando primeiro pagamento</M>}</td></tr>
            <tr><td>Versão do modelo</td><td>{c?.versao ?? "v1"}</td></tr>
          </tbody>
        </table>
        <p style={{ fontSize: 13, color: "#666", fontStyle: "italic" }}>
          {!c ? (
            <>
              Este documento é uma <strong>minuta</strong>, emitida em {hoje} para
              apresentação das condições do plano. Não constitui proposta
              vinculante nem contrato firmado. O contrato passa a existir com o
              pagamento da primeira mensalidade.
            </>
          ) : c.aceitoEm ? (
            <>
              Documento gerado eletronicamente pela plataforma Veilig em {hoje}.
              O aceite foi formalizado pelo pagamento registrado acima.
            </>
          ) : (
            <>
              Documento gerado eletronicamente em {hoje}. Enquanto o aceite não
              for formalizado pelo pagamento da primeira mensalidade, este
              documento constitui <strong>proposta</strong>, sem eficácia
              contratual.
            </>
          )}
        </p>
      </div>
  );
}
