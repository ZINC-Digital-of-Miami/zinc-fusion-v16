-- financialdata.net + FRED market EOD ingestion (pivot plan Phase 3, locked
-- decisions L1/L2 2026-06-11):
--   * ops.ingest_market_eod() — hourly: pulls ZL/ZS/ZM/CL daily settles,
--     ^VIX/^OVX, USDCNH from financialdata.net and EPU (USEPUINDXD) from the
--     FRED API; computes board crush fresh (no more carried-forward crush);
--     recomputes driver scores/attribution/posture/regime with the same
--     formulas as ops.ingest_trusted_site_fill(); upserts the newest ZL daily
--     bars into mkt.price_1d and mkt.latest_price so chart freshness no
--     longer depends on a workstation (AGENTS rule 19 hourly freshness).
--   * ops.ingest_cftc_cot() — weekly: CFTC Socrata soybean-oil COT into
--     mkt.cftc_1w with the same payload shape the Python fill writes.
--   * Cron: market_eod_fill hourly at :11; cftc_cot_weekly Sat 00:31 UTC
--     (COT releases Friday 15:30 ET). trusted_site_fill is unscheduled but
--     kept defined as a recovery writer (same pattern as the disabled ZL
--     ingesters in 202605180003).
-- API keys come from Supabase Vault ('financialdata_api_key', 'fred_api_key')
-- — never hardcoded here. News counts remain carried forward from the weekly
-- Python fill lane, stamped with carriedFromDate for honest provenance.

-- Safe jsonb cast: a 200 response with a non-JSON body (HTML error page,
-- truncated payload) must fall through to carry-forward, not abort the run.
CREATE OR REPLACE FUNCTION ops.try_jsonb(p_text TEXT)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN p_text::jsonb;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION ops.ingest_market_eod()
RETURNS jsonb
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  v_run_id UUID := gen_random_uuid();
  started TIMESTAMPTZ := now();
  v_trade_date DATE := (now() AT TIME ZONE 'America/New_York')::date;
  now_et_iso TEXT := to_char(now() AT TIME ZONE 'America/New_York', 'YYYY-MM-DD"T"HH24:MI:SSOF');
  prev_date DATE;

  v_fd_key TEXT;
  v_fred_key TEXT;

  resp http_response;
  v_zl JSONB := '[]'::jsonb;
  v_zs JSONB := '[]'::jsonb;
  v_zm JSONB := '[]'::jsonb;
  v_cl JSONB := '[]'::jsonb;
  v_vix JSONB := '[]'::jsonb;
  v_ovx JSONB := '[]'::jsonb;
  v_cnh JSONB := '[]'::jsonb;

  zl_price NUMERIC; zl_anchor NUMERIC;
  zs_price NUMERIC; zs_anchor NUMERIC;
  zm_price NUMERIC; zm_anchor NUMERIC;
  cl_price NUMERIC; cl_anchor NUMERIC; cl_change_5d NUMERIC;
  vix_value NUMERIC;
  ovx_value NUMERIC;
  cny_rate NUMERIC;

  meal_value NUMERIC; oil_value NUMERIC; denom NUMERIC;
  meal_prev NUMERIC; oil_prev NUMERIC; denom_prev NUMERIC; oil_share_prev NUMERIC;
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
  non_null_points INT := 0;
  v_records_upserted INT := 0;
  v_bars_upserted INT := 0;
  payload JSONB;
