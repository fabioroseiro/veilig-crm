"use client";

import { useState } from "react";

/**
 * Busca de endereço por CEP, compartilhada entre os formulários.
 *
 * Existe como hook porque a mesma necessidade apareceu em dois lugares
 * (cliente e loja) e vai aparecer em mais. Duas cópias da mesma função
 * divergiriam: uma ganharia tratamento de erro que a outra não teria.
 *
 * Falha em SILÊNCIO de propósito. Se o serviço estiver fora do ar ou o CEP não
 * existir, quem preenche digita à mão — travar um cadastro porque um serviço
 * externo gratuito está instável seria desproporcional.
 */
export type EnderecoCep = {
  logradouro?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
};

export function usarCep(aoEncontrar: (e: EnderecoCep) => void) {
  const [buscando, setBuscando] = useState(false);
  const [naoEncontrado, setNaoEncontrado] = useState(false);

  async function buscar(cep: string) {
    const digitos = String(cep ?? "").replace(/\D/g, "");
    setNaoEncontrado(false);
    // Só busca com o CEP completo: consultar a cada tecla geraria dezenas de
    // requisições por preenchimento.
    if (digitos.length !== 8) return;

    setBuscando(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digitos}/json/`, {
        signal: AbortSignal.timeout(4000),
      });
      const d = await r.json();
      if (d?.erro) {
        setNaoEncontrado(true);
        return;
      }
      aoEncontrar({
        logradouro: d.logradouro || undefined,
        bairro: d.bairro || undefined,
        cidade: d.localidade || undefined,
        uf: d.uf || undefined,
      });
    } catch {
      // sem internet, timeout ou serviço fora: segue o preenchimento manual
    } finally {
      setBuscando(false);
    }
  }

  return { buscar, buscando, naoEncontrado };
}
