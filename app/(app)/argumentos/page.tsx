import Link from "next/link";
import { q1 } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth";
import { KitConversa } from "@/components/KitConversa";

export const dynamic = "force-dynamic";

/** Kit de conversa: pitch, perguntas, dados, WhatsApp e objeções. Aberto da ficha, vem preenchido com o lead. */
export default async function Argumentos({ searchParams }: { searchParams: Promise<{ grupo?: string }> }) {
  const u = await exigirUsuario();
  const { grupo } = await searchParams;
  type Lead = { id: string; grupo: string; nome: string | null; whatsapp: string | null; segmento: string | null };
  let lead: Lead | null = null;
  if (grupo && /^[0-9a-f-]{36}$/.test(grupo)) {
    lead = await q1<Lead>(
      `SELECT g.id, g.nome AS grupo, c.nome, c.whatsapp, g.segmento
         FROM grupo g LEFT JOIN contato c ON c.grupo_id = g.id AND c.principal WHERE g.id = $1`, [grupo]);
  }
  const eu = u.nome.split(" ")[0];
  return (
    <>
      <div className="topo">
        <div>
          <h1>Argumentos</h1>
          <div className="muted" style={{ fontSize: 14 }}>
            {lead ? <>Preenchido para <Link href={`/grupos/${lead.id}`}>{lead.grupo}</Link>{lead.nome ? ` · ${lead.nome}` : ""}</> : "Abra pela ficha de um lead para vir com nome e grupo preenchidos."}
          </div>
        </div>
      </div>
      <KitConversa eu={eu} lead={lead ? { grupo: lead.grupo, nome: lead.nome, whatsapp: lead.whatsapp, segmento: lead.segmento } : null} />
    </>
  );
}
