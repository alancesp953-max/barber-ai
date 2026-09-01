-- Parse robusto dos horários salvos em Configurações (8.30, 08h30, en-dash, etc.)

CREATE OR REPLACE FUNCTION parse_config_hours(p_raw TEXT, OUT abertura TIME, OUT fechamento TIME)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v TEXT;
  v_open TEXT;
  v_close TEXT;
BEGIN
  abertura := NULL;
  fechamento := NULL;
  IF p_raw IS NULL THEN
    RETURN;
  END IF;

  v := lower(trim(p_raw));
  IF v IN ('', '-', 'fechado', 'closed') THEN
    RETURN;
  END IF;

  v := replace(v, '–', '-');
  v := replace(v, '—', '-');
  v := regexp_replace(v, '\s+às\s+', '-', 'g');
  v := regexp_replace(v, '\s+as\s+', '-', 'g');
  v := regexp_replace(v, '\s+até\s+', '-', 'g');
  v := regexp_replace(v, '\s+ate\s+', '-', 'g');
  v := replace(v, ' ', '');
  v := replace(v, 'h', ':');
  v := replace(v, '.', ':');
  v := replace(v, ',', ':');

  v_open := split_part(v, '-', 1);
  v_close := split_part(v, '-', 2);

  IF v_open IS NULL OR v_open = '' OR v_close IS NULL OR v_close = '' THEN
    RETURN;
  END IF;

  BEGIN
    abertura := v_open::TIME;
    fechamento := v_close::TIME;
  EXCEPTION
    WHEN others THEN
      abertura := NULL;
      fechamento := NULL;
  END;
END;
$$;

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
  v_buffer INTEGER;
  v_block INTEGER;
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
  SELECT
    COALESCE(duracao_minutos, 30),
    COALESCE(buffer_minutos, 10)
  INTO v_duracao, v_buffer
  FROM servicos
  WHERE id = p_servico_id;

  IF v_duracao IS NULL THEN
    v_duracao := 30;
    v_buffer := 10;
  END IF;

  v_block := v_duracao + v_buffer;

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

    SELECT p.abertura, p.fechamento INTO v_open, v_close
    FROM parse_config_hours(v_horario_str) p;

    IF v_open IS NULL OR v_close IS NULL THEN
      RETURN;
    END IF;
  END IF;

  v_slot := v_open;

  WHILE v_slot + (v_block || ' minutes')::INTERVAL <= v_close LOOP
    v_end := v_slot + (v_block || ' minutes')::INTERVAL;

    IF p_data = v_today AND v_slot <= v_now_time THEN
      v_slot := v_slot + INTERVAL '15 minutes';
      CONTINUE;
    END IF;

    v_slot_start := (p_data::text || ' ' || v_slot::text)::timestamp AT TIME ZONE 'America/Sao_Paulo';
    v_slot_end := (p_data::text || ' ' || v_end::text)::timestamp AT TIME ZONE 'America/Sao_Paulo';

    IF p_barbeiro_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM agendamentos a
        WHERE a.data = p_data
          AND a.status IN ('pendente', 'confirmado')
          AND (a.barbeiro_id = p_barbeiro_id OR a.barbeiro_id IS NULL)
          AND a.horario < v_end
          AND (
            a.horario + (
              COALESCE(
                a.duracao_reservada_minutos + COALESCE(a.buffer_reservado_minutos, 0),
                (SELECT COALESCE(s.duracao_minutos, 30) + COALESCE(s.buffer_minutos, 10)
                 FROM servicos s WHERE s.id = a.servico_id),
                40
              ) || ' minutes'
            )::INTERVAL
          ) > v_slot
      ) OR EXISTS (
        SELECT 1
        FROM barbeiro_bloqueios bl
        WHERE bl.barbeiro_id = p_barbeiro_id
          AND bl.inicio < v_slot_end
          AND bl.fim > v_slot_start
      ) INTO v_busy;
    ELSIF v_barber_count > 0 THEN
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
            WHERE a.data = p_data
              AND a.status IN ('pendente', 'confirmado')
              AND (a.barbeiro_id = b.id OR a.barbeiro_id IS NULL)
              AND a.horario < v_end
              AND (
                a.horario + (
                  COALESCE(
                    a.duracao_reservada_minutos + COALESCE(a.buffer_reservado_minutos, 0),
                    (SELECT COALESCE(s.duracao_minutos, 30) + COALESCE(s.buffer_minutos, 10)
                     FROM servicos s WHERE s.id = a.servico_id),
                    40
                  ) || ' minutes'
                )::INTERVAL
              ) > v_slot
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
        WHERE a.data = p_data
          AND a.status IN ('pendente', 'confirmado')
          AND a.horario < v_end
          AND (
            a.horario + (
              COALESCE(
                a.duracao_reservada_minutos + COALESCE(a.buffer_reservado_minutos, 0),
                (SELECT COALESCE(s.duracao_minutos, 30) + COALESCE(s.buffer_minutos, 10)
                 FROM servicos s WHERE s.id = a.servico_id),
                40
              ) || ' minutes'
            )::INTERVAL
          ) > v_slot
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

GRANT EXECUTE ON FUNCTION parse_config_hours(TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_available_slots(DATE, UUID, UUID) TO authenticated, anon, service_role;
