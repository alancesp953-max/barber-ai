-- WhatsApp: último início = fechamento (19:30) menos a duração do serviço (sem buffer).
-- Nunca emitir 19:30 como horário de início na grade.
-- Painel admin: barber_time_is_free não recusa encaixe fora da janela de expediente
-- (19:20, 19:30 ou além). Conflitos e bloqueios continuam valendo.
-- WhatsApp não usa barber_time_is_free (p_allow_past=false exige horário na grade).

CREATE OR REPLACE FUNCTION get_available_slots(
  p_data DATE,
  p_servico_id UUID,
  p_barbeiro_id UUID DEFAULT NULL,
  p_allow_past BOOLEAN DEFAULT false
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
  v_has_custom BOOLEAN;
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

  v_now_sp := timezone('America/Fortaleza', now());
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
    SELECT EXISTS (
      SELECT 1 FROM barbeiro_horarios WHERE barbeiro_id = p_barbeiro_id
    ) INTO v_has_custom;

    SELECT * INTO v_bh
    FROM barbeiro_horarios
    WHERE barbeiro_id = p_barbeiro_id AND dia_semana = v_dow;

    IF FOUND THEN
      IF v_bh.fechado OR v_bh.abertura IS NULL OR v_bh.fechamento IS NULL THEN
        RETURN;
      END IF;
      v_open := v_bh.abertura;
      v_close := v_bh.fechamento;
    ELSIF v_has_custom THEN
      RETURN;
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

  -- Último início: fechamento − duração (não duração+buffer). Nunca iniciar no horário de fechar.
  WHILE v_slot + (v_duracao || ' minutes')::INTERVAL <= v_close
        AND v_slot < v_close
  LOOP
    v_end := v_slot + (v_block || ' minutes')::INTERVAL;

    IF (NOT COALESCE(p_allow_past, false))
       AND p_data = v_today
       AND v_slot <= v_now_time
    THEN
      v_slot := v_slot + INTERVAL '15 minutes';
      CONTINUE;
    END IF;

    v_slot_start := (p_data::text || ' ' || v_slot::text)::timestamp AT TIME ZONE 'America/Fortaleza';
    v_slot_end := (p_data::text || ' ' || v_end::text)::timestamp AT TIME ZONE 'America/Fortaleza';

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
          AND (bl.fim IS NULL OR bl.fim > v_slot_start)
      ) INTO v_busy;
    ELSIF v_barber_count > 0 THEN
      SELECT NOT EXISTS (
        SELECT 1
        FROM barbeiros b
        WHERE COALESCE(b.ativo, true) = true
          AND (
            NOT EXISTS (SELECT 1 FROM barbeiro_horarios x WHERE x.barbeiro_id = b.id)
            OR EXISTS (
              SELECT 1
              FROM barbeiro_horarios bh
              WHERE bh.barbeiro_id = b.id
                AND bh.dia_semana = v_dow
                AND COALESCE(bh.fechado, false) = false
                AND bh.abertura IS NOT NULL
                AND bh.fechamento IS NOT NULL
                AND v_slot >= bh.abertura
                AND v_slot < bh.fechamento
                AND (v_slot + (v_duracao || ' minutes')::INTERVAL) <= bh.fechamento
            )
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
              AND (bl.fim IS NULL OR bl.fim > v_slot_start)
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

GRANT EXECUTE ON FUNCTION get_available_slots(DATE, UUID, UUID, BOOLEAN)
  TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION barber_time_is_free(
  p_data DATE,
  p_horario TIME,
  p_servico_id UUID,
  p_barbeiro_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_duracao INTEGER;
  v_buffer INTEGER;
  v_block INTEGER;
  v_dow INTEGER;
  v_open TIME;
  v_close TIME;
  v_end TIME;
  v_bh RECORD;
  v_day_key TEXT;
  v_horario_str TEXT;
  v_slot_start TIMESTAMPTZ;
  v_slot_end TIMESTAMPTZ;
  v_busy BOOLEAN;
  v_has_custom BOOLEAN;
BEGIN
  IF p_barbeiro_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT
    COALESCE(duracao_minutos, 30),
    COALESCE(buffer_minutos, 10)
  INTO v_duracao, v_buffer
  FROM servicos
  WHERE id = p_servico_id;

  IF v_duracao IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM barbeiros
    WHERE id = p_barbeiro_id AND COALESCE(ativo, true) = true
  ) THEN
    RETURN false;
  END IF;

  v_block := v_duracao + v_buffer;
  v_end := p_horario + (v_block || ' minutes')::INTERVAL;
  v_dow := EXTRACT(DOW FROM p_data)::INTEGER;

  SELECT EXISTS (
    SELECT 1 FROM barbeiro_horarios WHERE barbeiro_id = p_barbeiro_id
  ) INTO v_has_custom;

  SELECT * INTO v_bh
  FROM barbeiro_horarios
  WHERE barbeiro_id = p_barbeiro_id AND dia_semana = v_dow;

  IF FOUND THEN
    IF v_bh.fechado OR v_bh.abertura IS NULL OR v_bh.fechamento IS NULL THEN
      RETURN false;
    END IF;
    v_open := v_bh.abertura;
    v_close := v_bh.fechamento;
  ELSIF v_has_custom THEN
    RETURN false;
  ELSE
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
      RETURN false;
    END IF;
    SELECT p.abertura, p.fechamento INTO v_open, v_close
    FROM parse_config_hours(v_horario_str) p;
    IF v_open IS NULL OR v_close IS NULL THEN
      RETURN false;
    END IF;
  END IF;

  -- Sem recusa por abertura/fechamento: o painel (p_allow_past) encaixa em qualquer horário.
  -- Conflitos de agenda e bloqueios abaixo continuam obrigatórios.

  v_slot_start := (p_data::text || ' ' || p_horario::text)::timestamp AT TIME ZONE 'America/Fortaleza';
  v_slot_end := (p_data::text || ' ' || v_end::text)::timestamp AT TIME ZONE 'America/Fortaleza';

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
      ) > p_horario
  ) OR EXISTS (
    SELECT 1
    FROM barbeiro_bloqueios bl
    WHERE bl.barbeiro_id = p_barbeiro_id
      AND bl.inicio < v_slot_end
      AND (bl.fim IS NULL OR bl.fim > v_slot_start)
  ) INTO v_busy;

  RETURN NOT COALESCE(v_busy, false);
END;
$$;

GRANT EXECUTE ON FUNCTION barber_time_is_free(DATE, TIME, UUID, UUID)
  TO authenticated, anon, service_role;
