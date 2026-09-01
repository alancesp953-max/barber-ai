-- BarberAI WhatsApp bot (UAZAPI) — run in Supabase SQL Editor after schema.sql

-- Config: bot flags (tokens stay in Edge Function secrets, not here)
ALTER TABLE IF EXISTS configuracoes
  ADD COLUMN IF NOT EXISTS whatsapp_bot_ativo BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS uazapi_base_url TEXT;

-- If configuracoes table does not exist yet
CREATE TABLE IF NOT EXISTS configuracoes (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nome_barbearia TEXT,
  telefone TEXT,
  email TEXT,
  endereco TEXT DEFAULT 'Rua Castro Monte 165, Bairro Varjota, Fortaleza',
  instagram TEXT,
  facebook TEXT,
  whatsapp TEXT,
  whatsapp_bot_ativo BOOLEAN DEFAULT false,
  uazapi_base_url TEXT,
  horario_segunda TEXT DEFAULT '08:30 - 19:30',
  horario_terca TEXT DEFAULT '08:30 - 19:30',
  horario_quarta TEXT DEFAULT '08:30 - 19:30',
  horario_quinta TEXT DEFAULT '08:30 - 19:30',
  horario_sexta TEXT DEFAULT '08:30 - 19:30',
  horario_sabado TEXT DEFAULT '08:30 - 19:30',
  horario_domingo TEXT DEFAULT 'Fechado',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO configuracoes (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Conversation state per phone
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  phone TEXT PRIMARY KEY,
  step TEXT NOT NULL DEFAULT 'menu',
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_updated ON whatsapp_sessions(updated_at);

-- Phone lookup for bot
CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON clientes(telefone);

-- Allow null email for WhatsApp-created clients if column is NOT NULL
DO $$
BEGIN
  ALTER TABLE clientes ALTER COLUMN email DROP NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- Only service role / backend should touch sessions (no public policies)
-- Authenticated admin can read sessions for debugging
CREATE POLICY "Admin leitura whatsapp_sessions" ON whatsapp_sessions
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Slot discovery: free HH:MM for a date (+ service duration, barber conflict, past times)
-- America/Sao_Paulo: on "today", never return slots that already started.
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

  -- Past dates: no slots
  IF p_data < v_today THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_barber_count FROM barbeiros;

  v_day_key := CASE EXTRACT(DOW FROM p_data)::INTEGER
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

  -- Accept "09:00 - 19:00" or "09:00-19:00"
  BEGIN
    v_open := split_part(replace(v_horario_str, ' ', ''), '-', 1)::TIME;
    v_close := split_part(replace(v_horario_str, ' ', ''), '-', 2)::TIME;
  EXCEPTION
    WHEN others THEN
      RETURN;
  END;

  v_slot := v_open;

  WHILE v_slot + (v_duracao || ' minutes')::INTERVAL <= v_close LOOP
    v_end := v_slot + (v_duracao || ' minutes')::INTERVAL;

    -- Same day: hide times already past (e.g. agora 12h → sem 08:00)
    IF p_data = v_today AND v_slot <= v_now_time THEN
      v_slot := v_slot + INTERVAL '15 minutes';
      CONTINUE;
    END IF;

    IF p_barbeiro_id IS NOT NULL THEN
      -- Barbeiro específico: conflito se ele (ou agendamento sem barbeiro) ocupa o intervalo
      SELECT EXISTS (
        SELECT 1
        FROM agendamentos a
        JOIN servicos s ON s.id = a.servico_id
        WHERE a.data = p_data
          AND a.status IN ('pendente', 'confirmado')
          AND (a.barbeiro_id = p_barbeiro_id OR a.barbeiro_id IS NULL)
          AND a.horario < v_end
          AND (a.horario + (COALESCE(s.duracao_minutos, 30) || ' minutes')::INTERVAL) > v_slot
      ) INTO v_busy;
    ELSIF v_barber_count > 0 THEN
      -- "Qualquer barbeiro": livre se pelo menos 1 barbeiro está livre no intervalo
      SELECT NOT EXISTS (
        SELECT 1
        FROM barbeiros b
        WHERE NOT EXISTS (
          SELECT 1
          FROM agendamentos a
          JOIN servicos s ON s.id = a.servico_id
          WHERE a.data = p_data
            AND a.status IN ('pendente', 'confirmado')
            AND (a.barbeiro_id = b.id OR a.barbeiro_id IS NULL)
            AND a.horario < v_end
            AND (a.horario + (COALESCE(s.duracao_minutos, 30) || ' minutes')::INTERVAL) > v_slot
        )
      ) INTO v_busy;
    ELSE
      -- Sem barbeiros cadastrados: conflito global do horário
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
