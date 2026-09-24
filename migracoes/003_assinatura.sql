-- CRM Veilig — WhatsApp na assinatura dos e-mails da cadência
UPDATE config
   SET valor = jsonb_set(valor, '{whatsapp}', '"(11) 98640-5185"')
 WHERE chave = 'remetente';

-- Confira: deve mostrar e-mail, nome e whatsapp
SELECT valor FROM config WHERE chave = 'remetente';
