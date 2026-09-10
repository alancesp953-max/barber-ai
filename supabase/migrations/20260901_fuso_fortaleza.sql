-- Alinha "agora" das RPCs de agenda com America/Fortaleza (UTC-3 o ano inteiro).
-- Não reescreve a lógica: só troca o fuso nas funções já publicadas.

DO $$
DECLARE
  r record;
  src text;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_available_slots',
        'create_appointment_atomic',
        'barber_time_is_free'
      )
  LOOP
    src := pg_get_functiondef(r.oid);
    IF src LIKE '%America/Sao_Paulo%' THEN
      src := replace(src, 'America/Sao_Paulo', 'America/Fortaleza');
      EXECUTE src;
    END IF;
  END LOOP;
END $$;
