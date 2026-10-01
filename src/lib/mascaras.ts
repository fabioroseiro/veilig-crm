// Máscaras de formatação (aplicadas enquanto o usuário digita) e validações
// de formato/tamanho. As máscaras só formatam a exibição; ao salvar, o backend
// normaliza (tira pontuação) como já fazia.

const digitos = (s: string) => (s || "").replace(/\D/g, "");

// CPF: 000.000.000-00
export function mascaraCpf(v: string): string {
  const d = digitos(v).slice(0, 11);
  let r = d;
  if (d.length > 3) r = d.slice(0, 3) + "." + d.slice(3);
  if (d.length > 6) r = d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6);
  if (d.length > 9) r = d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6, 9) + "-" + d.slice(9);
  return r;
}
// A validação real do CPF (dígitos verificadores) está no fim deste arquivo,
// em cpfValido(). A versão antiga só conferia o comprimento.

// CNPJ: 00.000.000/0000-00
/**
 * CNPJ formatado para EXIBIÇÃO: 00.000.000/0001-91 ou 12.ABC.345/01DE-35.
 *
 * Precisa preservar letras, senão um CNPJ alfanumérico perde caracteres e a
 * pontuação nem é aplicada — foi o que acontecia nas listagens: uma mostrava
 * só os números, a outra o valor cru sem pontos.
 *
 * Devolve o valor original quando não tiver 14 caracteres, em vez de tentar
 * pontuar algo incompleto.
 */
export function formatarCnpjExibicao(cnpj: string | null | undefined): string {
  const c = String(cnpj ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (!c) return "—";
  if (c.length !== 14) return String(cnpj);
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

/**
 * Máscara do CNPJ. Preserva LETRAS: desde 31/07/2026 as 12 primeiras posições
 * aceitam A-Z. Usar só dígitos aqui apagava silenciosamente as letras
 * enquanto a pessoa digitava — o campo recusava um CNPJ válido sem dizer por
 * quê. A pontuação de exibição é a mesma de sempre.
 */
export function mascaraCnpj(v: string): string {
  const d = String(v ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 14);
  let r = d;
  if (d.length > 2) r = d.slice(0, 2) + "." + d.slice(2);
  if (d.length > 5) r = d.slice(0, 2) + "." + d.slice(2, 5) + "." + d.slice(5);
  if (d.length > 8) r = d.slice(0, 2) + "." + d.slice(2, 5) + "." + d.slice(5, 8) + "/" + d.slice(8);
  if (d.length > 12) r = d.slice(0, 2) + "." + d.slice(2, 5) + "." + d.slice(5, 8) + "/" + d.slice(8, 12) + "-" + d.slice(12);
  return r;
}
// A validação real do CNPJ (dígitos verificadores, formatos numérico e
// alfanumérico) está em loja-validation.ts. Esta versão só conferia tamanho.

// Telefone: (11) 90000-0000 (celular, 11 díg.) ou (11) 3000-0000 (fixo, 10 díg.)
export function mascaraTelefone(v: string): string {
  const d = digitos(v).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return "(" + d;
  if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
  if (d.length <= 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
  return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
}
export const telefoneValido = (v: string) => {
  const n = digitos(v).length;
  return n === 10 || n === 11;
};

// CEP: 00000-000
export function mascaraCep(v: string): string {
  const d = digitos(v).slice(0, 8);
  if (d.length > 5) return d.slice(0, 5) + "-" + d.slice(5);
  return d;
}
export const cepValido = (v: string) => digitos(v).length === 8;

// Placa: aceita antiga (ABC-1234) e Mercosul (ABC1D23). Mostra em maiúsculas.
// Sem hífen automático (Mercosul não usa); o backend normaliza.
export function mascaraPlaca(v: string): string {
  return (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}
export const placaValida = (v: string) => {
  const p = mascaraPlaca(v);
  // antiga: 3 letras + 4 números | Mercosul: 3 letras + 1 nº + 1 letra + 2 nº
  return /^[A-Z]{3}[0-9]{4}$/.test(p) || /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(p);
};

// E-mail: validação de formato (não há "máscara" de digitação)
export const emailValido = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((v || "").trim());

// Formata a placa para EXIBIÇÃO com hífen depois dos 3 primeiros caracteres.
// Ex.: "ABC1234" → "ABC-1234"; "ABC1D23" (Mercosul) → "ABC-1D23".
// A placa é guardada sem hífen no banco; esta função só embeleza a exibição.
export function formatarPlacaExibicao(placa: string): string {
  const p = (placa || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (p.length <= 3) return p;
  return p.slice(0, 3) + "-" + p.slice(3);
}

/**
 * Valida os dígitos verificadores do CPF.
 *
 * Antes só conferíamos o comprimento (11 dígitos), e um CPF estruturalmente
 * inválido passava batido — a venda era salva e só quebrava lá na Asaas, que
 * valida de verdade. O vendedor via "falha na cobrança" sem entender o motivo.
 * Melhor falhar no formulário, na hora, com o campo destacado.
 */
export function cpfValido(valor: string): boolean {
  const cpf = String(valor).replace(/\D/g, "");
  if (cpf.length !== 11) return false;
  // sequências repetidas (000.000.000-00, 111.111.111-11…) passam na conta dos
  // dígitos mas não são CPFs reais
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digito = (ate: number) => {
    let soma = 0;
    let peso = ate + 1;
    for (let i = 0; i < ate; i++) soma += Number(cpf[i]) * peso--;
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
}


/**
 * Chassi (VIN): 17 caracteres alfanuméricos, sem I, O e Q.
 *
 * Essas três letras são excluídas do padrão para não serem confundidas com 1 e
 * 0 — e é exatamente esse o erro que alguém comete ao transcrever do documento.
 *
 * Conferimos apenas o FORMATO, não o dígito verificador: o cálculo do VIN é
 * obrigatório nos EUA e opcional no Brasil, então validar o dígito recusaria
 * chassis legítimos de veículos nacionais.
 */
export function mascaraChassi(v: string): string {
  return String(v ?? "")
    .toUpperCase()
    .replace(/[^0-9A-HJ-NPR-Z]/g, "")
    .slice(0, 17);
}

export function chassiValido(v: string): boolean {
  const c = mascaraChassi(v);
  return c.length === 17;
}

/** Exibição: agrupa em blocos para facilitar a conferência visual. */
export function formatarChassiExibicao(v: string | null | undefined): string {
  const c = mascaraChassi(String(v ?? ""));
  if (c.length !== 17) return String(v ?? "—");
  return `${c.slice(0, 3)} ${c.slice(3, 9)} ${c.slice(9, 11)} ${c.slice(11)}`;
}
