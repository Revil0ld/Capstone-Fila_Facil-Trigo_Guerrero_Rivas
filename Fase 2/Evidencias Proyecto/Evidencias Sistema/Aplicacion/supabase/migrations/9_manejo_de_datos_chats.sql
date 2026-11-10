BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'clear-supermarket-chat-daily';

SELECT cron.schedule(
  'clear-supermarket-chat-daily',
  '0 0 * * *',
  'DELETE FROM public.chat_mensaje_supermercado;'
);

COMMIT;
