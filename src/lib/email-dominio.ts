/**
 * Verifica se o DOMÍNIO de um e-mail existe e recebe mensagens.
 *
 * Por que não basta a validação de formato: "fulano@yahoo.com.brsssss" é
 * sintaticamente perfeito — o padrão de e-mail aceita qualquer sequência
 * depois do ponto. Só o DNS sabe que esse domínio não existe.
 *
 * O que isto pega: erro de digitação no domínio, que é o caso comum no balcão
 * (dedo escorregando, domínio inventado).
 *
 * O que NÃO pega, e é importante ter claro: se a CAIXA existe. "joao@yahoo.com"
 * passa mesmo que não haja ninguém com esse endereço. Saber isso exigiria
 * enviar um e-mail de confirmação — que é a verificação de verdade e está no
 * roadmap junto da fundação de e-mail.
 *
 * Usa DNS over HTTPS porque o runtime da Vercel não expõe resolvedor de DNS
 * nativo em todas as rotas.
 */
export async function dominioDeEmailExiste(email: string): Promise<boolean> {
  const dominio = String(email ?? "").split("@")[1]?.trim().toLowerCase();
  if (!dominio || !dominio.includes(".")) return false;

  try {
    // Registro MX = servidor de e-mail. É o que responde "este domínio recebe
    // mensagens", que é mais específico do que só "existe".
    const r = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(dominio)}&type=MX`,
      { signal: AbortSignal.timeout(3000), cache: "no-store" }
    );
    if (!r.ok) return true; // serviço fora: não trava o cadastro
    const d = await r.json();

    // Status 3 = NXDOMAIN, o domínio não existe. É o caso do ".com.brsssss".
    if (d?.Status === 3) return false;
    if (Array.isArray(d?.Answer) && d.Answer.length > 0) return true;

    // Sem MX o domínio ainda pode receber e-mail pelo registro A — é o padrão
    // antigo, e domínios de empresa pequena às vezes estão assim. Cai para a
    // consulta A abaixo em vez de recusar.

    // Sem MX, alguns domínios ainda recebem e-mail pelo registro A. Consulta
    // de novo antes de recusar — recusar um e-mail válido é pior que aceitar
    // um duvidoso.
    const r2 = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(dominio)}&type=A`,
      { signal: AbortSignal.timeout(3000), cache: "no-store" }
    );
    if (!r2.ok) return true;
    const d2 = await r2.json();
    if (d2?.Status === 3) return false;
    return Array.isArray(d2?.Answer) && d2.Answer.length > 0;
  } catch {
    // Timeout ou rede: deixa passar. Bloquear cadastro por instabilidade de
    // DNS seria desproporcional ao problema que estamos evitando.
    return true;
  }
}
