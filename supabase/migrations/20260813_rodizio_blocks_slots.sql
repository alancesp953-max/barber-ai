-- Rodízio, ativo, horários/bloqueios do barbeiro + get_available_slots v3

ALTER TABLE barbeiros
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ordem_rodizio INTEGER;

-- Preenche ordem_rodizio para quem ainda não tem
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY nome) AS rn
  FROM barbeiros
  WHERE ordem_rodizio IS NULL
)
UPDATE barbeiros b
SET ordem_rodizio = ranked.rn
FROM ranked
WHERE b.id = ranked.id;

UPDATE barbeiros SET ordem_rodizio = 1 WHERE ordem_rodizio IS NULL;

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS valor NUMERIC(12, 2);

CREATE TABLE IF NOT EXISTS barbeiro_horarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbeiro_id UUID NOT NULL REFERENCES barbeiros(id) ON DELETE CASCADE,
  dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  abertura TIME,
  fechamento TIME,
  fechado BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (barbeiro_id, dia_semana)
);

CREATE TABLE IF NOT EXISTS barbeiro_bloqueios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbeiro_id UUID NOT NULL REFERENCES barbeiros(id) ON DELETE CASCADE,
  inicio TIMESTAMPTZ NOT NULL,
  fim TIMESTAMPTZ NOT NULL,
  motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim > inicio)
);

CREATE INDEX IF NOT EXISTS idx_barbeiro_bloqueios_barbeiro_inicio
  ON barbeiro_bloqueios (barbeiro_id, inicio);

CREATE INDEX IF NOT EXISTS idx_barbeiros_ordem_rodizio
  ON barbeiros (ordem_rodizio);

-- Slots considerando horário da loja (ou do barbeiro), bloqueios e só ativos
CREATE OR REPLACE FUNCTION get_available_slots(
  p_data DATE,
  p_servico_id UUID,
  p_barbeiro_id UUID DEFAULT NULL
)
RETURNS TABLE (horario TEXT)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_duracao INTEGER;
  v_day_key TEXT;
  v_horario_str TEXT;
  v_open TIME;
  v_close TIME;
  v_slot TIME;
  v_end TIME;
  v_busy BOOLEAN;
  v_now_sp TIMESTAMP;
  v_today DATE;
  v_now_time TIME;
  v_barber_count INTEGER;
  v_dow INTEGER;
  v_bh RECORD;
  v_slot_start TIMESTAMPTZ;
  v_slot_end TIMESTAMPTZ;