BEGIN
  INSERT INTO ops.ingest_run (run_id, job_name, source, status, started_at)
  VALUES (v_run_id, 'market_eod_fill', 'financialdata-fred', 'running', started);

  SELECT decrypted_secret INTO v_fd_key
  FROM vault.decrypted_secrets WHERE name = 'financialdata_api_key' LIMIT 1;
  SELECT decrypted_secret INTO v_fred_key
  FROM vault.decrypted_secrets WHERE name = 'fred_api_key' LIMIT 1;
  IF v_fd_key IS NULL THEN
    RAISE EXCEPTION 'Vault secret financialdata_api_key is missing';
  END IF;

  PERFORM extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS', '5000');
  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '20000');

  SELECT max(trade_date) INTO prev_date
  FROM analytics.dashboard_metrics
  WHERE trade_date <= v_trade_date;

  -- financialdata.net responses are newest-first arrays of
  -- {trading_symbol, date, open, high, low, close, volume}. Every cast goes
  -- through ops.try_jsonb so malformed bodies degrade to carry-forward.
  SELECT * INTO resp FROM extensions.http_get('https://financialdata.net/api/v1/commodity-prices?identifier=ZL&key=' || v_fd_key);
  IF resp.status = 200 THEN v_zl := COALESCE(ops.try_jsonb(resp.content), '[]'::jsonb); END IF;
  IF jsonb_typeof(v_zl) <> 'array' THEN v_zl := '[]'::jsonb; END IF;
  SELECT * INTO resp FROM extensions.http_get('https://financialdata.net/api/v1/commodity-prices?identifier=ZS&key=' || v_fd_key);
  IF resp.status = 200 THEN v_zs := COALESCE(ops.try_jsonb(resp.content), '[]'::jsonb); END IF;
  IF jsonb_typeof(v_zs) <> 'array' THEN v_zs := '[]'::jsonb; END IF;
  SELECT * INTO resp FROM extensions.http_get('https://financialdata.net/api/v1/commodity-prices?identifier=ZM&key=' || v_fd_key);
  IF resp.status = 200 THEN v_zm := COALESCE(ops.try_jsonb(resp.content), '[]'::jsonb); END IF;
  IF jsonb_typeof(v_zm) <> 'array' THEN v_zm := '[]'::jsonb; END IF;
  SELECT * INTO resp FROM extensions.http_get('https://financialdata.net/api/v1/commodity-prices?identifier=CL&key=' || v_fd_key);
  IF resp.status = 200 THEN v_cl := COALESCE(ops.try_jsonb(resp.content), '[]'::jsonb); END IF;
  IF jsonb_typeof(v_cl) <> 'array' THEN v_cl := '[]'::jsonb; END IF;
  SELECT * INTO resp FROM extensions.http_get('https://financialdata.net/api/v1/index-prices?identifier=%5EVIX&key=' || v_fd_key);
  IF resp.status = 200 THEN v_vix := COALESCE(ops.try_jsonb(resp.content), '[]'::jsonb); END IF;
  IF jsonb_typeof(v_vix) <> 'array' THEN v_vix := '[]'::jsonb; END IF;
  SELECT * INTO resp FROM extensions.http_get('https://financialdata.net/api/v1/index-prices?identifier=%5EOVX&key=' || v_fd_key);
  IF resp.status = 200 THEN v_ovx := COALESCE(ops.try_jsonb(resp.content), '[]'::jsonb); END IF;
  IF jsonb_typeof(v_ovx) <> 'array' THEN v_ovx := '[]'::jsonb; END IF;
  SELECT * INTO resp FROM extensions.http_get('https://financialdata.net/api/v1/forex-prices?identifier=USDCNH&key=' || v_fd_key);
  IF resp.status = 200 THEN v_cnh := COALESCE(ops.try_jsonb(resp.content), '[]'::jsonb); END IF;
  IF jsonb_typeof(v_cnh) <> 'array' THEN v_cnh := '[]'::jsonb; END IF;

  SELECT (e.value->>'close')::numeric INTO zl_price FROM jsonb_array_elements(v_zl) WITH ORDINALITY AS e(value, idx) WHERE idx = 1;
  SELECT (e.value->>'close')::numeric INTO zl_anchor FROM jsonb_array_elements(v_zl) WITH ORDINALITY AS e(value, idx) WHERE idx = 6;
  SELECT (e.value->>'close')::numeric INTO zs_price FROM jsonb_array_elements(v_zs) WITH ORDINALITY AS e(value, idx) WHERE idx = 1;
  SELECT (e.value->>'close')::numeric INTO zs_anchor FROM jsonb_array_elements(v_zs) WITH ORDINALITY AS e(value, idx) WHERE idx = 6;
  SELECT (e.value->>'close')::numeric INTO zm_price FROM jsonb_array_elements(v_zm) WITH ORDINALITY AS e(value, idx) WHERE idx = 1;
  SELECT (e.value->>'close')::numeric INTO zm_anchor FROM jsonb_array_elements(v_zm) WITH ORDINALITY AS e(value, idx) WHERE idx = 6;
  SELECT (e.value->>'close')::numeric INTO cl_price FROM jsonb_array_elements(v_cl) WITH ORDINALITY AS e(value, idx) WHERE idx = 1;
  SELECT (e.value->>'close')::numeric INTO cl_anchor FROM jsonb_array_elements(v_cl) WITH ORDINALITY AS e(value, idx) WHERE idx = 6;
  SELECT (e.value->>'close')::numeric INTO vix_value FROM jsonb_array_elements(v_vix) WITH ORDINALITY AS e(value, idx) WHERE idx = 1;
  SELECT (e.value->>'close')::numeric INTO ovx_value FROM jsonb_array_elements(v_ovx) WITH ORDINALITY AS e(value, idx) WHERE idx = 1;
  SELECT (e.value->>'close')::numeric INTO cny_rate FROM jsonb_array_elements(v_cnh) WITH ORDINALITY AS e(value, idx) WHERE idx = 1;

  IF cl_anchor IS NOT NULL AND cl_anchor <> 0 THEN
    cl_change_5d := (cl_price - cl_anchor) / cl_anchor;
  END IF;

  -- FRED USEPUINDXD via the official API host (page/CSV endpoints are
  -- Akamai-gated). Latest non-missing value; values of '.' mean no data.
  IF v_fred_key IS NOT NULL THEN
    SELECT * INTO resp FROM extensions.http_get(
      'https://api.stlouisfed.org/fred/series/observations?series_id=USEPUINDXD&api_key='
      || v_fred_key || '&file_type=json&sort_order=desc&limit=10');
    IF resp.status = 200 THEN
      -- Require a digit: FRED's no-data marker is the bare string '.', which
      -- a [0-9.] bracket class would wrongly accept.
      SELECT (e.value->>'value')::numeric INTO uncertainty_value
      FROM jsonb_array_elements(COALESCE(ops.try_jsonb(resp.content)->'observations', '[]'::jsonb))
        WITH ORDINALITY AS e(value, idx)
      WHERE e.value->>'value' ~ '^[0-9]+(\.[0-9]+)?$'
      ORDER BY idx
      LIMIT 1;
    END IF;
  END IF;

  -- Board crush estimate (same formula as scripts/fill_site_with_trusted_data.py):
  -- meal ($/ton)*0.022 + oil (price)*0.11 - soybeans (cents/bu)/100.
  IF zl_price IS NOT NULL AND zs_price IS NOT NULL AND zm_price IS NOT NULL THEN
    meal_value := zm_price * 0.022;
    oil_value := zl_price * 0.11;
    board_crush_value := meal_value + oil_value - (zs_price / 100.0);
    denom := meal_value + oil_value;
    IF denom > 0 THEN
      oil_share_value := (oil_value / denom) * 100.0;
    END IF;
    -- zs_anchor is not used in the share formula but is required to mirror the
    -- Python reference's "all three series have 6 closes" gate exactly.
    IF zl_anchor IS NOT NULL AND zm_anchor IS NOT NULL AND zs_anchor IS NOT NULL THEN
      meal_prev := zm_anchor * 0.022;
      oil_prev := zl_anchor * 0.11;
      denom_prev := meal_prev + oil_prev;
      IF denom_prev > 0 AND oil_share_value IS NOT NULL THEN
        oil_share_prev := (oil_prev / denom_prev) * 100.0;
        oil_share_5d_change := oil_share_value - oil_share_prev;
      END IF;
    END IF;
  END IF;

  -- Unit sanity clamp: the crush formula assumes ZL cents/lb, ZM $/ton,
  -- ZS cents/bu. If a provider ever changes quote units the result leaves
  -- the plausible band; fall back to carry-forward instead of publishing it.
  IF board_crush_value IS NOT NULL AND (board_crush_value < -5 OR board_crush_value > 15) THEN
    board_crush_value := NULL;
    oil_share_value := NULL;
    oil_share_5d_change := NULL;
  END IF;

  -- Carry-forward fallbacks when live pulls fail, and for the news counts
  -- that the weekly Python fill lane owns.
  IF prev_date IS NOT NULL THEN
    IF cl_price IS NULL THEN
      SELECT metric_value INTO cl_price FROM analytics.dashboard_metrics
      WHERE trade_date = prev_date AND metric_key = 'cl_price' LIMIT 1;
    END IF;
    IF cl_change_5d IS NULL THEN
      SELECT metric_value INTO cl_change_5d FROM analytics.dashboard_metrics
      WHERE trade_date = prev_date AND metric_key = 'cl_change_5d' LIMIT 1;
    END IF;
    IF cny_rate IS NULL THEN
      SELECT metric_value INTO cny_rate FROM analytics.dashboard_metrics
      WHERE trade_date = prev_date AND metric_key = 'cny_rate' LIMIT 1;
    END IF;
    IF vix_value IS NULL THEN
      SELECT metric_value INTO vix_value FROM analytics.dashboard_metrics
      WHERE trade_date = prev_date AND metric_key = 'vix_value' LIMIT 1;
    END IF;
    IF ovx_value IS NULL THEN
      SELECT metric_value INTO ovx_value FROM analytics.dashboard_metrics
      WHERE trade_date = prev_date AND metric_key = 'ovx_value' LIMIT 1;
    END IF;
    IF board_crush_value IS NULL THEN
      SELECT metric_value INTO board_crush_value FROM analytics.dashboard_metrics
      WHERE trade_date = prev_date AND metric_key = 'board_crush_value' LIMIT 1;
    END IF;
    IF oil_share_value IS NULL THEN
      SELECT metric_value INTO oil_share_value FROM analytics.dashboard_metrics
      WHERE trade_date = prev_date AND metric_key = 'oil_share_value' LIMIT 1;
    END IF;
    IF oil_share_5d_change IS NULL THEN
      SELECT metric_value INTO oil_share_5d_change FROM analytics.dashboard_metrics
      WHERE trade_date = prev_date AND metric_key = 'oil_share_5d_change' LIMIT 1;
    END IF;
    IF uncertainty_value IS NULL THEN
      SELECT metric_value INTO uncertainty_value FROM analytics.dashboard_metrics
      WHERE trade_date = prev_date AND metric_key = 'uncertainty_value' LIMIT 1;
    END IF;

    SELECT metric_value INTO soy_china_news_count FROM analytics.dashboard_metrics
    WHERE trade_date = prev_date AND metric_key = 'soy_china_news_count' LIMIT 1;
    SELECT metric_value INTO soy_tariff_news_count FROM analytics.dashboard_metrics
    WHERE trade_date = prev_date AND metric_key = 'soy_tariff_news_count' LIMIT 1;
    SELECT metric_value INTO macro_news_count FROM analytics.dashboard_metrics
    WHERE trade_date = prev_date AND metric_key = 'macro_news_count' LIMIT 1;
    SELECT metric_value INTO energy_news_count FROM analytics.dashboard_metrics
    WHERE trade_date = prev_date AND metric_key = 'energy_news_count' LIMIT 1;
  END IF;

  soy_china_news_count := COALESCE(soy_china_news_count, 0);
  soy_tariff_news_count := COALESCE(soy_tariff_news_count, 0);
  macro_news_count := COALESCE(macro_news_count, 0);
  energy_news_count := COALESCE(energy_news_count, 0);

  -- Driver scores — identical formulas to ops.ingest_trusted_site_fill().
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
    top_driver_key := 'crush_pressure'; top_driver_score := crush_pressure_score;
  END IF;
  IF china_tension_score > top_driver_score THEN
    top_driver_key := 'china_tension'; top_driver_score := china_tension_score;
  END IF;
  IF tariff_threat_score > top_driver_score THEN
    top_driver_key := 'tariff_threat'; top_driver_score := tariff_threat_score;
  END IF;
  IF energy_stress_score > top_driver_score THEN
    top_driver_key := 'energy_stress'; top_driver_score := energy_stress_score;
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
    'source', 'supabase_pg_cron_market_eod',
    'asOf', now_et_iso,
    'carriedFromDate', prev_date,
    'pulledBy', 'ops.ingest_market_eod'
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
    jsonb_build_object('averageScore', avg_score, 'topDriver', top_driver_key, 'topDriverScore', top_driver_score, 'asOf', now_et_iso, 'source', 'supabase_pg_cron_market_eod')
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
    jsonb_build_object('averageScore', avg_score, 'asOf', now_et_iso, 'source', 'supabase_pg_cron_market_eod')
  )
  ON CONFLICT (trade_date) DO UPDATE
    SET regime = EXCLUDED.regime,
        confidence = EXCLUDED.confidence,
        payload = EXCLUDED.payload,
        ingested_at = now();

  -- Chart serving bars: newest 7 ZL settles keep mkt.price_1d (and the
  -- current-day candle) fresh every hour without any workstation involvement.
  INSERT INTO mkt.price_1d (symbol, bucket_ts, open, high, low, close, volume)
  SELECT
    'ZL',
    ((e.value->>'date') || ' 00:00:00+00')::timestamptz,
    (e.value->>'open')::numeric,
    (e.value->>'high')::numeric,
    (e.value->>'low')::numeric,
    (e.value->>'close')::numeric,
    COALESCE((e.value->>'volume')::numeric, 0)
  FROM jsonb_array_elements(v_zl) WITH ORDINALITY AS e(value, idx)
  WHERE idx <= 7
    AND (e.value->>'date') ~ '^\d{4}-\d{2}-\d{2}$'
    AND (e.value->>'close') IS NOT NULL
  ON CONFLICT (symbol, bucket_ts) DO UPDATE
    SET open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        -- Preserve an existing real volume (e.g. Databento-era bars) when the
        -- provider omits it.
        volume = CASE WHEN EXCLUDED.volume > 0 THEN EXCLUDED.volume ELSE mkt.price_1d.volume END,
        ingested_at = now();
  GET DIAGNOSTICS v_bars_upserted = ROW_COUNT;

  IF zl_price IS NOT NULL THEN
    INSERT INTO mkt.latest_price (symbol, price, observed_at)
    SELECT 'ZL', zl_price, ((e.value->>'date') || ' 00:00:00+00')::timestamptz
    FROM jsonb_array_elements(v_zl) WITH ORDINALITY AS e(value, idx)
    WHERE idx = 1
      AND (e.value->>'date') ~ '^\d{4}-\d{2}-\d{2}$'
    ON CONFLICT (symbol) DO UPDATE
      SET price = EXCLUDED.price,
          observed_at = EXCLUDED.observed_at,
          ingested_at = now();
  END IF;

  UPDATE ops.ingest_run
  SET status = 'ok',
      finished_at = now(),
      records_upserted = v_records_upserted + v_bars_upserted,
      error_message = NULL,
      ingested_at = now()
  WHERE run_id = v_run_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'tradeDate', v_trade_date,
    'metricsUpserted', v_records_upserted,
    'zlBarsUpserted', v_bars_upserted,
    'zlClose', zl_price,
    'boardCrush', board_crush_value,
    'topDriver', top_driver_key,
    'averageScore', avg_score
  );
