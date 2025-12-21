-- ============================================
-- CRON AUTOMATICO PARA SYNC CON MERCADO LIBRE
-- ============================================
-- Requiere: Supabase Pro (pg_cron + pg_net)
-- Ejecutar en SQL Editor de Supabase Dashboard
-- ============================================

-- 1. Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Configurar variables (REEMPLAZAR con tus datos)
-- Tu URL de Supabase
DO $$
DECLARE
    v_supabase_url TEXT := 'https://cpwsdpzxzhlmozzasnqx.supabase.co';
    v_anon_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwd3NkcHp4emhsbW96emFzbnF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNzgzNDAsImV4cCI6MjA4MTg1NDM0MH0.yPjNhAdJ71UFGbT5l1R96ZbxPr3C5_zKtqNNKMUmvzk';
BEGIN
    RAISE NOTICE 'Configurando cron jobs para sync-meli...';
    RAISE NOTICE 'URL: %', v_supabase_url;
END $$;

-- 3. Eliminar jobs anteriores si existen
SELECT cron.unschedule('sync-meli-comercial') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-meli-comercial');
SELECT cron.unschedule('sync-meli-diario') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-meli-diario');

-- ============================================
-- JOB 1: Horario comercial (cada 30 min)
-- Lunes a Viernes, 8:00 - 21:00 Argentina (UTC-3)
-- En UTC: 11:00 - 00:00
-- ============================================
SELECT cron.schedule(
    'sync-meli-comercial',
    '0,30 11-23 * * 1-5',  -- Cada 30 min, 11:00-23:30 UTC (8:00-20:30 Arg), Lun-Vie
    $$
    SELECT net.http_post(
        url := 'https://cpwsdpzxzhlmozzasnqx.supabase.co/functions/v1/sync-meli',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwd3NkcHp4emhsbW96emFzbnF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNzgzNDAsImV4cCI6MjA4MTg1NDM0MH0.yPjNhAdJ71UFGbT5l1R96ZbxPr3C5_zKtqNNKMUmvzk'
        ),
        body := '{"action": "sync-all"}'::jsonb
    );
    $$
);

-- ============================================
-- JOB 2: Sync diario (6:00 AM Argentina)
-- Todos los dias a las 6:00 AM Argentina (09:00 UTC)
-- ============================================
SELECT cron.schedule(
    'sync-meli-diario',
    '0 9 * * *',  -- 09:00 UTC = 06:00 Argentina
    $$
    SELECT net.http_post(
        url := 'https://cpwsdpzxzhlmozzasnqx.supabase.co/functions/v1/sync-meli',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwd3NkcHp4emhsbW96emFzbnF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNzgzNDAsImV4cCI6MjA4MTg1NDM0MH0.yPjNhAdJ71UFGbT5l1R96ZbxPr3C5_zKtqNNKMUmvzk'
        ),
        body := '{"action": "sync-all"}'::jsonb
    );
    $$
);

-- ============================================
-- JOB 3: Sync 21:00 Argentina (00:00 UTC)
-- Para cubrir el ultimo slot del horario comercial
-- ============================================
SELECT cron.schedule(
    'sync-meli-cierre',
    '0 0 * * 2-6',  -- 00:00 UTC Mar-Sab = 21:00 Lun-Vie Argentina
    $$
    SELECT net.http_post(
        url := 'https://cpwsdpzxzhlmozzasnqx.supabase.co/functions/v1/sync-meli',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwd3NkcHp4emhsbW96emFzbnF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNzgzNDAsImV4cCI6MjA4MTg1NDM0MH0.yPjNhAdJ71UFGbT5l1R96ZbxPr3C5_zKtqNNKMUmvzk'
        ),
        body := '{"action": "sync-all"}'::jsonb
    );
    $$
);

-- ============================================
-- VERIFICAR JOBS CREADOS
-- ============================================
SELECT
    jobid,
    jobname,
    schedule,
    command
FROM cron.job
WHERE jobname LIKE 'sync-meli%'
ORDER BY jobname;

-- ============================================
-- COMANDOS UTILES
-- ============================================

-- Ver historial de ejecuciones:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- Pausar un job (sin eliminarlo):
-- UPDATE cron.job SET active = false WHERE jobname = 'sync-meli-comercial';

-- Reactivar un job:
-- UPDATE cron.job SET active = true WHERE jobname = 'sync-meli-comercial';

-- Eliminar un job:
-- SELECT cron.unschedule('sync-meli-comercial');

-- Ejecutar manualmente (para testing):
-- SELECT net.http_post(
--     url := 'https://cpwsdpzxzhlmozzasnqx.supabase.co/functions/v1/sync-meli',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ...'),
--     body := '{"action": "sync-all"}'::jsonb
-- );
