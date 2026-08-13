-- Avaliações de clientes (WhatsApp) → média em barbeiros.avaliacao

ALTER TABLE barbeiros
  ADD COLUMN IF NOT EXISTS avaliacao_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS rating_asked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS avaliacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id UUID NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  barbeiro_id UUID NOT NULL REFERENCES barbeiros(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  nota SMALLINT NOT NULL CHECK (nota BETWEEN 1 AND 5),
  origem TEXT NOT NULL DEFAULT 'whatsapp',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agendamento_id)
);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_barbeiro ON avaliacoes(barbeiro_id);

ALTER TABLE avaliacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura autenticada avaliacoes" ON avaliacoes;
CREATE POLICY "Leitura autenticada avaliacoes" ON avaliacoes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Escrita autenticada avaliacoes" ON avaliacoes;
CREATE POLICY "Escrita autenticada avaliacoes" ON avaliacoes
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
