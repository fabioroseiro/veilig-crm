# CRM Veilig

Funil comercial da Veilig: leads (grupos), contatos, lojas, histórico, fila de ações do dia
e importação de planilhas. Next.js 15 + Postgres (Neon).

## Variáveis de ambiente (Vercel)

| Variável | Tipo | O que é |
|---|---|---|
| `DATABASE_URL` | Secret | Connection string do projeto `veilig-crm` no Neon |
| `SESSION_SECRET` | Secret | Texto aleatório com 32+ caracteres (assina a sessão) |
| `SETUP_TOKEN` | Secret | Código para criar os usuários em `/primeiro-acesso`. Apague depois de criar os dois acessos |

## Banco

Rodar `migracoes/001_inicial.sql` uma vez no SQL Editor do Neon, antes do primeiro deploy.

## Regras que vivem no código

- `lib/regras.ts`: etapas e probabilidades, porte (A/B/C), potencial recorrente (porte A usa as lojas do piloto),
  etapa que passa o lead para o closer (Proposta enviada) e etapa que deixa o lead Quente (Agenda marcada).
- `lib/importacao.ts`: leitura das planilhas. Lojas com o mesmo WhatsApp, e-mail ou responsável viram um grupo só.
- Preços dos pacotes, lojas do piloto, e-mail do closer e domínios excluídos ficam em Configurações (tabela `config`).
