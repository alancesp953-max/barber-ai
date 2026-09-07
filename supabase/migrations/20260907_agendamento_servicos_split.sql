-- Itens de comanda (múltiplos serviços por agendamento)
CREATE TABLE IF NOT EXISTS agendamento_servicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id UUID NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  servico_id UUID NOT NULL REFERENCES servicos(id),
  preco NUMERIC(10, 2) NOT NULL,
  duracao_minutos INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agendamento_servicos_agendamento
  ON agendamento_servicos (agendamento_id);

ALTER TABLE agendamento_servicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agendamento_servicos_auth_all" ON agendamento_servicos;
CREATE POLICY "agendamento_servicos_auth_all"
  ON agendamento_servicos
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "agendamento_servicos_public_read" ON agendamento_servicos;
CREATE POLICY "agendamento_servicos_public_read"
  ON agendamento_servicos
  FOR SELECT
  USING (true);

-- Backfill: um item por agendamento que já tem servico_id
INSERT INTO agendamento_servicos (agendamento_id, servico_id, preco, duracao_minutos)
SELECT
  a.id,
  a.servico_id,
  COALESCE(a.valor, s.preco, 0),
  s.duracao_minutos
FROM agendamentos a
JOIN servicos s ON s.id = a.servico_id
WHERE a.servico_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agendamento_servicos x WHERE x.agendamento_id = a.id
  );
