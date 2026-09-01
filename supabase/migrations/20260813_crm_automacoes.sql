-- Automações CRM WhatsApp: ausência + aniversário

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS data_nascimento DATE,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE configuracoes
  ADD COLUMN IF NOT EXISTS auto_ausencia_ativo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_ausencia_dias INTEGER NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS auto_ausencia_mensagem TEXT,
  ADD COLUMN IF NOT EXISTS auto_aniversario_ativo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_aniversario_mensagem TEXT;

CREATE TABLE IF NOT EXISTS automacao_envios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('ausencia', 'aniversario')),
  referencia TEXT NOT NULL,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cliente_id, tipo, referencia)
);

CREATE INDEX IF NOT EXISTS idx_automacao_envios_tipo ON automacao_envios(tipo, enviado_em);
CREATE INDEX IF NOT EXISTS idx_clientes_nascimento ON clientes(data_nascimento)
  WHERE data_nascimento IS NOT NULL;

ALTER TABLE automacao_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura autenticada automacao_envios" ON automacao_envios;
CREATE POLICY "Leitura autenticada automacao_envios" ON automacao_envios
  FOR SELECT TO authenticated USING (true);

-- Escrita apenas via service role (cron / edge); sem policy de INSERT para authenticated
