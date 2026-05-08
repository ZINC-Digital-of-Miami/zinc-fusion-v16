-- =============================================================================
-- Fix ZL hourly ingest freshness:
-- 1) Use active continuous contract (open-interest ranked) instead of stale c.0
-- 2) Bound request end to Databento schema availability to avoid lag/422 issues
-- =============================================================================

CREATE OR REPLACE FUNCTION ingest_zl_intraday()
RETURNS jsonb
SECURITY DEFINER
SET search_path = public, extensions
LANGUAGE plpgsql
AS $$
DECLARE
  api_key      TEXT;
  start_date   TEXT;
  end_ts       TEXT;
  url          TEXT;
  meta_status  INT;
  meta_body    TEXT;
  resp_status  INT;
  resp_body    TEXT;
  line         TEXT;
  rec          JSONB;
  bar_ts       TIMESTAMPTZ;
  bar_open     NUMERIC;
  bar_high     NUMERIC;
  bar_low      NUMERIC;
  bar_close    NUMERIC;
  bar_volume   BIGINT;
  records_in   INT := 0;
  started      TIMESTAMPTZ := now();
BEGIN
  -- 1) Databento key from Vault.
  SELECT decrypted_secret INTO api_key
  FROM vault.decrypted_secrets
  WHERE name = 'databento_api_key_v2';

  IF api_key IS NULL THEN
    INSERT INTO ops.ingest_run (job_name, source, started_at, finished_at, status, records_upserted, error_message)
    VALUES ('ingest_zl_intraday', 'databento', started, now(), 'failed', 0, 'Databento API key not found in Vault');
    RETURN jsonb_build_object('status', 'error', 'message', 'API key not in Vault');
  END IF;

  -- 1b) Increase pgsql-http curl timeouts for larger Databento responses.
  PERFORM extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS', '5000');
  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '20000');

  -- 2) Always backfill a rolling window to repair stale rows across roll periods.
  --    Keep the window small enough for extension HTTP timeout limits.
  SELECT COALESCE(
    to_char(((max(bucket_ts) AT TIME ZONE 'UTC')::date - 2), 'YYYY-MM-DD'),
    to_char(((now() AT TIME ZONE 'UTC') - interval '30 days')::date, 'YYYY-MM-DD')
  ) INTO start_date
  FROM mkt.price_1h
  WHERE symbol = 'ZL';

  -- 3) Ask Databento for the available end for ohlcv-1h (exclusive endpoint).
  BEGIN
    SELECT status, content
      INTO meta_status, meta_body
    FROM extensions.http((
      'GET',
      'https://hist.databento.com/v0/metadata.get_dataset_range?dataset=GLBX.MDP3',
      ARRAY[extensions.http_header('Authorization', 'Basic ' || encode(convert_to(api_key || ':', 'UTF8'), 'base64'))],
      NULL,
      NULL
    )::extensions.http_request);
  EXCEPTION WHEN OTHERS THEN
    meta_status := NULL;
    meta_body := NULL;
  END;

  IF meta_status = 200 THEN
    BEGIN
      end_ts := COALESCE(
        (meta_body::jsonb #>> '{schema,ohlcv-1h,end}'),
        (meta_body::jsonb ->> 'end')
      );
    EXCEPTION WHEN OTHERS THEN
      end_ts := NULL;
    END;
  END IF;

  -- Fallback if metadata request fails/parsing fails.
  IF end_ts IS NULL THEN
    end_ts := to_char(
      date_trunc('hour', now() AT TIME ZONE 'UTC'),
      'YYYY-MM-DD"T"HH24:MI:SS"Z"'
    );
  END IF;

  -- If already on the same UTC day as endpoint end, include prior day overlap.
  IF start_date = left(end_ts, 10) THEN
    start_date := to_char(((now() AT TIME ZONE 'UTC') - interval '1 day')::date, 'YYYY-MM-DD');
  END IF;

  -- 4) Pull 1h bars.
  -- NOTE: n.0 = highest open-interest contract and stays active through roll periods.
  url := 'https://hist.databento.com/v0/timeseries.get_range'
    || '?dataset=GLBX.MDP3'
    || '&symbols=ZL.n.0'
    || '&schema=ohlcv-1h'
    || '&stype_in=continuous'
    || '&start=' || start_date
    || '&end=' || end_ts
    || '&encoding=json';

  SELECT status, content
    INTO resp_status, resp_body
  FROM extensions.http((
    'GET',
    url,
    ARRAY[extensions.http_header('Authorization', 'Basic ' || encode(convert_to(api_key || ':', 'UTF8'), 'base64'))],
    NULL,
    NULL
  )::extensions.http_request);

  IF resp_status != 200 THEN
    INSERT INTO ops.ingest_run (job_name, source, started_at, finished_at, status, records_upserted, error_message)
    VALUES ('ingest_zl_intraday', 'databento', started, now(), 'failed', 0,
            'Databento HTTP ' || resp_status || ': ' || left(resp_body, 200));
    RETURN jsonb_build_object(
      'status', 'error',
      'http_status', resp_status,
      'start', start_date,
      'end', end_ts
    );
  END IF;

  -- 5) Parse NDJSON and upsert.
  FOR line IN SELECT unnest(string_to_array(resp_body, E'\n'))
  LOOP
    CONTINUE WHEN trim(line) = '';
    BEGIN
      rec := line::jsonb;

      bar_ts := to_timestamp(((rec->'hd'->>'ts_event')::bigint) / 1000000000.0);
      bar_open := (rec->>'open')::bigint / 1000000000.0;
      bar_high := (rec->>'high')::bigint / 1000000000.0;
      bar_low := (rec->>'low')::bigint / 1000000000.0;
      bar_close := (rec->>'close')::bigint / 1000000000.0;
      bar_volume := (rec->>'volume')::bigint;

      CONTINUE WHEN bar_close IS NULL OR bar_close = 0;

      INSERT INTO mkt.price_1h (symbol, bucket_ts, open, high, low, close, volume)
      VALUES ('ZL', bar_ts, bar_open, bar_high, bar_low, bar_close, bar_volume)
      ON CONFLICT (symbol, bucket_ts) DO UPDATE SET
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        volume = EXCLUDED.volume,
        ingested_at = now();

      records_in := records_in + 1;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;

  -- 6) Log success.
  INSERT INTO ops.ingest_run (job_name, source, started_at, finished_at, status, records_upserted, error_message)
  VALUES ('ingest_zl_intraday', 'databento', started, now(), 'ok', records_in, NULL);

  RETURN jsonb_build_object(
    'status', 'ok',
    'records', records_in,
    'start', start_date,
    'end', end_ts,
    'symbol', 'ZL.n.0'
  );
END;
$$;
