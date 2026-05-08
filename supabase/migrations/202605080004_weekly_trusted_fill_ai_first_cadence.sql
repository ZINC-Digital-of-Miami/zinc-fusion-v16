-- AI-first cadence pivot:
-- keep chart freshness hourly, but cut card-driver pull frequency to weekly.
-- AG training stays manual batch-triggered outside pg_cron.

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  job_id BIGINT;
BEGIN
  FOR job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'trusted_site_fill'
       OR command ILIKE '%ops.ingest_trusted_site_fill(%'
  LOOP
    PERFORM cron.unschedule(job_id);
  END LOOP;
END
$$;

-- Weekly run: Monday 11:17 UTC (06:17 America/Chicago during CDT).
SELECT cron.schedule(
  'trusted_site_fill',
  '17 11 * * 1',
  $$SELECT ops.ingest_trusted_site_fill()$$
);
