-- Supabase-only trusted dashboard fill:
-- refreshes analytics risk-factor metrics/attribution from live market pulls
-- and carries forward non-market fields until AG training publishes fresh rows.

CREATE OR REPLACE FUNCTION ops.ingest_trusted_site_fill()
RETURNS jsonb
SECURITY DEFINER
SET search_path = public, extensions
LANGUAGE plpgsql
AS $$
DECLARE
  v_run_id UUID := gen_random_uuid();
  started TIMESTAMPTZ := now();
  v_trade_date DATE := (now() AT TIME ZONE 'America/New_York')::date;
  now_et_iso TEXT := to_char(now() AT TIME ZONE 'America/New_York', 'YYYY-MM-DD"T"HH24:MI:SSOF');
  prev_date DATE;

  resp_cl http_response;
  resp_cny http_response;
  resp_vix http_response;
  resp_ovx http_response;

  cl_price NUMERIC;
  cl_anchor NUMERIC;
  cl_change_5d NUMERIC;
  cny_rate NUMERIC;
  vix_value NUMERIC;
  ovx_value NUMERIC;

  board_crush_value NUMERIC;
  oil_share_value NUMERIC;
  oil_share_5d_change NUMERIC;
  uncertainty_value NUMERIC;
  soy_china_news_count NUMERIC;
  soy_tariff_news_count NUMERIC;
  macro_news_count NUMERIC;
  energy_news_count NUMERIC;

  vix_stress_score NUMERIC;
  crush_pressure_score NUMERIC;
  china_tension_score NUMERIC;
  tariff_threat_score NUMERIC;
  energy_stress_score NUMERIC;

  avg_score NUMERIC;
  top_driver_key TEXT;
  top_driver_score NUMERIC;
  posture TEXT;
  regime TEXT;
  regime_confidence NUMERIC;
  v_records_upserted INT := 0;
  non_null_points INT := 0;
  payload JSONB;
