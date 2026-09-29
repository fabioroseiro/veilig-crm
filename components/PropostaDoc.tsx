import type { ConteudoProposta } from "@/lib/proposta-conteudo";

/** A proposta em HTML: a mesma estrutura do PDF, usada no link do cliente e na pré-visualização. */
export function PropostaDoc({ c }: { c: ConteudoProposta }) {
  return (
    <article className="prop">
      <header className="prop-topo">
        <div className="prop-marca"><img src="/logo.png" alt="" width={30} height={30} /><span>VEILIG</span></div>
        <h1>Proposta comercial</h1>
        <div className="prop-num">{c.numero} · {c.emitida}</div>
      </header>
      <div className="prop-corpo">
        <div className="prop-para">
          <div className="k">Para</div>
          <div className="empresa">{c.empresa}</div>
          {c.contato && <div className="muted">{c.contato}</div>}
        </div>
        <p className="prop-intro">{c.intro}</p>
        {c.secoes.map((s) => (
          <section key={s.titulo} className="prop-secao">
            <h2>{s.titulo}</h2>
            {s.texto && <p>{s.texto}</p>}
            {s.linhas && (
              <dl className="prop-linhas">
                {s.linhas.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              </dl>
            )}
            {s.destaque && <div className="prop-destaque"><span>{s.destaque[0]}</span><strong>{s.destaque[1]}</strong></div>}
            {s.itens && (s.numerada
              ? <ol>{s.itens.map((i) => <li key={i}>{i}</li>)}</ol>
              : <ul>{s.itens.map((i) => <li key={i}>{i}</li>)}</ul>)}
            {s.tabela && (
              <table className="prop-tabela">
                <thead><tr><th>{s.tabela.cab[0]}</th><th>{s.tabela.cab[1]}</th></tr></thead>
                <tbody>{s.tabela.linhas.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}</tbody>
              </table>
            )}
            {s.comparativo && (
              <div className="prop-rolagem">
                <table className={`prop-comparativo c${s.comparativo.cab.length}`}>
                  <thead><tr>{s.comparativo.cab.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
                  <tbody>{s.comparativo.linhas.map((l) => <tr key={l.join("|")}>{l.map((c, i) => <td key={i} data-rotulo={s.comparativo!.cab[i]}>{c}</td>)}</tr>)}</tbody>
                </table>
              </div>
            )}
            {s.nota && <p className="prop-nota">{s.nota}</p>}
          </section>
        ))}
        {c.observacoes && <section className="prop-secao"><h2>Observações</h2><p style={{ whiteSpace: "pre-wrap" }}>{c.observacoes}</p></section>}
        <div className="prop-validade">{c.condicao}</div>
        <div className="prop-assinatura">{c.assinatura.map((l, i) => <div key={l} className={i === 0 ? "nome" : "muted"}>{l}</div>)}</div>
      </div>
    </article>
  );
}
