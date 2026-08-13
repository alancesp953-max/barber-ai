-- Soft-delete de serviços (preserva FK em agendamentos)
ALTER TABLE servicos
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;
