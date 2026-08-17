-- Admin pode marcar horário fora da grade de 15 min (ex.: 17:40),
-- desde que caiba no expediente e não bata em conflito/folga.

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

  SELECT * INTO v_bh
  FROM barbeiro_horarios
  WHERE barbeiro_id = p_barbeiro_id AND dia_semana = v_dow;

  IF FOUND THEN
    IF v_bh.fechado OR v_bh.abertura IS NULL OR v_bh.fechamento IS NULL THEN
      RETURN false;
    END IF;
    v_open := v_bh.abertura;
    v_close := v_bh.fechamento;
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

  IF p_horario < v_open OR v_end > v_close THEN
    RETURN false;
  END IF;

  v_slot_start := (p_data::text || ' ' || p_horario::text)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_slot_end := (p_data::text || ' ' || v_end::text)::timestamp AT TIME ZONE 'America/Sao_Paulo';

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

CREATE OR REPLACE FUNCTION create_appointment_atomic(
  p_cliente_id UUID,
  p_servico_id UUID,
  p_data DATE,
  p_horario TIME,
  p_barbeiro_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT 'pendente',
  p_valor NUMERIC DEFAULT NULL,
  p_use_rotation BOOLEAN DEFAULT true,
  p_allow_past BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_duracao INTEGER;
  v_buffer INTEGER;
  v_block INTEGER;
  v_preco NUMERIC;
  v_barber UUID;
  v_barber_nome TEXT;
  v_from_rotation BOOLEAN := false;
  v_slots TEXT[];
  v_horario_txt TEXT;
  v_inicio TIMESTAMPTZ;
  v_fim TIMESTAMPTZ;
  v_appt agendamentos%ROWTYPE;
  v_rec RECORD;
  v_ids UUID[];
  v_i INTEGER;
  v_now_sp TIMESTAMP;
  v_off BOOLEAN;
  v_in_grid BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('barber-ai-booking'));

  SELECT
    COALESCE(duracao_minutos, 30),
    COALESCE(buffer_minutos, 10),
    preco
  INTO v_duracao, v_buffer, v_preco
  FROM servicos
  WHERE id = p_servico_id;

  IF v_duracao IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Serviço não encontrado');
  END IF;

  v_block := v_duracao + v_buffer;
  v_horario_txt := to_char(p_horario, 'HH24:MI');
  v_inicio := (p_data::text || ' ' || v_horario_txt)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim := v_inicio + (v_block || ' minutes')::INTERVAL;
  v_now_sp := timezone('America/Sao_Paulo', now());

  IF p_data < v_now_sp::date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Essa data já passou.');
  END IF;

  IF p_barbeiro_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM barbeiro_bloqueios bl
      WHERE bl.barbeiro_id = p_barbeiro_id
        AND bl.inicio < v_fim
        AND (bl.fim IS NULL OR bl.fim > v_inicio)
    ) INTO v_off;

    IF v_off THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Este barbeiro está de folga/bloqueio neste horário');
    END IF;

    SELECT array_agg(horario::text) INTO v_slots
    FROM get_available_slots(p_data, p_servico_id, p_barbeiro_id, p_allow_past);

    v_in_grid := v_slots IS NOT NULL AND v_horario_txt = ANY (v_slots);

    IF NOT v_in_grid THEN
      IF COALESCE(p_allow_past, false) AND barber_time_is_free(p_data, p_horario, p_servico_id, p_barbeiro_id) THEN
        v_in_grid := true;
      ELSE
        IF p_data = v_now_sp::date
           AND p_horario <= v_now_sp::time
           AND NOT COALESCE(p_allow_past, false)
        THEN
          RETURN jsonb_build_object(
            'ok', false,
            'error',
            'Esse horário já passou (agora são '
              || to_char(v_now_sp, 'HH24:MI')
              || '). Escolha um horário futuro.'
          );
        END IF;
        RETURN jsonb_build_object('ok', false, 'error', 'Horário indisponível para este barbeiro');
      END IF;
    END IF;

    SELECT id, nome INTO v_barber, v_barber_nome
    FROM barbeiros
    WHERE id = p_barbeiro_id AND COALESCE(ativo, true) = true
    FOR UPDATE;

    IF v_barber IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Barbeiro inativo ou inexistente');
    END IF;

    v_from_rotation := COALESCE(p_use_rotation, false);
  ELSIF COALESCE(p_use_rotation, true) THEN
    FOR v_rec IN
      SELECT id, nome
      FROM barbeiros
      WHERE COALESCE(ativo, true) = true
      ORDER BY ordem_rodizio ASC NULLS LAST, nome ASC
      FOR UPDATE
    LOOP
      SELECT array_agg(horario::text) INTO v_slots
      FROM get_available_slots(p_data, p_servico_id, v_rec.id, p_allow_past);

      IF (v_slots IS NOT NULL AND v_horario_txt = ANY (v_slots))
         OR (
           COALESCE(p_allow_past, false)
           AND barber_time_is_free(p_data, p_horario, p_servico_id, v_rec.id)
         )
      THEN
        v_barber := v_rec.id;
        v_barber_nome := v_rec.nome;
        v_from_rotation := true;
        EXIT;
      END IF;
    END LOOP;

    IF v_barber IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Nenhum barbeiro livre neste horário');
    END IF;
  ELSE
    SELECT array_agg(horario::text) INTO v_slots
    FROM get_available_slots(p_data, p_servico_id, NULL, p_allow_past);
    IF v_slots IS NULL OR NOT (v_horario_txt = ANY (v_slots)) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Horário indisponível');
    END IF;
  END IF;

  INSERT INTO agendamentos (
    cliente_id, servico_id, barbeiro_id, data, horario, status, valor,
    duracao_reservada_minutos, buffer_reservado_minutos, inicio_efetivo, fim_efetivo
  ) VALUES (
    p_cliente_id,
    p_servico_id,
    v_barber,
    p_data,
    p_horario,
    COALESCE(NULLIF(p_status, ''), 'pendente'),
    COALESCE(p_valor, v_preco),
    v_duracao,
    v_buffer,
    v_inicio,
    v_fim
  )
  RETURNING * INTO v_appt;

  IF v_from_rotation AND v_barber IS NOT NULL THEN
    SELECT array_agg(id ORDER BY ordem_rodizio ASC NULLS LAST, nome ASC)
    INTO v_ids
    FROM barbeiros
    WHERE COALESCE(ativo, true) = true;

    v_ids := array_remove(v_ids, v_barber);
    v_ids := v_ids || v_barber;

    UPDATE barbeiros SET ordem_rodizio = ordem_rodizio + 10000
    WHERE id = ANY (v_ids);

    FOR v_i IN 1 .. coalesce(array_length(v_ids, 1), 0) LOOP
      UPDATE barbeiros SET ordem_rodizio = v_i WHERE id = v_ids[v_i];
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_appt.id,
    'barbeiro_id', v_barber,
    'barbeiro_nome', v_barber_nome,
    'from_rotation', v_from_rotation,
    'horario', v_horario_txt,
    'data', p_data,
    'duracao_minutos', v_duracao,
    'buffer_minutos', v_buffer,
    'fim_efetivo', v_fim
  );
END;
$$;

GRANT EXECUTE ON FUNCTION barber_time_is_free(DATE, TIME, UUID, UUID)
  TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION create_appointment_atomic(UUID, UUID, DATE, TIME, UUID, TEXT, NUMERIC, BOOLEAN, BOOLEAN)
  TO authenticated, anon, service_role;
