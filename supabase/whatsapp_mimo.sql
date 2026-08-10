-- MiMo columns on whatsapp_secrets — run after whatsapp_secrets.sql

CREATE TABLE IF NOT EXISTS whatsapp_secrets (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  instance_token text,
  base_url text,
  mimo_api_key text,
  mimo_base_url text DEFAULT 'https://token-plan-sgp.xiaomimimo.com/v1',
  mimo_model text DEFAULT 'mimo-v2.5-pro',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE whatsapp_secrets ENABLE ROW LEVEL SECURITY;

ALTER TABLE whatsapp_secrets
  ADD COLUMN IF NOT EXISTS mimo_api_key text,
  ADD COLUMN IF NOT EXISTS mimo_base_url text,
  ADD COLUMN IF NOT EXISTS mimo_model text;

UPDATE whatsapp_secrets
SET
  mimo_base_url = COALESCE(NULLIF(mimo_base_url, ''), 'https://token-plan-sgp.xiaomimimo.com/v1'),
  mimo_model = COALESCE(NULLIF(mimo_model, ''), 'mimo-v2.5-pro'),
  updated_at = now()
WHERE id = 1;

INSERT INTO whatsapp_secrets (id, base_url, mimo_base_url, mimo_model)
SELECT
  1,
  'https://barberai.uazapi.com',
  'https://token-plan-sgp.xiaomimimo.com/v1',
  'mimo-v2.5-pro'
WHERE NOT EXISTS (SELECT 1 FROM whatsapp_secrets WHERE id = 1);

-- Set MIMO key privately (do not commit real tokens):
-- UPDATE whatsapp_secrets SET mimo_api_key = 'tp-...' WHERE id = 1;
