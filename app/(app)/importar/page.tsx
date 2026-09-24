import { lerConfig } from "@/lib/config";
import { importar } from "@/lib/acoes";
import { Importador } from "@/components/Importador";

export const dynamic = "force-dynamic";

export default async function Importar() {
  const cfg = await lerConfig();
  return (
    <>
      <div className="topo"><div><h1>Importar planilha</h1>
        <div className="muted">Aceita Excel (.xlsx) ou CSV. Para uma planilha do Google, use Arquivo → Fazer download → Microsoft Excel.</div></div></div>
      <Importador dominiosExcluidos={cfg.dominios_excluidos} importar={importar} />
    </>
  );
}
