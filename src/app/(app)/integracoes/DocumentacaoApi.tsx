/**
 * Documentação da API na própria tela de Integrações.
 *
 * Quem gera a chave é o gestor do grupo, mas quem integra é o técnico do DMS —
 * e ele precisa de tudo aqui: endereço, exemplo pronto, cada campo da resposta
 * e cada código de retorno. Sem isso, a chave vira pedido de suporte.
 *
 * Os exemplos seguem o que a rota /api/v1/veiculos devolve de fato. Se a rota
 * mudar, este texto muda junto — e o verificar.mjs confere o contrato.
 */

const bloco: React.CSSProperties = {
  background: "var(--surface-2, rgba(0,0,0,.04))",
  padding: "12px 14px",
  borderRadius: 8,
  fontSize: 13,
  overflowX: "auto",
  margin: "8px 0 0",
  whiteSpace: "pre",
};

const exemplo200 = `{
  "encontrado": true,
  "identificador": "ABC1D23",
  "plano": {
    "nome": "Rota B+",
    "contrato": "VLG-2026-000016",
    "loja": "Rota B Jundiaí"
  },
  "situacao": {
    "status": "paga",
    "adimplente": true,
    "pode_atender": true,
    "em_carencia": false,
    "carencia_ate": null
  },
  "cobertura": {
    "revisoes": [ { "nome": "Revisões periódicas", "km": 5000, "meses": 6,
                    "recorrente": true, "incluiPecas": true, "incluiMaoObra": true } ],
    "beneficios": [ { "nome": "Mão de obra inclusa", "descricao": "..." } ],
    "exclusoes": "..."
  }
}`;

const exemplo404 = `{
  "encontrado": false,
  "identificador": "ABC1D23",
  "mensagem": "Nenhum plano ativo para este veículo."
}`;

const campos: [string, string, string][] = [
  ["situacao.pode_atender", "sim/não", "A decisão pronta. Se for verdadeiro, pode executar a manutenção coberta sem cobrar do cliente."],
  ["situacao.status", "texto", "paga (em dia), pendente (fatura em aberto, ainda no prazo), atrasada (vencida e não paga) ou ativa (contratado, primeira cobrança em processamento)."],
  ["situacao.adimplente", "sim/não", "Verdadeiro quando o status é paga."],
  ["situacao.em_carencia", "sim/não", "O cliente já paga, mas ainda não pode usar o plano."],
  ["situacao.carencia_ate", "data ou nulo", "Até quando vai a carência (AAAA-MM-DD). Mostre essa data ao consultor."],
  ["plano.nome / contrato / loja", "texto", "Qual plano, o número do contrato e a loja que vendeu."],
  ["cobertura", "objeto", "Revisões, benefícios e exclusões do plano, como estavam na contratação."],
];

const codigos: [string, string, string][] = [
  ["200", "Veículo com plano", "Leia situacao.pode_atender."],
  ["404", "Veículo sem plano ativo", "Resposta normal, não é erro: vem com encontrado: false. Mostre \"sem plano\"."],
  ["400", "Placa ou chassi inválido", "Confira o que foi digitado (mínimo de 7 caracteres)."],
  ["401", "Chave ausente, inválida ou revogada", "Confira o cabeçalho X-Api-Key e se a chave continua ativa nesta tela."],
  ["429", "Limite de consultas excedido", "Até 600 consultas por hora por chave. O cabeçalho Retry-After diz quantos segundos esperar."],
  ["500", "Erro no servidor", "Tente de novo em instantes. Não trate como bloqueio do cliente."],
];

export function DocumentacaoApi({ baseUrl }: { baseUrl: string }) {
  const url = `${baseUrl}/api/v1/veiculos/ABC1D23`;

  return (
    <>
      <div className="section-label" style={{ marginTop: 24 }}>Como integrar</div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600 }}>1. A consulta</div>
        <p style={{ fontSize: 14, margin: "6px 0 0" }}>
          Uma requisição <strong>GET</strong>, de servidor para servidor, com a chave no
          cabeçalho <code>X-Api-Key</code>. Aceita placa (com ou sem hífen) ou chassi no final
          do endereço.
        </p>
        <pre style={bloco}>{`GET ${url}
X-Api-Key: vlg_SUA_CHAVE`}</pre>

        <div style={{ fontWeight: 600, marginTop: 16 }}>2. Exemplo para testar no terminal</div>
        <pre style={bloco}>{`curl -s '${url}' \\
  -H 'X-Api-Key: vlg_SUA_CHAVE'`}</pre>
        <p className="hint" style={{ margin: "6px 0 0" }}>
          Troque ABC1D23 por uma placa real de um cliente do grupo. A chave de um grupo só
          enxerga os veículos daquele grupo.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600 }}>3. A resposta</div>
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 14 }}>Exemplo — veículo com plano (200)</summary>
          <pre style={bloco}>{exemplo200}</pre>
        </details>
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 14 }}>Exemplo — veículo sem plano (404)</summary>
          <pre style={bloco}>{exemplo404}</pre>
        </details>

        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="list">
            <thead>
              <tr><th>Campo</th><th>Tipo</th><th>O que significa</th></tr>
            </thead>
            <tbody>
              {campos.map(([c, t, d]) => (
                <tr key={c}>
                  <td><code>{c}</code></td>
                  <td className="store-sub">{t}</td>
                  <td style={{ fontSize: 14 }}>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600 }}>4. Códigos de retorno</div>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="list">
            <thead>
              <tr><th>Código</th><th>Quando</th><th>O que fazer</th></tr>
            </thead>
            <tbody>
              {codigos.map(([c, q, o]) => (
                <tr key={c}>
                  <td><strong>{c}</strong></td>
                  <td style={{ fontSize: 14 }}>{q}</td>
                  <td style={{ fontSize: 14 }}>{o}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600 }}>5. Como mostrar ao consultor</div>
        <ul style={{ fontSize: 14, margin: "8px 0 0", paddingLeft: 20 }}>
          <li style={{ marginBottom: 6 }}>
            <strong>pode_atender verdadeiro:</strong> liberado — executar sem cobrar a manutenção
            coberta.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>pode_atender falso e em_carencia verdadeiro:</strong> em carência — mostrar
            "liberado a partir de" com a data de carencia_ate.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>pode_atender falso e status atrasada ou pendente:</strong> pagamento em
            aberto — orientar o cliente a regularizar.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>404:</strong> veículo sem plano.
          </li>
          <li>
            <strong>Erro, falta de resposta ou campo ausente:</strong> mostrar "não foi possível
            consultar" — nunca tratar como bloqueio, para não negar atendimento a um cliente em
            dia.
          </li>
        </ul>
        <p className="hint" style={{ marginBottom: 0 }}>
          A API não devolve nome, CPF, telefone nem valores do cliente — só o necessário para
          decidir o atendimento. Cada consulta fica registrada. Use a chave apenas no servidor do
          seu sistema, nunca em página aberta no navegador.
        </p>
      </div>
    </>
  );
}
