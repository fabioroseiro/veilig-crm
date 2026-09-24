-- CRM Veilig — textos de WhatsApp e roteiros de ligação da cadência Frio (aprovados em 24/09/2026)
BEGIN;
INSERT INTO modelo_email (chave, nome, assunto, corpo, aprovado) VALUES
('frio_l4', 'Frio · toque 4 · dia +13 · ligação', '—',
'Objetivo: retomar os e-mails e buscar uma agenda.

1. Abertura: "Oi, [Nome], aqui é a Natália, da Veilig. Te mandei alguns e-mails sobre planos de manutenção para concessionárias. Você tem um minuto?"
2. Contexto em uma frase: "A ideia é a concessionária vender um plano com mensalidade fixa na entrega do veículo, para o cliente continuar voltando para as revisões."
3. Pergunta: "Hoje, depois da primeira revisão, vocês sentem que muitos clientes deixam de voltar?"
4. Pedido: "Em 20 minutos eu mostro quanto isso representa com os números da [Grupo]. Fica melhor terça ou quinta?"
5. Se não puder falar: "Sem problema. Qual o melhor horário para eu te ligar?"

Caixa postal: não deixe recado longo. Registre "não atendeu".', true),
('frio_w6', 'Frio · toque 6 · dia +20 · WhatsApp', '—',
'Oi, [Nome]! Aqui é a Natália, da Veilig. Te mandei alguns e-mails sobre planos de manutenção para a [Grupo]. Resumindo em uma linha: a concessionária vende um plano com mensalidade fixa, o cliente volta para as revisões e a loja recebe todo mês. Faz sentido conversarmos 20 minutos esta semana?', true),
('frio_l7', 'Frio · toque 7 · dia +25 · ligação', '—',
'Objetivo: pergunta objetiva e de baixo esforço.

1. Abertura: "Oi, [Nome], é a Natália, da Veilig. Vou ser rápida."
2. Pergunta: "Planos de manutenção para os clientes da [Grupo] é um assunto que faz sentido para vocês agora, ou é melhor eu voltar a falar em outro momento?"
3. Se sim: marcar os 20 minutos da simulação.
4. Se "outro momento": perguntar quando e usar "Pausar até" na ficha, com essa data.

Caixa postal: não deixe recado longo. Registre "não atendeu".', true),
('frio_l9', 'Frio · toque 9 · dia +40 · ligação', '—',
'Objetivo: terceira tentativa, com foco em achar a pessoa certa.

1. Abertura: "Oi, [Nome], é a Natália, da Veilig. Tentei falar com você algumas vezes sobre planos de manutenção."
2. Pergunta: "É você quem cuida do pós-venda na [Grupo], ou existe outra pessoa com quem eu deveria falar?"
3. Se for outra pessoa: pedir nome e contato, cadastrar como novo contato na ficha e marcar como principal.
4. Se for ele: "Posso te mandar o simulador para você ver os números com calma, sem compromisso?"

Caixa postal: não deixe recado longo. Registre "não atendeu".', true),
('frio_w11', 'Frio · toque 11 · dia +50 · WhatsApp', '—',
'Oi, [Nome]! Publicamos exemplos de planos de manutenção para o seu segmento, com o que cada formato cobre e mensalidades de referência: [Link dos planos]. Se quiser, adapto um deles para a realidade da [Grupo].', true)
ON CONFLICT (chave) DO NOTHING;
COMMIT;
