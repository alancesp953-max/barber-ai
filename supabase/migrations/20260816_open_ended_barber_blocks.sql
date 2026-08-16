-- Afastamento sem previsão de retorno.
-- NULL em fim representa um bloqueio ativo até ser removido manualmente.

ALTER TABLE barbeiro_bloqueios
  ALTER COLUMN fim DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_barbeiro_bloqueios_open_ended
  ON barbeiro_bloqueios (barbeiro_id, inicio)
  WHERE fim IS NULL;

DO $$
DECLARE
  v_function TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_function
  FROM pg_proc p
  WHERE p.proname = 'get_available_slots'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_data date, p_servico_id uuid, p_barbeiro_id uuid';

  IF v_function IS NULL THEN
    RAISE EXCEPTION 'Função get_available_slots não encontrada';
  END IF;

  v_function := replace(
    v_function,
    'AND bl.fim > v_slot_start',
    'AND (bl.fim IS NULL OR bl.fim > v_slot_start)'
  );

  EXECUTE v_function;
END;
$$;
