-- Supabase ML Validation Query Pack
-- Audit date (UTC): 2026-05-10
-- Scope: ZINC-FUSION-V16 ML data contract (cloud Supabase canonical warehouse)
-- Mode: Read-only

-- 1) Core table inventory (row count + date range)
SELECT 'mkt.price_1d' AS table_name, COUNT(*)::bigint AS row_count, MIN(bucket_ts) AS min_ts, MAX(bucket_ts) AS max_ts FROM mkt.price_1d
UNION ALL
SELECT 'mkt.price_1h', COUNT(*)::bigint, MIN(bucket_ts), MAX(bucket_ts) FROM mkt.price_1h
UNION ALL
SELECT 'econ.rates_1d', COUNT(*)::bigint, MIN(observation_date), MAX(observation_date) FROM econ.rates_1d
UNION ALL
SELECT 'econ.commodities_1d', COUNT(*)::bigint, MIN(observation_date), MAX(observation_date) FROM econ.commodities_1d
UNION ALL
SELECT 'econ.weather_1d', COUNT(*)::bigint, MIN(observation_date), MAX(observation_date) FROM econ.weather_1d
UNION ALL
SELECT 'alt.profarmer_news', COUNT(*)::bigint, MIN(published_at), MAX(published_at) FROM alt.profarmer_news
UNION ALL
SELECT 'training.matrix_1d', COUNT(*)::bigint, MIN(trade_date), MAX(trade_date) FROM training.matrix_1d
UNION ALL
SELECT 'training.specialist_signals_1d', COUNT(*)::bigint, MIN(trade_date), MAX(trade_date) FROM training.specialist_signals_1d
UNION ALL
SELECT 'forecasts.target_zones', COUNT(*)::bigint, MIN(forecast_date), MAX(forecast_date) FROM forecasts.target_zones
UNION ALL
SELECT 'forecasts.forecast_summary_1d', COUNT(*)::bigint, MIN(forecast_date), MAX(forecast_date) FROM forecasts.forecast_summary_1d
UNION ALL
SELECT 'forecasts.production_1d', COUNT(*)::bigint, MIN(forecast_date), MAX(forecast_date) FROM forecasts.production_1d
UNION ALL
SELECT 'forecasts.garch_forecasts', COUNT(*)::bigint, MIN(forecast_date), MAX(forecast_date) FROM forecasts.garch_forecasts
UNION ALL
SELECT 'forecasts.monte_carlo_runs', COUNT(*)::bigint, MIN(forecast_date), MAX(forecast_date) FROM forecasts.monte_carlo_runs
UNION ALL
SELECT 'forecasts.probability_distributions', COUNT(*)::bigint, MIN(forecast_date), MAX(forecast_date) FROM forecasts.probability_distributions
UNION ALL
SELECT 'ops.ingest_run', COUNT(*)::bigint, MIN(started_at), MAX(started_at) FROM ops.ingest_run;

-- 2) Symbol scope and date coverage
SELECT symbol, COUNT(*)::bigint AS row_count, MIN(bucket_ts) AS min_ts, MAX(bucket_ts) AS max_ts
FROM mkt.price_1d
GROUP BY symbol
ORDER BY symbol;

SELECT symbol, COUNT(*)::bigint AS row_count, MIN(bucket_ts) AS min_ts, MAX(bucket_ts) AS max_ts
FROM mkt.price_1h
GROUP BY symbol
ORDER BY symbol;

-- 3) ZL calendar join coverage vs ZS/ZM/CL
WITH zl AS (SELECT DISTINCT bucket_ts::date d FROM mkt.price_1d WHERE symbol='ZL')
SELECT
  COUNT(*) FILTER (WHERE zs.d IS NULL)::bigint AS zl_missing_zs,
  COUNT(*) FILTER (WHERE zm.d IS NULL)::bigint AS zl_missing_zm,
  COUNT(*) FILTER (WHERE cl.d IS NULL)::bigint AS zl_missing_cl
FROM zl
LEFT JOIN (SELECT DISTINCT bucket_ts::date d FROM mkt.price_1d WHERE symbol='ZS') zs USING(d)
LEFT JOIN (SELECT DISTINCT bucket_ts::date d FROM mkt.price_1d WHERE symbol='ZM') zm USING(d)
LEFT JOIN (SELECT DISTINCT bucket_ts::date d FROM mkt.price_1d WHERE symbol='CL') cl USING(d);

-- 4) Duplicate checks
SELECT COUNT(*)::bigint AS duplicate_keys
FROM (
  SELECT symbol, bucket_ts, COUNT(*) AS c
  FROM mkt.price_1d
  GROUP BY 1,2
  HAVING COUNT(*) > 1
) d;

