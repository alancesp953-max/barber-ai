-- Escala semanal persistida: se o barbeiro tem QUALQUER linha em barbeiro_horarios,
-- dias sem linha ou fechado = indisponível (não cai no horário da loja).
-- RLS: barbeiro autenticado só lê a própria agenda; admin (sem linha em barbeiros) vê tudo.
-- Lembrete 1h: tipo em automacao_envios + pg_cron.

ALTER TABLE automacao_envios DROP CONSTRAINT IF EXISTS automacao_envios_tipo_check;
ALTER TABLE automacao_envios
  ADD CONSTRAINT automacao_envios_tipo_check
  CHECK (tipo IN ('ausencia', 'aniversario', 'lembrete_1h'));

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

  WHILE v_slot + (v_block || ' minutes')::INTERVAL <= v_close LOOP
    v_end := v_slot + (v_block || ' minutes')::INTERVAL;

    IF (NOT COALESCE(p_allow_past, false))
       AND p_data = v_today
       AND v_slot <= v_now_time
    THEN
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
                AND v_end <= bh.fechamento
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

CREATE OR REPLACE FUNCTION public.auth_barbeiro_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.barbeiros WHERE user_id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.auth_barbeiro_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_barbeiro_id() TO authenticated;

DROP POLICY IF EXISTS "Leitura pública para agendamentos" ON agendamentos;
DROP POLICY IF EXISTS "Leitura autenticada agenda barbeiro" ON agendamentos;
DROP POLICY IF EXISTS "Escrita autenticada para agendamentos" ON agendamentos;
DROP POLICY IF EXISTS "Escrita autenticada admin agendamentos" ON agendamentos;
DROP POLICY IF EXISTS "Exclusão autenticada agendamentos" ON agendamentos;
DROP POLICY IF EXISTS "Permitir leitura pública" ON agendamentos;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar" ON agendamentos;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar" ON agendamentos;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir" ON agendamentos;
DROP POLICY IF EXISTS agendamentos_all_authenticated ON agendamentos;
DROP POLICY IF EXISTS delete_agendamentos_auth ON agendamentos;

CREATE POLICY "Leitura autenticada agenda barbeiro" ON agendamentos
  FOR SELECT TO authenticated
  USING (
    public.auth_barbeiro_id() IS NULL
    OR barbeiro_id = public.auth_barbeiro_id()
  );

CREATE POLICY "Escrita autenticada para agendamentos" ON agendamentos
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_barbeiro_id() IS NULL);

CREATE POLICY "Escrita autenticada admin agendamentos" ON agendamentos
  FOR UPDATE TO authenticated
  USING (public.auth_barbeiro_id() IS NULL)
  WITH CHECK (public.auth_barbeiro_id() IS NULL);

CREATE POLICY "Exclusão autenticada agendamentos" ON agendamentos
  FOR DELETE TO authenticated
  USING (public.auth_barbeiro_id() IS NULL);

DO $$
BEGIN
  PERFORM cron.unschedule('appointment-remind-10min');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'appointment-remind-10min',
    '*/10 * * * *',
    $job$
    SELECT net.http_post(
      url := 'https://tikxzkkjdyocxdcuzgqv.supabase.co/functions/v1/appointment-remind',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer __CRM_BEARER__"}'::jsonb,
      body := '{}'::jsonb
    );
    $job$
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Não foi possível agendar appointment-remind-10min: %', SQLERRM;
END $$;
