-- Enforce hourly-only ZL ingestion cadence.
-- Hourly 1H pulls feed the intraday table, then hourly daily rollup builds the live day bar.

DO $$
DECLARE
  job_id bigint;
BEGIN
  FOR job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN ('ingest_zl_intraday', 'rollup_zl_daily')
       OR command ILIKE '%ingest_zl_intraday(%'
       OR command ILIKE '%rollup_zl_daily(%'
  LOOP
    PERFORM cron.unschedule(job_id);
  END LOOP;
END
$$;

SELECT cron.schedule('ingest_zl_intraday', '7 * * * *', $$SELECT ingest_zl_intraday()$$);
SELECT cron.schedule('rollup_zl_daily', '9 * * * *', $$SELECT rollup_zl_daily()$$);
