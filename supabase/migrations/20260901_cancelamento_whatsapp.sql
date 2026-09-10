-- Aviso WhatsApp em cancelamento/exclusão + tipo cancelamento em automacao_envios.
--
-- Caminho principal: o painel (src/lib/api.ts) chama a Edge Function ao clicar Cancelar.
-- Este trigger é backup (SQL Editor / delete direto no banco) via pg_net.
-- Recria a função/trigger (pode aplicar no SQL Editor mesmo se o db push falhar).

ALTER TABLE automacao_envios DROP CONSTRAINT IF EXISTS automacao_envios_tipo_check;
ALTER TABLE automacao_envios
  ADD CONSTRAINT automacao_envios_tipo_check
  CHECK (tipo IN ('ausencia', 'aniversario', 'lembrete_1h', 'cancelamento'));

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_net indisponível: %', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION public.notify_agendamento_cancelado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, extensions
AS $$
DECLARE
  rec record;
  payload jsonb;
  st text;
  bearer text;
  headers jsonb;
  origem text;
  cli_tel text;
  cli_nome text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    st := lower(trim(coalesce(NEW.status::text, '')));
    IF st IS NOT DISTINCT FROM lower(trim(coalesce(OLD.status::text, ''))) THEN
      RETURN NEW;
    END IF;
    IF st NOT IN ('cancelado', 'cancelled') THEN
      RETURN NEW;
    END IF;
    rec := NEW;
    origem := 'painel';
  ELSE
    rec := OLD;
    st := lower(trim(coalesce(OLD.status::text, '')));
    IF st IN ('cancelado', 'cancelled') THEN
      RETURN OLD;
    END IF;
    origem := 'delete';
  END IF;

  SELECT c.telefone, c.nome
    INTO cli_tel, cli_nome
  FROM public.clientes c
  WHERE c.id = rec.cliente_id;

  payload := jsonb_build_object(
    'agendamento_id', rec.id,
    'origem', origem,
    'snapshot', jsonb_build_object(
      'id', rec.id,
      'data', rec.data,
      'horario', rec.horario,
      'cliente_id', rec.cliente_id,
      'barbeiro_id', rec.barbeiro_id,
      'telefone', cli_tel,
      'cliente_nome', cli_nome
    )
  );

  bearer := NULL;
  BEGIN
    SELECT ds.decrypted_secret
      INTO bearer
    FROM vault.decrypted_secrets ds
    WHERE ds.name IN ('SUPABASE_ANON_KEY', 'anon_key', 'WEBHOOK_SECRET', 'service_role_key')
    ORDER BY CASE ds.name
      WHEN 'SUPABASE_ANON_KEY' THEN 0
      WHEN 'anon_key' THEN 1
      ELSE 2
    END
    LIMIT 1;
  EXCEPTION
    WHEN OTHERS THEN
      bearer := NULL;
  END;

  IF bearer IS NULL OR bearer LIKE '%CRM_BEARER%' THEN
    bearer := NULLIF(current_setting('app.edge_bearer', true), '');
  END IF;
  IF bearer LIKE '%CRM_BEARER%' THEN
    bearer := NULL;
  END IF;

  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-internal-cancel-notify', 'agendamentos'
  );
  IF bearer IS NOT NULL AND length(bearer) > 8 THEN
    headers := headers || jsonb_build_object(
      'Authorization', 'Bearer ' || bearer,
      'apikey', bearer
    );
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'https://tikxzkkjdyocxdcuzgqv.supabase.co/functions/v1/appointment-cancel-notify',
      headers := headers,
      body := payload,
      timeout_milliseconds := 5000
    );
    RAISE LOG 'notify_agendamento_cancelado: http_post id=% op=% tel=%', rec.id, TG_OP, left(coalesce(cli_tel, ''), 4);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE LOG 'notify_agendamento_cancelado erro: %', SQLERRM;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamento_cancelado_whatsapp ON agendamentos;
CREATE TRIGGER trg_agendamento_cancelado_whatsapp
  AFTER UPDATE OF status OR DELETE ON agendamentos
  FOR EACH ROW
  EXECUTE PROCEDURE public.notify_agendamento_cancelado();