SELECT COUNT(*)::bigint AS duplicate_keys
FROM (
  SELECT symbol, bucket_ts, COUNT(*) AS c
  FROM mkt.price_1h
  GROUP BY 1,2
  HAVING COUNT(*) > 1
) d;

SELECT COUNT(*)::bigint AS duplicate_trade_dates
FROM (
  SELECT trade_date, COUNT(*) AS c
  FROM training.matrix_1d
  GROUP BY 1
  HAVING COUNT(*) > 1
) d;

SELECT COUNT(*)::bigint AS duplicate_trade_dates
FROM (
  SELECT trade_date, COUNT(*) AS c
  FROM training.specialist_signals_1d
  GROUP BY 1
  HAVING COUNT(*) > 1
) d;

-- 5) OHLC integrity checks
SELECT
  COUNT(*) FILTER (WHERE high < GREATEST(open, close))::bigint AS high_violations,
  COUNT(*) FILTER (WHERE low > LEAST(open, close))::bigint AS low_violations
FROM mkt.price_1d
WHERE symbol IN ('ZL','ZS','ZM','CL');

SELECT
  COUNT(*) FILTER (WHERE high < GREATEST(open, close))::bigint AS high_violations,
  COUNT(*) FILTER (WHERE low > LEAST(open, close))::bigint AS low_violations
FROM mkt.price_1h
WHERE symbol IN ('ZL','ZS','ZM','CL');

-- 6) Null profile for market required fields
SELECT
  COUNT(*) FILTER (WHERE open IS NULL)::bigint AS open_nulls,
  COUNT(*) FILTER (WHERE high IS NULL)::bigint AS high_nulls,
  COUNT(*) FILTER (WHERE low IS NULL)::bigint AS low_nulls,
  COUNT(*) FILTER (WHERE close IS NULL)::bigint AS close_nulls,
  COUNT(*) FILTER (WHERE volume IS NULL)::bigint AS volume_nulls
FROM mkt.price_1d
WHERE symbol IN ('ZL','ZS','ZM','CL');

-- 7) Training payload coverage and contamination
SELECT
  COUNT(*)::bigint AS rows,
  COUNT(*) FILTER (WHERE NOT (feature_snapshot ? 'close'))::bigint AS missing_close,
  COUNT(*) FILTER (WHERE NOT (feature_snapshot ? 'zs_close'))::bigint AS missing_zs_close,
  COUNT(*) FILTER (WHERE NOT (feature_snapshot ? 'zm_close'))::bigint AS missing_zm_close,
  COUNT(*) FILTER (WHERE NOT (feature_snapshot ? 'cl_close'))::bigint AS missing_cl_close
FROM training.matrix_1d;

SELECT
  COUNT(*)::bigint AS rows,
  COUNT(*) FILTER (
    WHERE feature_snapshot ? 'target_price_30d'
       OR feature_snapshot ? 'target_price_90d'
       OR feature_snapshot ? 'target_price_180d'
  )::bigint AS rows_with_target_keys
FROM training.matrix_1d;

-- 8) Staleness metrics vs now()
SELECT EXTRACT(EPOCH FROM (now() - MAX(bucket_ts))) / 86400.0 AS zl_daily_age_days
FROM mkt.price_1d
WHERE symbol='ZL';

SELECT EXTRACT(EPOCH FROM (now() - MAX(bucket_ts))) / 3600.0 AS zl_hourly_age_hours
FROM mkt.price_1h
WHERE symbol='ZL';

SELECT EXTRACT(EPOCH FROM (now() - MAX(observation_date))) / 86400.0 AS econ_rates_age_days
FROM econ.rates_1d;

SELECT EXTRACT(EPOCH FROM (now() - MAX(published_at))) / 86400.0 AS profarmer_age_days
FROM alt.profarmer_news;

-- 9) Weekday gap detection for 1d bars
WITH bounds AS (
  SELECT MIN(bucket_ts::date) AS min_d, MAX(bucket_ts::date) AS max_d
  FROM mkt.price_1d
  WHERE symbol='ZL'
),
cal AS (
  SELECT d::date AS d
  FROM bounds, generate_series((SELECT min_d FROM bounds), (SELECT max_d FROM bounds), interval '1 day') g(d)
  WHERE extract(isodow from d) <= 5
),
have AS (
  SELECT DISTINCT bucket_ts::date AS d
  FROM mkt.price_1d
  WHERE symbol='ZL'
)
SELECT COUNT(*)::bigint AS zl_weekday_gaps
FROM cal c
LEFT JOIN have h USING(d)
WHERE h.d IS NULL;

