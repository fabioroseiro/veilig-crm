"use client";
import { useState } from "react";
import readXlsxFile, { readSheetNames } from "read-excel-file";
import Papa from "papaparse";
import { detectar, importarBase, importarPipeline, type GrupoImp, type Linha, type Modelo } from "@/lib/importacao";
import type { ResultadoImportacao } from "@/lib/acoes";

const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

export function Importador({ dominiosExcluidos, importar }: {
  dominiosExcluidos: string[];
  importar: (arquivo: string, modelo: string, grupos: GrupoImp[]) => Promise<ResultadoImportacao>;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [abas, setAbas] = useState<string[]>([]);
  const [aba, setAba] = useState("");
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [modelo, setModelo] = useState<{ modelo: Modelo; cab: number } | null>(null);
  const [erro, setErro] = useState("");
  const [op, setOp] = useState({ segmento: "motos", marca: "", origem: "Fenabrave", origem_interna: "", temperatura: "frio" as GrupoImp["temperatura"] });
  const [grupos, setGrupos] = useState<GrupoImp[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);

  async function escolher(f: File | null) {
    setArquivo(f); setAbas([]); setAba(""); setLinhas(null); setModelo(null); setGrupos(null); setErro(""); setResultado(null);
    if (!f) return;
    if (/\.csv$/i.test(f.name)) return carregarLinhas(Papa.parse<string[]>(await f.text(), { skipEmptyLines: false }).data);
    try {
      const nomes = await readSheetNames(f);
      setAbas(nomes);
      const provavel = nomes.find((n) => /pipeline|base|leads|concession/i.test(n)) || nomes[0];
      await lerAba(f, provavel);
    } catch (e) { console.error("Leitura do arquivo:", e); setErro("Não consegui ler este Excel. Tente exportar a aba como CSV (Arquivo → Fazer download → CSV) e importar o CSV."); }
  }

  async function lerAba(f: File, nome: string) {
    setAba(nome); setGrupos(null); setResultado(null);
    const dados = await readXlsxFile(f, { sheet: nome });
    carregarLinhas(dados as unknown as Linha[]);
  }

  function carregarLinhas(l: Linha[]) {
    setLinhas(l);
    const d = detectar(l);
    setModelo(d);
    setErro(d ? "" : "Não reconheci as colunas desta aba. Ela precisa ter NOME, RESPONSÁVEL e EMAIL (base de lojas) ou Grupo / Concessionária (pipeline).");
  }

  function previa() {
    if (!linhas || !modelo) return;
    setResultado(null);
    setGrupos(modelo.modelo === "base"
      ? importarBase(linhas, modelo.cab, { ...op, dominios_excluidos: dominiosExcluidos })
      : importarPipeline(linhas, modelo.cab, hoje()));
  }

  async function confirmar() {
    if (!grupos || !arquivo || !modelo) return;
    setEnviando(true);
    try { setResultado(await importar(arquivo.name, modelo.modelo, grupos)); setGrupos(null); }
    catch { setErro("A importação falhou. Nada foi gravado. Tente de novo ou me mande o arquivo."); }
    finally { setEnviando(false); }
  }

  const incluidos = grupos?.filter((g) => g.incluir) ?? [];
  const totalLojas = incluidos.reduce((s, g) => s + g.num_lojas, 0);
  const semEmail = incluidos.filter((g) => !g.contatos.some((c) => c.email_status === "ok")).length;
  const corrigir = incluidos.reduce((s, g) => s + g.contatos.filter((c) => c.email_status === "corrigir").length, 0);

  return (
    <div className="grade">
      <div className="caixa">
        <h2>1. Arquivo</h2>
        <input type="file" accept=".xlsx,.csv" onChange={(e) => escolher(e.target.files?.[0] ?? null)} style={{ maxWidth: 420 }} />
        {abas.length > 1 && (
          <label className="campo" style={{ maxWidth: 420, marginTop: 10 }}><span>Aba</span>
            <select value={aba} onChange={(e) => arquivo && lerAba(arquivo, e.target.value)}>{abas.map((a) => <option key={a}>{a}</option>)}</select>
          </label>
        )}
        {modelo && <div className="aviso ok">Formato reconhecido: {modelo.modelo === "base" ? "base de lojas (uma linha por loja; as lojas são agrupadas em grupos)" : "pipeline (uma linha por grupo, com etapa e próxima ação)"}.</div>}
        {erro && <div className="aviso erro">{erro}</div>}
      </div>

      {modelo?.modelo === "base" && (
        <div className="caixa">
          <h2>2. Dados que valem para todas as lojas do arquivo</h2>
          <div className="grade g3">
            <label className="campo"><span>Segmento</span><select value={op.segmento} onChange={(e) => setOp({ ...op, segmento: e.target.value })}>
              <option value="motos">Motos</option><option value="leves">Veículos leves</option><option value="pesados">Caminhões e ônibus</option><option value="agricolas">Máquinas agrícolas</option><option value="outro">Outro</option></select></label>
            <label className="campo"><span>Marca</span><input value={op.marca} onChange={(e) => setOp({ ...op, marca: e.target.value })} /></label>
            <label className="campo"><span>Temperatura inicial</span><select value={op.temperatura} onChange={(e) => setOp({ ...op, temperatura: e.target.value as GrupoImp["temperatura"] })}>
              <option value="frio">Frio</option><option value="morno">Morno</option><option value="quente">Quente</option></select></label>
            <label className="campo"><span>Origem (pode aparecer nas mensagens)</span><input value={op.origem} onChange={(e) => setOp({ ...op, origem: e.target.value })} /></label>
            <label className="campo"><span>Origem interna (nunca aparece)</span><input value={op.origem_interna} onChange={(e) => setOp({ ...op, origem_interna: e.target.value })} placeholder="Ex.: Fabricante" /></label>
          </div>
        </div>
      )}

      {modelo && (
        <div className="caixa">
          <h2>{modelo.modelo === "base" ? "3" : "2"}. Conferir antes de gravar</h2>
          <button className="btn btn-ink" type="button" onClick={previa}>Gerar prévia</button>
          {grupos && (
            <>
              <div className="grade g4" style={{ margin: "14px 0" }}>
                <div className="kpi"><div className="k">Grupos a importar</div><div className="v num">{incluidos.length}</div></div>
                <div className="kpi"><div className="k">Lojas</div><div className="v num">{totalLojas || "—"}</div></div>
                <div className="kpi"><div className="k">Sem e-mail válido</div><div className="v num">{semEmail}</div></div>
                <div className="kpi"><div className="k">E-mails para corrigir</div><div className="v num">{corrigir}</div></div>
              </div>
              <div className="rolagem" style={{ maxHeight: 520, overflowY: "auto" }}>
                <table>
                  <thead><tr><th></th><th>Grupo</th><th>Lojas</th><th>Etapa</th><th>Contato principal</th><th>Avisos</th></tr></thead>
                  <tbody>{grupos.map((g, i) => {
                    const p = g.contatos.find((c) => c.principal) ?? g.contatos[0];
                    return (
                      <tr key={g.chave} style={{ opacity: g.incluir ? 1 : 0.5 }}>
                        <td><input type="checkbox" checked={g.incluir} disabled={!!g.excluido}
                          onChange={(e) => setGrupos(grupos.map((x, j) => (j === i ? { ...x, incluir: e.target.checked } : x)))} /></td>
                        <td><strong>{g.nome}</strong>{g.contatos.length > 1 && <div className="muted" style={{ fontSize: 12 }}>{g.contatos.length} contatos</div>}</td>
                        <td className="num">{g.num_lojas}</td>
                        <td>{g.situacao === "ativo" ? g.etapa : g.situacao === "pausado" ? `pausado até ${g.pausado_ate?.split("-").reverse().join("/")}` : "perdido"}</td>
                        <td style={{ fontSize: 13 }}>{p?.nome ?? "—"}<div className="muted">{p?.email ?? "sem e-mail"}{p?.whatsapp ? ` · +${p.whatsapp}` : ""}</div></td>
                        <td style={{ fontSize: 13 }}>{g.excluido ? <span className="alerta">{g.excluido}</span> : g.avisos.join("; ")}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
              <div className="linha" style={{ marginTop: 14 }}>
                <button className="btn btn-acc" type="button" disabled={enviando || incluidos.length === 0} onClick={confirmar}>
                  {enviando ? "Gravando…" : `Importar ${incluidos.length} grupos`}
                </button>
                <span className="muted" style={{ fontSize: 13 }}>Leads que já existem no CRM (mesmo WhatsApp ou e-mail) são pulados.</span>
              </div>
            </>
          )}
          {resultado && (
            <div className={`aviso ${resultado.erro ? "erro" : "ok"}`}>
              {resultado.erro ?? `${resultado.criados} grupos importados.`}
              {resultado.duplicados.length > 0 && ` ${resultado.duplicados.length} já existiam e foram pulados: ${resultado.duplicados.slice(0, 10).join(", ")}${resultado.duplicados.length > 10 ? "…" : ""}.`}
              {resultado.ignorados > 0 && ` ${resultado.ignorados} ficaram de fora por escolha ou exclusão.`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
