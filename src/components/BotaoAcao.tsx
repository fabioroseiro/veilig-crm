"use client";

import { useFormStatus } from "react-dom";

// Botão de submit que mostra estado "processando" automaticamente enquanto a
// server action do <form> pai está em andamento. Usa useFormStatus (precisa
// estar DENTRO de um <form>). Assim os botões de ação (inativar, resetar, etc.)
// dão feedback de clique sem precisar de estado manual.
export function BotaoAcao({
  children,
  textoProcessando = "Processando…",
  className = "btn-ghost",
  style,
}: {
  children: React.ReactNode;
  textoProcessando?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} style={style} disabled={pending}>
      {pending ? textoProcessando : children}
    </button>
  );
}