-- 10) Hourly gap detection (>2h)
WITH s AS (
  SELECT
    symbol,
    bucket_ts,
    bucket_ts - LAG(bucket_ts) OVER (PARTITION BY symbol ORDER BY bucket_ts) AS dt
  FROM mkt.price_1h
  WHERE symbol IN ('ZL','ZS','ZM','CL')
)
SELECT symbol, COUNT(*) FILTER (WHERE dt > interval '2 hour')::bigint AS gaps_gt_2h
FROM s
GROUP BY symbol
ORDER BY symbol;

-- 11) Row-count drift (latest 30d vs previous 30d)
WITH day_counts AS (
  SELECT bucket_ts::date AS d, COUNT(*)::bigint AS c
  FROM mkt.price_1d
  WHERE symbol IN ('ZL','ZS','ZM','CL')
  GROUP BY 1
),
maxd AS (SELECT MAX(d) AS mx FROM day_counts),
curr AS (SELECT COALESCE(SUM(c),0)::numeric AS v FROM day_counts,maxd WHERE d > mx - interval '30 day'),
prev AS (SELECT COALESCE(SUM(c),0)::numeric AS v FROM day_counts,maxd WHERE d <= mx - interval '30 day' AND d > mx - interval '60 day')
SELECT curr.v AS current_30d, prev.v AS previous_30d,
       CASE WHEN prev.v = 0 THEN NULL ELSE (curr.v - prev.v) / prev.v END AS drift_ratio
FROM curr, prev;

-- 12) Leakage probe: specialist momentum equals target delta
-- Repeat this template for each specialist_* table.
SELECT
  COUNT(*)::bigint AS row_count,
  COUNT(*) FILTER (
    WHERE (f.feature_payload->>'mom_30')::numeric =
          (m.feature_snapshot->>'target_price_30d')::numeric - (m.feature_snapshot->>'close')::numeric
  )::bigint AS eq_30,
  COUNT(*) FILTER (
    WHERE (f.feature_payload->>'mom_90')::numeric =
          (m.feature_snapshot->>'target_price_90d')::numeric - (m.feature_snapshot->>'close')::numeric
  )::bigint AS eq_90,
  COUNT(*) FILTER (
    WHERE (f.feature_payload->>'mom_180')::numeric =
          (m.feature_snapshot->>'target_price_180d')::numeric - (m.feature_snapshot->>'close')::numeric
  )::bigint AS eq_180
FROM training.specialist_features_crush f
JOIN training.matrix_1d m USING (trade_date);

-- 13) Leakage probe: signal family identity collapse
SELECT COUNT(*)::bigint AS row_count,
       COUNT(*) FILTER (
         WHERE (signal_payload->>'sig_china_1') = (signal_payload->>'sig_crush_1')
           AND (signal_payload->>'sig_fx_1') = (signal_payload->>'sig_crush_1')
           AND (signal_payload->>'sig_fed_1') = (signal_payload->>'sig_crush_1')
           AND (signal_payload->>'sig_tariff_1') = (signal_payload->>'sig_crush_1')
           AND (signal_payload->>'sig_energy_1') = (signal_payload->>'sig_crush_1')
           AND (signal_payload->>'sig_biofuel_1') = (signal_payload->>'sig_crush_1')
           AND (signal_payload->>'sig_palm_1') = (signal_payload->>'sig_crush_1')
           AND (signal_payload->>'sig_volatility_1') = (signal_payload->>'sig_crush_1')
           AND (signal_payload->>'sig_substitutes_1') = (signal_payload->>'sig_crush_1')
           AND (signal_payload->>'sig_trump_effect_1') = (signal_payload->>'sig_crush_1')
       )::bigint AS same_count
FROM training.specialist_signals_1d;

-- 14) Object ownership and constraint inventory
SELECT c.relkind, n.nspname AS schema_name, c.relname AS object_name, pg_get_userbyid(c.relowner) AS owner_role
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('mkt','econ','alt','supply','training','forecasts','analytics','ops','vegas')
  AND c.relkind IN ('r','v','m')
ORDER BY n.nspname, c.relname;

SELECT conrelid::regclass::text AS table_name, conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace IN (
  SELECT oid FROM pg_namespace WHERE nspname IN ('mkt','econ','alt','supply','training','forecasts','analytics','ops','vegas')
)
ORDER BY conrelid::regclass::text, conname;

-- 15) Cron jobs
SELECT jobid, jobname, schedule, command, database, username, active
FROM cron.job
ORDER BY jobid;