EXCEPTION WHEN OTHERS THEN
  -- The 'running' row above rolls back with the block; INSERT a fresh error
  -- row so failures leave a persisted trace (fail-closed observability).
  INSERT INTO ops.ingest_run (run_id, job_name, source, status, started_at, finished_at, error_message)
  VALUES (gen_random_uuid(), 'market_eod_fill', 'financialdata-fred', 'error', started, now(), left(SQLERRM, 1000));
  RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION ops.ingest_cftc_cot()
RETURNS jsonb
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  v_run_id UUID := gen_random_uuid();
  resp http_response;
  raw_row JSONB;
  obs_date DATE;
  noncomm_long NUMERIC;
  noncomm_short NUMERIC;
  open_interest NUMERIC;
  net NUMERIC;
  ratio NUMERIC := 0;
  bias TEXT;
BEGIN
  INSERT INTO ops.ingest_run (run_id, job_name, source, status, started_at)
  VALUES (v_run_id, 'cftc_cot_weekly', 'cftc-socrata', 'running', now());

  PERFORM extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS', '5000');
  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '20000');

  -- Market code 007601 = SOYBEAN OIL - CHICAGO BOARD OF TRADE; equivalent to
  -- the Python fill's commodity_name='SOYBEAN OIL' filter on this dataset.
  SELECT * INTO resp FROM extensions.http_get(
    'https://publicreporting.cftc.gov/resource/6dca-aqww.json'
    || '?%24where=cftc_contract_market_code%3D%27007601%27'
    || '&%24order=report_date_as_yyyy_mm_dd%20DESC&%24limit=1');
  IF resp.status <> 200
     OR jsonb_typeof(ops.try_jsonb(resp.content)) IS DISTINCT FROM 'array'
     OR jsonb_array_length(ops.try_jsonb(resp.content)) = 0 THEN
    RAISE EXCEPTION 'CFTC Socrata pull failed (status %)', resp.status;
  END IF;

  raw_row := ops.try_jsonb(resp.content) -> 0;
  IF raw_row->>'report_date_as_yyyy_mm_dd' IS NULL THEN
    RAISE EXCEPTION 'CFTC row missing report_date_as_yyyy_mm_dd';
  END IF;
  obs_date := left(raw_row->>'report_date_as_yyyy_mm_dd', 10)::date;
  noncomm_long := COALESCE((raw_row->>'noncomm_positions_long_all')::numeric, 0);
  noncomm_short := COALESCE((raw_row->>'noncomm_positions_short_all')::numeric, 0);
  open_interest := COALESCE((raw_row->>'open_interest_all')::numeric, 0);
  net := noncomm_long - noncomm_short;
  IF open_interest > 0 THEN
    ratio := net / open_interest;
  END IF;
  bias := CASE WHEN ratio >= 0.08 THEN 'bullish'
               WHEN ratio <= -0.08 THEN 'bearish'
               ELSE 'neutral' END;

  INSERT INTO mkt.cftc_1w (symbol, observation_date, payload)
  VALUES (
    'ZL',
    obs_date,
    jsonb_build_object(
      'symbol', 'ZL',
      'observation_date', to_char(obs_date, 'YYYY-MM-DD'),
      'bias', bias,
      'managed_money_net', net,
      'managed_money_ratio', ratio,
      'open_interest', open_interest,
      'payload', raw_row
    )
  )
  ON CONFLICT (symbol, observation_date) DO UPDATE
    SET payload = EXCLUDED.payload,
        ingested_at = now();

  UPDATE ops.ingest_run
  SET status = 'ok', finished_at = now(), records_upserted = 1, ingested_at = now()
  WHERE run_id = v_run_id;

  RETURN jsonb_build_object('status', 'ok', 'observationDate', obs_date, 'bias', bias);
