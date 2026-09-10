-- Impede dias abertos com abertura/fechamento nulos
UPDATE barbeiro_horarios
SET fechado = true
WHERE fechado = false
  AND (abertura IS NULL OR fechamento IS NULL);

ALTER TABLE barbeiro_horarios
  DROP CONSTRAINT IF EXISTS check_horarios_validos;

ALTER TABLE barbeiro_horarios
  ADD CONSTRAINT check_horarios_validos
  CHECK (
    fechado = true
    OR (abertura IS NOT NULL AND fechamento IS NOT NULL)
  );
