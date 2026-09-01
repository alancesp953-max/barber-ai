-- Buffer por serviço, intervalo efetivo no agendamento, fila única e reserva atômica

ALTER TABLE servicos
  ADD COLUMN IF NOT EXISTS buffer_minutos INTEGER NOT NULL DEFAULT 10;

ALTER TABLE configuracoes
  ADD COLUMN IF NOT EXISTS buffer_minutos_padrao INTEGER NOT NULL DEFAULT 10;

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS inicio_efetivo TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fim_efetivo TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duracao_reservada_minutos INTEGER,
  ADD COLUMN IF NOT EXISTS buffer_reservado_minutos INTEGER;

ALTER TABLE avaliacoes
  ADD COLUMN IF NOT EXISTS comentario TEXT;

-- Repara ordem_rodizio (1..N sem duplicatas)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY COALESCE(ordem_rodizio, 999999), nome) AS rn
  FROM barbeiros
)
UPDATE barbeiros b
SET ordem_rodizio = ranked.rn
FROM ranked
WHERE b.id = ranked.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_barbeiros_ordem_rodizio_unique
  ON barbeiros (ordem_rodizio);

-- Campanhas de marketing
CREATE TABLE IF NOT EXISTS campanhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem TEXT NOT NULL,
  created_by UUID,
  total_destinatarios INTEGER NOT NULL DEFAULT 0,
  total_enviados INTEGER NOT NULL DEFAULT 0,
  total_erros INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS campanha_envios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id UUID NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  telefone TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  erro TEXT,
  enviado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campanha_envios_campanha ON campanha_envios(campanha_id);

ALTER TABLE campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE campanha_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura autenticada campanhas" ON campanhas;
CREATE POLICY "Leitura autenticada campanhas" ON campanhas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Escrita autenticada campanhas" ON campanhas;
CREATE POLICY "Escrita autenticada campanhas" ON campanhas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Leitura autenticada campanha_envios" ON campanha_envios;
CREATE POLICY "Leitura autenticada campanha_envios" ON campanha_envios
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Escrita autenticada campanha_envios" ON campanha_envios;
CREATE POLICY "Escrita autenticada campanha_envios" ON campanha_envios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Duração efetiva = serviço + buffer (histórico usa valores gravados no agendamento)
CREATE OR REPLACE FUNCTION appointment_block_minutes(a agendamentos)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    a.duracao_reservada_minutos,
    (SELECT COALESCE(s.duracao_minutos, 30) + COALESCE(s.buffer_minutos, 10)
     FROM servicos s WHERE s.id = a.servico_id),
    40
  ) + CASE
    WHEN a.duracao_reservada_minutos IS NOT NULL THEN COALESCE(a.buffer_reservado_minutos, 0)
    ELSE 0
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

    BEGIN
      v_open := split_part(replace(v_horario_str, ' ', ''), '-', 1)::TIME;
      v_close := split_part(replace(v_horario_str, ' ', ''), '-', 2)::TIME;
    EXCEPTION
      WHEN others THEN
        RETURN;
    END;
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

GRANT EXECUTE ON FUNCTION get_available_slots(DATE, UUID, UUID) TO authenticated, anon, service_role;

-- Reserva atômica com rodízio estrito
CREATE OR REPLACE FUNCTION create_appointment_atomic(
  p_cliente_id UUID,
  p_servico_id UUID,
  p_data DATE,
  p_horario TIME,
  p_barbeiro_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT 'pendente',
  p_valor NUMERIC DEFAULT NULL,
  p_use_rotation BOOLEAN DEFAULT true
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
  v_slot TEXT;
  v_horario_txt TEXT;
  v_inicio TIMESTAMPTZ;
  v_fim TIMESTAMPTZ;
  v_appt agendamentos%ROWTYPE;
  v_rec RECORD;
  v_ids UUID[];
  v_i INTEGER;
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

  IF p_barbeiro_id IS NOT NULL THEN
    SELECT array_agg(horario::text) INTO v_slots
    FROM get_available_slots(p_data, p_servico_id, p_barbeiro_id);

    IF v_slots IS NULL OR NOT (v_horario_txt = ANY (v_slots)) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Horário indisponível para este barbeiro');
    END IF;

    SELECT id, nome INTO v_barber, v_barber_nome
    FROM barbeiros
    WHERE id = p_barbeiro_id AND COALESCE(ativo, true) = true
    FOR UPDATE;

    IF v_barber IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Barbeiro inativo ou inexistente');
    END IF;

    -- use_rotation=true significa que veio do rodízio (já escolhido o 1º livre)
    v_from_rotation := COALESCE(p_use_rotation, false);
  ELSIF COALESCE(p_use_rotation, true) THEN
    -- Percorre a fila na ordem; primeiro livre ganha
    FOR v_rec IN
      SELECT id, nome
      FROM barbeiros
      WHERE COALESCE(ativo, true) = true
      ORDER BY ordem_rodizio ASC NULLS LAST, nome ASC
      FOR UPDATE
    LOOP
      SELECT array_agg(horario::text) INTO v_slots
      FROM get_available_slots(p_data, p_servico_id, v_rec.id);

      IF v_slots IS NOT NULL AND v_horario_txt = ANY (v_slots) THEN
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
    FROM get_available_slots(p_data, p_servico_id, NULL);
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

    -- Move escolhido para o fim
    v_ids := array_remove(v_ids, v_barber);
    v_ids := v_ids || v_barber;

    -- Evita conflito UNIQUE temporário
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

GRANT EXECUTE ON FUNCTION create_appointment_atomic(UUID, UUID, DATE, TIME, UUID, TEXT, NUMERIC, BOOLEAN)
  TO authenticated, anon, service_role;