EXCEPTION WHEN OTHERS THEN
  -- The 'running' row rolls back with the block; persist a fresh error row.
  INSERT INTO ops.ingest_run (run_id, job_name, source, status, started_at, finished_at, error_message)
  VALUES (gen_random_uuid(), 'cftc_cot_weekly', 'cftc-socrata', 'error', now(), now(), left(SQLERRM, 1000));
  RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

-- These functions perform outbound HTTP with Vault-held keys; postgres (the
-- pg_cron role) is the only intended caller.
REVOKE EXECUTE ON FUNCTION ops.ingest_market_eod() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION ops.ingest_cftc_cot() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION ops.try_jsonb(TEXT) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION ops.ingest_trusted_site_fill() IS
  'SUPERSEDED 2026-06-11 by ops.ingest_market_eod() (financialdata.net + FRED). Kept unscheduled as a Yahoo-based recovery writer.';

DO $$
DECLARE
  job_id BIGINT;
BEGIN
  FOR job_id IN
    SELECT jobid FROM cron.job
    WHERE jobname IN ('trusted_site_fill', 'market_eod_fill', 'cftc_cot_weekly')
       OR command ILIKE '%ops.ingest_trusted_site_fill(%'
       OR command ILIKE '%ops.ingest_market_eod(%'
       OR command ILIKE '%ops.ingest_cftc_cot(%'
  LOOP
    PERFORM cron.unschedule(job_id);
  END LOOP;
END
$$;

-- Hourly at :11 — keeps the current-day ZL candle and price-derived card
-- metrics fresh (AGENTS rule 19). News counts stay on the weekly Python lane.
SELECT cron.schedule(
  'market_eod_fill',
  '11 * * * *',
  $$SELECT ops.ingest_market_eod()$$
);

-- Saturday 00:31 UTC — CFTC COT releases Friday 15:30 ET for prior-Tuesday data.
SELECT cron.schedule(
  'cftc_cot_weekly',
  '31 0 * * 6',
  $$SELECT ops.ingest_cftc_cot()$$
);
