-- CRM Veilig — textos da cadência Morno (aprovados em 24/09/2026)
BEGIN;
INSERT INTO modelo_email (chave, nome, assunto, corpo, aprovado) VALUES
('morno_w1', 'Morno · toque 1 · dia 0 · WhatsApp', '—',
'Oi, [Nome], tudo bem? Aqui é a Natália, da Veilig. Um dado da nossa base: entre 6% e 10% dos clientes que compram um veículo aderem ao plano de manutenção, conforme o valor da mensalidade. Se quiser ver quanto isso representaria na [Grupo], o simulador faz a conta em um minuto: veilig.com.br/simulador', true),
('morno_w2', 'Morno · toque 2 · dia +5 · WhatsApp', '—',
'Sem pressa, [Nome]! Só um detalhe que faz diferença: a simulação que eu faço com vocês usa os números da própria [Grupo] (lojas, vendas e ticket de revisão), não uma média de mercado. Em 20 minutos vocês saem com o potencial de receita e o prazo de retorno do investimento para o seu cenário.', true),
('morno_w3', 'Morno · toque 3 · dia +8 · WhatsApp', '—',
'Oi, [Nome]! Para dar uma ordem de grandeza: numa concessionária com 3 lojas, 40 veículos vendidos por mês em cada uma e revisão de R$ 900, o simulador aponta cerca de R$ 648 mil por ano em revisões que saem pela porta. Quer que eu faça essa conta com os números da [Grupo]?', true),
('morno_4', 'Morno · toque 4 · dia +14 · e-mail (ou WhatsApp, sem e-mail)', 'O que as concessionárias perguntam antes de começar',
'Olá, [Nome]. Reunimos as perguntas que mais ouvimos de concessionárias antes de começar com planos de manutenção: se é seguro, quem presta o serviço, como a loja recebe e o que acontece se o cliente atrasar. As respostas estão em veilig.com.br/perguntas-frequentes.

Sem compromisso nenhum. Se surgir qualquer dúvida, é só responder.', true),
('morno_w5', 'Morno · toque 5 · dia +20 · WhatsApp', '—',
'Oi, [Nome], me conta uma coisa: hoje, o que mais pesa para vocês avaliarem uma frente nova como essa? Tempo, prioridade ou alguma dúvida sobre o retorno?', true),
('morno_w6', 'Morno · toque 6 · dia +26 · WhatsApp', '—',
'[Nome], uma opção para tirar o risco da equação: podemos rodar um piloto controlado, com escopo pequeno, para vocês verem funcionando na prática antes de uma decisão maior. Vale marcarmos 20 minutos para desenhar como seria na [Grupo]?', true),
('morno_l7', 'Morno · toque 7 · dia +32 · ligação', '—',
'Objetivo: retomar a proposta de piloto controlado.

1. Abertura: "Oi, [Nome], é a Natália, da Veilig. Te mandei a ideia de um piloto controlado. Você tem um minuto?"
2. Pergunta: "Faria sentido testar em uma ou duas lojas da [Grupo], com prazo definido, antes de qualquer decisão maior?"
3. Se sim: marcar 20 minutos para desenhar o piloto. Se não: perguntar o que impede e registrar.

Caixa postal: não deixe recado longo. Registre "não atendeu".', true),
('morno_w8', 'Morno · toque 8 · dia +38 · WhatsApp', '—',
'Oi, [Nome]! Sei que a rotina de concessionária não dá trégua. Se ajudar, deixo tudo pronto para vocês avaliarem com calma assim que a agenda aliviar.', true),
('morno_w9', 'Morno · toque 9 · dia +45 · WhatsApp', '—',
'Oi, [Nome], tudo bem? Passando para saber se conseguimos evoluir na conversa sobre os planos de manutenção. Se colocarmos em andamento agora, a [Grupo] pode começar a oferecer os planos já nas próximas semanas.', true),
('morno_w10', 'Morno · toque 10 · dia +52 · WhatsApp', '—',
'Oi, [Nome]! Se uma reunião agora for difícil, você ou alguém do seu time pode fazer a simulação direto pelo site, em um minuto: veilig.com.br/simulador. O resultado chega por e-mail e dá para levar aos diretores. Se quiser, depois eu reviso os números com vocês.', true),
('morno_w11', 'Morno · toque 11 · dia +60 · WhatsApp', '—',
'Oi, [Nome], tudo bem por aí? Só validando se os planos de manutenção ainda fazem sentido para este momento da [Grupo].', true),
('morno_encerramento', 'Morno · encerramento (toque 12 no A, 9 no B, 7 no C) · e-mail ou WhatsApp', 'A porta segue aberta',
'Oi, [Nome]! Vou dar um tempo para vocês pensarem com calma, mas a porta segue aberta. Se o cenário mudar, é só me chamar que retomamos rapidinho.', true)
ON CONFLICT (chave) DO NOTHING;
COMMIT;
