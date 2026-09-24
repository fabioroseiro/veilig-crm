import { FormAcao, Enviar } from "@/components/FormAcao";
import { novoGrupo } from "@/lib/acoes";
import { SEGMENTOS, TEMPERATURAS } from "@/lib/regras";

export default function NovoLead() {
  return (
    <>
      <div className="topo"><div><h1>Novo lead</h1><div className="muted">Para um contato que chegou fora da planilha: indicação, evento, ligação.</div></div></div>
      <div className="caixa" style={{ maxWidth: 720 }}>
        <FormAcao acao={novoGrupo}>
          <label className="campo"><span>Grupo ou concessionária</span><input name="nome" required /></label>
          <div className="grade g3">
            <label className="campo"><span>Nº de lojas</span><input name="num_lojas" type="number" min={1} defaultValue={1} /></label>
            <label className="campo"><span>Segmento</span><select name="segmento" defaultValue=""><option value="">—</option>{Object.entries(SEGMENTOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="campo"><span>Temperatura</span><select name="temperatura" defaultValue="morno">{Object.entries(TEMPERATURAS).map(([k, t]) => <option key={k} value={k}>{t.nome}</option>)}</select></label>
          </div>
          <label className="campo"><span>Origem</span><input name="origem" placeholder="Ex.: Indicação, Site, Evento" /></label>
          <h2 style={{ marginTop: 8 }}>Contato principal</h2>
          <div className="grade g2">
            <label className="campo"><span>Nome</span><input name="contato" /></label>
            <label className="campo"><span>Cargo</span><input name="cargo" /></label>
            <label className="campo"><span>E-mail</span><input name="email" type="email" /></label>
            <label className="campo"><span>Celular (com DDD)</span><input name="whatsapp" placeholder="11 99999-0000" /></label>
          </div>
          <Enviar>Criar lead</Enviar>
        </FormAcao>
      </div>
    </>
  );
}
