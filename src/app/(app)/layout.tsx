import { Suspense } from "react";
import { Sidebar } from "@/components/Sidebar";
import { NavProgress } from "@/components/NavProgress";
import { FaixaVerComo } from "@/components/FaixaVerComo";
import { TourRaiz } from "@/components/tour/TourRaiz";

// Layout compartilhado das telas autenticadas. A Sidebar é renderizada UMA vez
// e permanece fixa entre navegações — só o conteúdo (children) troca. É isso que
// elimina o "pisca" do menu a cada clique. A NavProgress mostra uma barra de
// carregamento no topo durante a navegação (feedback de clique).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="layout">
      <Suspense fallback={null}>
        <NavProgress />
      </Suspense>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0 }}>
        <FaixaVerComo />
        <TourRaiz>{children}</TourRaiz>
      </div>
    </div>
  );
}
