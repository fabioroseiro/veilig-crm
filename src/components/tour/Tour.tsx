"use client";

import { useEffect } from "react";
import { useTour, type PassoTour } from "./TourProvider";

/**
 * Registra o tour de uma tela (ou de um trecho dela).
 *
 * Pode ficar dentro de um bloco condicional: o tour da confirmação da venda,
 * por exemplo, só é montado quando o painel de confirmação aparece — e é nesse
 * momento que ele começa.
 */
export function Tour({ id, passos }: { id: string; passos: PassoTour[] }) {
  const tour = useTour();
  useEffect(() => {
    if (!tour) return;
    const desfazer = tour.registrar({ id, passos });
    tour.pedirInicio(id);
    return desfazer;
    // passos é estático por tela; o id identifica o tour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return null;
}
