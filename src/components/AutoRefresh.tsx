"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Atualiza a página periodicamente para refletir mudanças de status vindas do
// webhook (ex.: cobrança que acabou de ser paga), sem o usuário apertar F5.
export function AutoRefresh({ segundos = 15 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      router.refresh();
    }, segundos * 1000);
    return () => clearInterval(t);
  }, [router, segundos]);
  return null;
}
