-- Dedup inbound WhatsApp + lock por telefone
CREATE TABLE IF NOT EXISTS whatsapp_processed_messages (
  messageid TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_processed_created
  ON whatsapp_processed_messages (created_at);

CREATE OR REPLACE FUNCTION lock_whatsapp_phone(p_phone TEXT)
RETURNS BOOLEAN
LANGUAGE sql
AS $$
  SELECT pg_try_advisory_lock(hashtext('wa-' || coalesce(p_phone, '')));
$$;

CREATE OR REPLACE FUNCTION unlock_whatsapp_phone(p_phone TEXT)
RETURNS BOOLEAN
LANGUAGE sql
AS $$
  SELECT pg_advisory_unlock(hashtext('wa-' || coalesce(p_phone, '')));
$$;

GRANT EXECUTE ON FUNCTION lock_whatsapp_phone(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION unlock_whatsapp_phone(TEXT) TO service_role;
GRANT ALL ON TABLE whatsapp_processed_messages TO service_role;