BEGIN
  INSERT INTO ops.ingest_run (run_id, job_name, source, status, started_at)
  VALUES (v_run_id, 'trusted_site_fill', 'supabase-http-yahoo', 'running', started);

  -- Avoid transient HTTP timeout failures in pgsql-http.
  PERFORM extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS', '5000');
  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '20000');

  SELECT max(trade_date) INTO prev_date
  FROM analytics.dashboard_metrics
  WHERE trade_date <= v_trade_date;

  IF prev_date IS NOT NULL THEN
    SELECT metric_value INTO board_crush_value
    FROM analytics.dashboard_metrics
    WHERE trade_date = prev_date AND metric_key = 'board_crush_value'
    LIMIT 1;

    SELECT metric_value INTO oil_share_value
    FROM analytics.dashboard_metrics
    WHERE trade_date = prev_date AND metric_key = 'oil_share_value'
    LIMIT 1;

    SELECT metric_value INTO oil_share_5d_change
    FROM analytics.dashboard_metrics
    WHERE trade_date = prev_date AND metric_key = 'oil_share_5d_change'
    LIMIT 1;

    SELECT metric_value INTO uncertainty_value
    FROM analytics.dashboard_metrics
    WHERE trade_date = prev_date AND metric_key = 'uncertainty_value'
    LIMIT 1;

    SELECT metric_value INTO soy_china_news_count
    FROM analytics.dashboard_metrics
    WHERE trade_date = prev_date AND metric_key = 'soy_china_news_count'
    LIMIT 1;

    SELECT metric_value INTO soy_tariff_news_count
    FROM analytics.dashboard_metrics
    WHERE trade_date = prev_date AND metric_key = 'soy_tariff_news_count'
    LIMIT 1;

    SELECT metric_value INTO macro_news_count
    FROM analytics.dashboard_metrics
    WHERE trade_date = prev_date AND metric_key = 'macro_news_count'
    LIMIT 1;

    SELECT metric_value INTO energy_news_count
    FROM analytics.dashboard_metrics
    WHERE trade_date = prev_date AND metric_key = 'energy_news_count'
    LIMIT 1;
  END IF;

  SELECT * INTO resp_cl
  FROM extensions.http_get('https://query2.finance.yahoo.com/v8/finance/chart/CL%3DF?interval=1d&range=1mo');
  IF resp_cl.status = 200 THEN
    WITH closes AS (
      SELECT ordinality AS idx, value::text::numeric AS close
      FROM jsonb_array_elements(
        COALESCE(resp_cl.content::jsonb #> '{chart,result,0,indicators,quote,0,close}', '[]'::jsonb)
      ) WITH ORDINALITY AS e(value, ordinality)
      WHERE jsonb_typeof(value) = 'number'
    ),
    latest AS (
      SELECT idx, close FROM closes ORDER BY idx DESC LIMIT 1
    ),
    anchor AS (
      SELECT close FROM closes WHERE idx <= (SELECT idx FROM latest) - 5 ORDER BY idx DESC LIMIT 1
    )
    SELECT l.close, a.close
      INTO cl_price, cl_anchor
    FROM latest l
    LEFT JOIN anchor a ON TRUE;
  END IF;
  IF cl_anchor IS NOT NULL AND cl_anchor <> 0 THEN
    cl_change_5d := (cl_price - cl_anchor) / cl_anchor;
  END IF;

  SELECT * INTO resp_cny
  FROM extensions.http_get('https://query2.finance.yahoo.com/v8/finance/chart/CNY%3DX?interval=1d&range=1mo');
  IF resp_cny.status = 200 THEN
    SELECT value::text::numeric INTO cny_rate
    FROM jsonb_array_elements(
      COALESCE(resp_cny.content::jsonb #> '{chart,result,0,indicators,quote,0,close}', '[]'::jsonb)
    ) WITH ORDINALITY AS e(value, ordinality)
    WHERE jsonb_typeof(value) = 'number'
    ORDER BY ordinality DESC
    LIMIT 1;
  END IF;

  SELECT * INTO resp_vix
  FROM extensions.http_get('https://query2.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1mo');
  IF resp_vix.status = 200 THEN
    SELECT value::text::numeric INTO vix_value
    FROM jsonb_array_elements(
      COALESCE(resp_vix.content::jsonb #> '{chart,result,0,indicators,quote,0,close}', '[]'::jsonb)
    ) WITH ORDINALITY AS e(value, ordinality)
    WHERE jsonb_typeof(value) = 'number'
    ORDER BY ordinality DESC
    LIMIT 1;
  END IF;

  SELECT * INTO resp_ovx
  FROM extensions.http_get('https://query2.finance.yahoo.com/v8/finance/chart/%5EOVX?interval=1d&range=1mo');
  IF resp_ovx.status = 200 THEN
    SELECT value::text::numeric INTO ovx_value
    FROM jsonb_array_elements(
      COALESCE(resp_ovx.content::jsonb #> '{chart,result,0,indicators,quote,0,close}', '[]'::jsonb)
    ) WITH ORDINALITY AS e(value, ordinality)
    WHERE jsonb_typeof(value) = 'number'
    ORDER BY ordinality DESC
    LIMIT 1;
  END IF;

  -- If live pulls fail, keep last known values so the surface does not hard-break.
  IF cl_price IS NULL THEN
    SELECT metric_value INTO cl_price
    FROM analytics.dashboard_metrics
    WHERE trade_date = prev_date AND metric_key = 'cl_price'
    LIMIT 1;
  END IF;
  IF cl_change_5d IS NULL THEN
    SELECT metric_value INTO cl_change_5d
    FROM analytics.dashboard_metrics
    WHERE trade_date = prev_date AND metric_key = 'cl_change_5d'
    LIMIT 1;
  END IF;
  IF cny_rate IS NULL THEN
    SELECT metric_value INTO cny_rate
    FROM analytics.dashboard_metrics
    WHERE trade_date = prev_date AND metric_key = 'cny_rate'
    LIMIT 1;
  END IF;
  IF vix_value IS NULL THEN
    SELECT metric_value INTO vix_value
    FROM analytics.dashboard_metrics
    WHERE trade_date = prev_date AND metric_key = 'vix_value'
    LIMIT 1;
  END IF;
  IF ovx_value IS NULL THEN
    SELECT metric_value INTO ovx_value
    FROM analytics.dashboard_metrics
    WHERE trade_date = prev_date AND metric_key = 'ovx_value'
    LIMIT 1;
  END IF;

  soy_china_news_count := COALESCE(soy_china_news_count, 0);
  soy_tariff_news_count := COALESCE(soy_tariff_news_count, 0);
  macro_news_count := COALESCE(macro_news_count, 0);
  energy_news_count := COALESCE(energy_news_count, 0);

  vix_stress_score := round((
    (CASE WHEN vix_value IS NULL THEN 0 ELSE GREATEST(0, LEAST(100, ((vix_value - 14) / 21) * 100)) END) * 0.60 +
    (CASE WHEN ovx_value IS NULL THEN 0 ELSE GREATEST(0, LEAST(100, ((ovx_value - 25) / 55) * 100)) END) * 0.40
  )::numeric, 1);

  crush_pressure_score := round((
    (CASE WHEN board_crush_value IS NULL THEN 0 ELSE GREATEST(0, LEAST(100, (((4.2 - board_crush_value) - 0.0) / 3.5) * 100)) END) * 0.70 +
    (CASE WHEN oil_share_5d_change IS NULL THEN 0 ELSE GREATEST(0, LEAST(100, ((abs(oil_share_5d_change) - 0.2) / 3.8) * 100)) END) * 0.30
  )::numeric, 1);

  china_tension_score := round((
    (CASE WHEN cny_rate IS NULL THEN 0 ELSE GREATEST(0, LEAST(100, ((abs(cny_rate - 7.0) - 0.02) / 0.33) * 100)) END) * 0.70 +
    (GREATEST(0, LEAST(100, ((soy_china_news_count - 2) / 28) * 100))) * 0.30
  )::numeric, 1);

  tariff_threat_score := round((
    (CASE WHEN uncertainty_value IS NULL THEN 0 ELSE GREATEST(0, LEAST(100, ((uncertainty_value - 150) / 400) * 100)) END) * 0.70 +
    (GREATEST(0, LEAST(100, (((soy_tariff_news_count + macro_news_count) - 4) / 36) * 100))) * 0.30
  )::numeric, 1);

  energy_stress_score := round((
    (CASE WHEN cl_change_5d IS NULL THEN 0 ELSE GREATEST(0, LEAST(100, (((abs(cl_change_5d * 100)) - 0.8) / 9.2) * 100)) END) * 0.55 +
    (CASE WHEN ovx_value IS NULL THEN 0 ELSE GREATEST(0, LEAST(100, ((ovx_value - 25) / 55) * 100)) END) * 0.30 +
    (GREATEST(0, LEAST(100, ((energy_news_count - 2) / 28) * 100))) * 0.15
  )::numeric, 1);

  avg_score := round(((vix_stress_score + crush_pressure_score + china_tension_score + tariff_threat_score + energy_stress_score) / 5.0)::numeric, 1);

  top_driver_key := 'vix_stress';
  top_driver_score := vix_stress_score;
  IF crush_pressure_score > top_driver_score THEN
    top_driver_key := 'crush_pressure';
    top_driver_score := crush_pressure_score;
  END IF;
  IF china_tension_score > top_driver_score THEN
    top_driver_key := 'china_tension';
    top_driver_score := china_tension_score;
  END IF;
  IF tariff_threat_score > top_driver_score THEN
    top_driver_key := 'tariff_threat';
    top_driver_score := tariff_threat_score;
  END IF;
  IF energy_stress_score > top_driver_score THEN
    top_driver_key := 'energy_stress';
    top_driver_score := energy_stress_score;
  END IF;

  IF avg_score >= 78 AND top_driver_score >= 85 THEN
    posture := 'DEFER';
  ELSIF avg_score >= 62 THEN
    posture := 'WAIT';
  ELSE
    posture := 'ACCUMULATE';
  END IF;

  IF avg_score >= 70 THEN
    regime := 'SUPPLY_CRISIS';
  ELSIF avg_score >= 55 THEN
    regime := 'BEARISH';
  ELSIF avg_score <= 30 THEN
    regime := 'BULLISH';
  ELSE
    regime := 'NEUTRAL';
  END IF;

  non_null_points :=
    (CASE WHEN cl_price IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN cl_change_5d IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN cny_rate IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN vix_value IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN ovx_value IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN board_crush_value IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN oil_share_value IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN oil_share_5d_change IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN uncertainty_value IS NOT NULL THEN 1 ELSE 0 END);
  regime_confidence := round(LEAST(0.95, 0.45 + non_null_points * 0.05)::numeric, 4);

  payload := jsonb_build_object(
    'source', 'supabase_pg_cron_trusted_fill',
    'asOf', now_et_iso,
    'carriedFromDate', prev_date,
    'pulledBy', 'ops.ingest_trusted_site_fill'
  );

  INSERT INTO analytics.dashboard_metrics (trade_date, metric_key, metric_value, payload)
  VALUES
    (v_trade_date, 'vix_value', vix_value, payload),
    (v_trade_date, 'ovx_value', ovx_value, payload),
    (v_trade_date, 'cl_price', cl_price, payload),
    (v_trade_date, 'cl_change_5d', cl_change_5d, payload),
    (v_trade_date, 'oil_change_5d', cl_change_5d, payload),
    (v_trade_date, 'cny_rate', cny_rate, payload),
    (v_trade_date, 'board_crush_value', board_crush_value, payload),
    (v_trade_date, 'oil_share_value', oil_share_value, payload),
    (v_trade_date, 'oil_share_5d_change', oil_share_5d_change, payload),
    (v_trade_date, 'uncertainty_value', uncertainty_value, payload),
    (v_trade_date, 'tpu_value', uncertainty_value, payload),
    (v_trade_date, 'soy_china_news_count', soy_china_news_count, payload),
    (v_trade_date, 'soy_tariff_news_count', soy_tariff_news_count, payload),
    (v_trade_date, 'macro_news_count', macro_news_count, payload),
    (v_trade_date, 'energy_news_count', energy_news_count, payload),
    (v_trade_date, 'vix_stress_score', vix_stress_score, payload),
    (v_trade_date, 'crush_pressure_score', crush_pressure_score, payload),
    (v_trade_date, 'china_tension_score', china_tension_score, payload),
    (v_trade_date, 'tariff_threat_score', tariff_threat_score, payload),
    (v_trade_date, 'energy_stress_score', energy_stress_score, payload)
  ON CONFLICT (trade_date, metric_key) DO UPDATE
    SET metric_value = EXCLUDED.metric_value,
        payload = EXCLUDED.payload,
        ingested_at = now();
  GET DIAGNOSTICS v_records_upserted = ROW_COUNT;

  INSERT INTO analytics.driver_attribution_1d (trade_date, rank, factor, contribution, confidence, payload)
  VALUES
    (v_trade_date, 1, 'energy_transmission', energy_stress_score, round(LEAST(0.95, 0.5 + abs(energy_stress_score - 50.0) / 120.0)::numeric, 4), payload),
    (v_trade_date, 2, 'macro_policy_uncertainty', tariff_threat_score, round(LEAST(0.95, 0.5 + abs(tariff_threat_score - 50.0) / 120.0)::numeric, 4), payload),
    (v_trade_date, 3, 'china_flow_currency', china_tension_score, round(LEAST(0.95, 0.5 + abs(china_tension_score - 50.0) / 120.0)::numeric, 4), payload),
    (v_trade_date, 4, 'crush_margin_oil_share', crush_pressure_score, round(LEAST(0.95, 0.5 + abs(crush_pressure_score - 50.0) / 120.0)::numeric, 4), payload),
    (v_trade_date, 5, 'vix_volatility_regime', vix_stress_score, round(LEAST(0.95, 0.5 + abs(vix_stress_score - 50.0) / 120.0)::numeric, 4), payload)
  ON CONFLICT (trade_date, rank) DO UPDATE
    SET factor = EXCLUDED.factor,
        contribution = EXCLUDED.contribution,
        confidence = EXCLUDED.confidence,
        payload = EXCLUDED.payload,
        ingested_at = now();

  INSERT INTO analytics.market_posture (trade_date, posture, rationale, payload)
  VALUES (
    v_trade_date,
    posture,
    format(
      'Buyer posture %s from average score %s; top channel %s at %s.',
      posture,
      to_char(avg_score, 'FM999990.0'),
      top_driver_key,
      to_char(top_driver_score, 'FM999990.0')
    ),
    jsonb_build_object('averageScore', avg_score, 'topDriver', top_driver_key, 'topDriverScore', top_driver_score, 'asOf', now_et_iso, 'source', 'supabase_pg_cron_trusted_fill')
  )
  ON CONFLICT (trade_date) DO UPDATE
    SET posture = EXCLUDED.posture,
        rationale = EXCLUDED.rationale,
        payload = EXCLUDED.payload,
        ingested_at = now();

  INSERT INTO analytics.regime_state_1d (trade_date, regime, confidence, payload)
  VALUES (
    v_trade_date,
    regime,
    regime_confidence,
    jsonb_build_object('averageScore', avg_score, 'asOf', now_et_iso, 'source', 'supabase_pg_cron_trusted_fill')
  )
  ON CONFLICT (trade_date) DO UPDATE
    SET regime = EXCLUDED.regime,
        confidence = EXCLUDED.confidence,
        payload = EXCLUDED.payload,
        ingested_at = now();

  UPDATE ops.ingest_run
  SET status = 'ok',
      finished_at = now(),
      records_upserted = v_records_upserted,
      error_message = NULL,
      ingested_at = now()
  WHERE run_id = v_run_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'tradeDate', v_trade_date,
    'recordsUpserted', v_records_upserted,
    'topDriver', top_driver_key,
    'topScore', top_driver_score,
    'averageScore', avg_score
  );
EXCEPTION WHEN OTHERS THEN
  UPDATE ops.ingest_run
  SET status = 'error',
      finished_at = now(),
      error_message = left(SQLERRM, 1000),
      ingested_at = now()
  WHERE run_id = v_run_id;
  RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

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

-- Hourly refresh at :17 to keep dashboard drivers fresh without high-frequency pull cost.
SELECT cron.schedule(
  'trusted_site_fill',
  '17 * * * *',
  $$SELECT ops.ingest_trusted_site_fill()$$
);
