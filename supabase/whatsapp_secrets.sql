-- WhatsApp UAZAPI credentials (service role only via RLS with no policies)
-- Fill values in SQL Editor or store as Edge secrets instead of committing production tokens.

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

INSERT INTO whatsapp_secrets (id, base_url, mimo_base_url, mimo_model)
VALUES (
  1,
  'https://barberai.uazapi.com',
  'https://token-plan-sgp.xiaomimimo.com/v1',
  'mimo-v2.5-pro'
)
ON CONFLICT (id) DO UPDATE SET
  base_url = COALESCE(whatsapp_secrets.base_url, EXCLUDED.base_url),
  mimo_base_url = COALESCE(whatsapp_secrets.mimo_base_url, EXCLUDED.mimo_base_url),
  mimo_model = COALESCE(whatsapp_secrets.mimo_model, EXCLUDED.mimo_model),
  updated_at = now();

-- Then set secrets (run privately, do not commit):
-- UPDATE whatsapp_secrets SET
--   instance_token = 'TOKEN_UAZAPI_INSTANCIA',
--   mimo_api_key = 'tp-...'
-- WHERE id = 1;
