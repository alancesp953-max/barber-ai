-- Opcional: agenda crm-dispatch diário (10h BRT / 13:00 UTC).
-- Se pg_cron/pg_net não estiverem disponíveis, ignore este arquivo e agende no Dashboard.
-- Substitua __CRM_BEARER__ pela anon key ou service role ao aplicar.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron/pg_net indisponíveis: %', SQLERRM;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('crm-dispatch-daily');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'crm-dispatch-daily',
    '0 13 * * *',
    $job$
    SELECT net.http_post(
      url := 'https://tikxzkkjdyocxdcuzgqv.supabase.co/functions/v1/crm-dispatch',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer __CRM_BEARER__"}'::jsonb,
      body := '{}'::jsonb
    );
    $job$
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Não foi possível agendar crm-dispatch-daily: %', SQLERRM;
END $$;
