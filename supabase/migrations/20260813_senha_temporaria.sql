-- Senha temporária visível no painel admin (não é o hash do Auth)
ALTER TABLE barbeiros
  ADD COLUMN IF NOT EXISTS senha_temporaria TEXT;

UPDATE barbeiros
SET senha_temporaria = 'BarberAI123!'
WHERE user_id IS NOT NULL
  AND (senha_temporaria IS NULL OR trim(senha_temporaria) = '');