BEGIN
  SELECT COALESCE(duracao_minutos, 30) INTO v_duracao
  FROM servicos
  WHERE id = p_servico_id;

  IF v_duracao IS NULL THEN
    v_duracao := 30;
  END IF;

  v_now_sp := timezone('America/Sao_Paulo', now());
  v_today := v_now_sp::date;
  v_now_time := v_now_sp::time;

  IF p_data < v_today THEN
    RETURN;
  END IF;

  v_dow := EXTRACT(DOW FROM p_data)::INTEGER;

  SELECT COUNT(*)::INTEGER INTO v_barber_count
  FROM barbeiros
  WHERE COALESCE(ativo, true) = true;

  -- Horário efetivo: barbeiro específico com cadastro, senão loja
  IF p_barbeiro_id IS NOT NULL THEN
    SELECT * INTO v_bh
    FROM barbeiro_horarios
    WHERE barbeiro_id = p_barbeiro_id AND dia_semana = v_dow;

    IF FOUND THEN
      IF v_bh.fechado OR v_bh.abertura IS NULL OR v_bh.fechamento IS NULL THEN
        RETURN;
      END IF;
      v_open := v_bh.abertura;
      v_close := v_bh.fechamento;
    END IF;
  END IF;

  IF v_open IS NULL THEN
    v_day_key := CASE v_dow
      WHEN 0 THEN 'horario_domingo'
      WHEN 1 THEN 'horario_segunda'
      WHEN 2 THEN 'horario_terca'
      WHEN 3 THEN 'horario_quarta'
      WHEN 4 THEN 'horario_quinta'
      WHEN 5 THEN 'horario_sexta'
      WHEN 6 THEN 'horario_sabado'
    END;

    EXECUTE format('SELECT %I FROM configuracoes WHERE id = 1', v_day_key)
      INTO v_horario_str;

    IF v_horario_str IS NULL
       OR lower(trim(v_horario_str)) IN ('fechado', 'closed', '-', '')
    THEN
      RETURN;
    END IF;

    BEGIN
      v_open := split_part(replace(v_horario_str, ' ', ''), '-', 1)::TIME;
      v_close := split_part(replace(v_horario_str, ' ', ''), '-', 2)::TIME;
    EXCEPTION
      WHEN others THEN
        RETURN;
    END;
  END IF;

  v_slot := v_open;

  WHILE v_slot + (v_duracao || ' minutes')::INTERVAL <= v_close LOOP
    v_end := v_slot + (v_duracao || ' minutes')::INTERVAL;

    IF p_data = v_today AND v_slot <= v_now_time THEN
      v_slot := v_slot + INTERVAL '15 minutes';
      CONTINUE;
    END IF;

    -- Timestamps SP para checar bloqueios
    v_slot_start := (p_data::text || ' ' || v_slot::text)::timestamp AT TIME ZONE 'America/Sao_Paulo';
    v_slot_end := (p_data::text || ' ' || v_end::text)::timestamp AT TIME ZONE 'America/Sao_Paulo';

    IF p_barbeiro_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM agendamentos a
        JOIN servicos s ON s.id = a.servico_id
        WHERE a.data = p_data
          AND a.status IN ('pendente', 'confirmado')
          AND (a.barbeiro_id = p_barbeiro_id OR a.barbeiro_id IS NULL)
          AND a.horario < v_end
          AND (a.horario + (COALESCE(s.duracao_minutos, 30) || ' minutes')::INTERVAL) > v_slot
      ) OR EXISTS (
        SELECT 1
        FROM barbeiro_bloqueios bl
        WHERE bl.barbeiro_id = p_barbeiro_id
          AND bl.inicio < v_slot_end
          AND bl.fim > v_slot_start
      ) INTO v_busy;
    ELSIF v_barber_count > 0 THEN
      -- Livre se pelo menos 1 barbeiro ativo está livre (horário próprio + sem bloqueio/agendamento)
      SELECT NOT EXISTS (
        SELECT 1
        FROM barbeiros b
        WHERE COALESCE(b.ativo, true) = true
          AND NOT EXISTS (
            SELECT 1
            FROM barbeiro_horarios bh
            WHERE bh.barbeiro_id = b.id
              AND bh.dia_semana = v_dow
              AND (bh.fechado = true OR bh.abertura IS NULL OR bh.fechamento IS NULL
                   OR v_slot < bh.abertura OR v_end > bh.fechamento)
          )
          AND NOT EXISTS (
            SELECT 1
            FROM agendamentos a
            JOIN servicos s ON s.id = a.servico_id
            WHERE a.data = p_data
              AND a.status IN ('pendente', 'confirmado')
              AND (a.barbeiro_id = b.id OR a.barbeiro_id IS NULL)
              AND a.horario < v_end
              AND (a.horario + (COALESCE(s.duracao_minutos, 30) || ' minutes')::INTERVAL) > v_slot
          )
          AND NOT EXISTS (
            SELECT 1
            FROM barbeiro_bloqueios bl
            WHERE bl.barbeiro_id = b.id
              AND bl.inicio < v_slot_end
              AND bl.fim > v_slot_start
          )
      ) INTO v_busy;
    ELSE
      SELECT EXISTS (
        SELECT 1
        FROM agendamentos a
        JOIN servicos s ON s.id = a.servico_id
        WHERE a.data = p_data
          AND a.status IN ('pendente', 'confirmado')
          AND a.horario < v_end
          AND (a.horario + (COALESCE(s.duracao_minutos, 30) || ' minutes')::INTERVAL) > v_slot
      ) INTO v_busy;
    END IF;

    IF NOT v_busy THEN
      horario := to_char(v_slot, 'HH24:MI');
      RETURN NEXT;
    END IF;

    v_slot := v_slot + INTERVAL '15 minutes';
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION get_available_slots(DATE, UUID, UUID) TO authenticated, anon, service_role;
