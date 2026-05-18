-- Disable obsolete Supabase-native ZL chart cron writers.
-- ZL Databento chart raw history is owned by local DuckDB and promoted by
-- python -m fusion.zl_duckdb_pipeline refresh --promote.

ALTER TABLE ops.ingest_run
  ALTER COLUMN run_id SET DEFAULT gen_random_uuid();

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

REVOKE EXECUTE ON FUNCTION public.ingest_zl_intraday() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rollup_zl_daily() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.ingest_zl_intraday() IS
  'Obsolete ZL chart writer. Disabled in favor of local DuckDB raw-store refresh and Python promotion.';
COMMENT ON FUNCTION public.rollup_zl_daily() IS
  'Obsolete ZL chart rollup. Disabled in favor of local DuckDB raw-store refresh and Python promotion.';
