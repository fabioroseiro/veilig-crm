import { randomInt } from "crypto";

/**
 * SENHA PROVISÓRIA — aleatória, não derivada do CPF.
 *
 * Antes era `cpf.slice(0, 5)`. Isso significava que qualquer pessoa que
 * soubesse o CPF de um cliente entrava na conta dele: CPF não é segredo — está
 * em nota fiscal, cadastro de loja, ficha de oficina.
 *
 * Agora é sorteada. O alfabeto exclui caracteres que se confundem quando
 * alguém lê a senha em voz alta ou copia de um papel: O/0, I/l/1, e as letras
 * minúsculas que viram maiúsculas na digitação do celular. Sobra um conjunto
 * pequeno mas inequívoco.
 *
 * randomInt vem de `crypto` — Math.random() é previsível e não serve para
 * gerar credencial.
 */
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function gerarSenhaProvisoria(tamanho = 8): string {
  let senha = "";
  for (let i = 0; i < tamanho; i++) {
    senha += ALFABETO[randomInt(0, ALFABETO.length)];
  }
  // grupos de 4 para facilitar a leitura no balcão: "H7K2-M9PX"
  return senha.length === 8 ? `${senha.slice(0, 4)}-${senha.slice(4)}` : senha;
}

/**
 * Força mínima para senha escolhida pelo usuário.
 *
 * Sem rate limiting, exigir senha longa é a única defesa. Com rate limiting,
 * podemos ser razoáveis: 8 caracteres e nada de sequência óbvia. Regras
 * elaboradas demais empurram as pessoas para "Senha@123" e para o papelzinho
 * colado no monitor.
 */
export function validarForcaSenha(senha: string, dados: { cpf?: string; email?: string } = {}): string | null {
  const s = String(senha ?? "");
  if (s.length < 8) return "A senha precisa de pelo menos 8 caracteres.";

  if (/^(.)\1+$/.test(s)) return "A senha não pode ser um caractere repetido.";

  const sequencias = ["12345678", "87654321", "abcdefgh", "qwertyui"];
  const min = s.toLowerCase();
  if (sequencias.some((seq) => seq.includes(min) || min.includes(seq))) {
    return "Escolha uma senha menos previsível.";
  }

  const comuns = ["senha", "password", "veilig", "123456", "admin"];
  if (comuns.some((c) => min.includes(c))) {
    return "Essa senha é fácil de adivinhar. Escolha outra.";
  }

  // O CPF é o dado que mais aparece por aí — não pode virar senha.
  const cpfDigitos = String(dados.cpf ?? "").replace(/\D/g, "");
  if (cpfDigitos.length >= 5 && s.replace(/\D/g, "").includes(cpfDigitos.slice(0, 5))) {
    return "A senha não pode conter parte do seu CPF.";
  }

  if (dados.email) {
    const usuario = dados.email.split("@")[0]?.toLowerCase();
    if (usuario && usuario.length >= 4 && min.includes(usuario)) {
      return "A senha não pode conter seu e-mail.";
    }
  }

  return null;
}
