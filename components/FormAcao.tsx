"use client";
import { createContext, startTransition, useActionState, useContext, useEffect, useRef } from "react";

type Estado = { ok?: string; erro?: string } | undefined | null;
const Pendente = createContext(false);

/**
 * Formulário ligado a uma ação do servidor, com mensagem de sucesso/erro.
 * Não limpa os campos quando dá erro (o React limparia por padrão); só limpa
 * no sucesso quando "limpar" é pedido.
 */
export function FormAcao({ acao, children, className, limpar }: {
  acao: (e: Estado, f: FormData) => Promise<Estado>;
  children: React.ReactNode; className?: string; limpar?: boolean;
}) {
  const [estado, enviar, pendente] = useActionState(acao, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (limpar && estado?.ok) ref.current?.reset(); }, [estado, limpar]);
  return (
    <form ref={ref} className={className}
      onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); startTransition(() => enviar(f)); }}>
      <Pendente.Provider value={pendente}>{children}</Pendente.Provider>
      {estado?.erro && <div className="aviso erro" role="alert">{estado.erro}</div>}
      {estado?.ok && <div className="aviso ok" role="status">{estado.ok}</div>}
    </form>
  );
}

export function Enviar({ children, className = "btn btn-ink" }: { children: React.ReactNode; className?: string }) {
  const pendente = useContext(Pendente);
  return <button className={className} type="submit" disabled={pendente}>{pendente ? "Aguarde…" : children}</button>;
}
