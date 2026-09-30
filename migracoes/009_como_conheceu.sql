-- 009: como o lead conheceu a Veilig (respondido no site ou preenchido na ficha).
ALTER TABLE grupo ADD COLUMN IF NOT EXISTS como_conheceu text;
