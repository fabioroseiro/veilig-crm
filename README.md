# CRM Veilig

Funil comercial da Veilig: leads (grupos), contatos, lojas, histórico, fila de ações do dia
e importação de planilhas. Next.js 15 + Postgres (Neon).

## Variáveis de ambiente (Vercel)

| Variável | Tipo | O que é |
|---|---|---|
| `DATABASE_URL` | Secret | Connection string do projeto `veilig-crm` no Neon |
| `SESSION_SECRET` | Secret | Texto aleatório com 32+ caracteres (assina a sessão) |
| `SETUP_TOKEN` | Secret | Código para criar os usuários em `/primeiro-acesso`. Apague depois de criar os dois acessos |
| `ZOHO_SENHA_NATALIA` | Secret | Senha de aplicativo do Zoho da caixa natalia@vendas.veilig.com.br (envio e leitura) |
| `CRON_SECRET` | Secret | Protege a rotina automática `/api/cron/cadencias` |
| `APP_URL` | Config | `https://crm.veilig.com.br` (usado no link de descadastro) |

## Banco

Rodar as migrações em ordem, uma vez cada, no SQL Editor do Neon: `001_inicial.sql`, `002_cadencias.sql`.

## Cadência de e-mail

- Plano de toques: `lib/plano.ts`. Motor: `lib/cadencia.ts` (avança toques, envia pelo Zoho, lê respostas e devoluções por IMAP).
- A Vercel Cron chama `/api/cron/cadencias` a cada 20 minutos, dias úteis, 8h–18h (`vercel.json`). Requer plano Pro no time da Vercel.
- Nada sai com o "Envio automático" desligado (tela Cadências) ou com modelo não aprovado (tela Modelos).

## Regras que vivem no código

- `lib/regras.ts`: etapas e probabilidades, porte (A/B/C), potencial recorrente (porte A usa as lojas do piloto),
  etapa que passa o lead para o closer (Proposta enviada) e etapa que deixa o lead Quente (Agenda marcada).
- `lib/importacao.ts`: leitura das planilhas. Lojas com o mesmo WhatsApp, e-mail ou responsável viram um grupo só.
- Preços dos pacotes, lojas do piloto, e-mail do closer e domínios excluídos ficam em Configurações (tabela `config`).
