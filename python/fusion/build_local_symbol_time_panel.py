from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlparse

import psycopg2

from .config import resolve_local_training_db_url


class LocalSymbolTimePanelError(RuntimeError):
    pass


NUMERIC_TEXT_REGEX = r"^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)([eE][+-]?[0-9]+)?$"


PANEL_STAGE_SQL = """
WITH
zl_daily AS (
  SELECT
    trade_date,
    close::double precision AS close
  FROM raw.databento_ohlcv_1d
  WHERE symbol = 'ZL'
    AND trade_date IS NOT NULL
    AND close IS NOT NULL
),
zl_targets AS (
  SELECT
    trade_date,
    LEAD(close, 30) OVER (ORDER BY trade_date) AS target_price_30d,
    LEAD(close, 90) OVER (ORDER BY trade_date) AS target_price_90d,
    LEAD(close, 180) OVER (ORDER BY trade_date) AS target_price_180d
  FROM zl_daily
),
hourly_raw AS (
  SELECT
    upper(trim(symbol)) AS symbol,
    ts_event::timestamptz AS bucket_ts,
    ts_event::date AS trade_date,
    open::double precision AS open,
    high::double precision AS high,
    low::double precision AS low,
    close::double precision AS close,
    volume::double precision AS volume,
    COALESCE(open_interest, 0.0)::double precision AS open_interest
  FROM raw.databento_ohlcv_1h
  WHERE symbol IS NOT NULL
    AND trim(symbol) <> ''
    AND ts_event IS NOT NULL
    AND open IS NOT NULL
    AND high IS NOT NULL
    AND low IS NOT NULL
    AND close IS NOT NULL
    AND open ~ %(numeric_regex)s
    AND high ~ %(numeric_regex)s
    AND low ~ %(numeric_regex)s
    AND close ~ %(numeric_regex)s
),
hourly_clean AS (
  SELECT *
  FROM hourly_raw
  WHERE high >= GREATEST(open, close)
    AND low <= LEAST(open, close)
),
hourly_features AS (
  SELECT
    symbol,
    bucket_ts,
    trade_date,
    open,
    high,
    low,
    close,
    volume,
    open_interest,
    close / NULLIF(LAG(close, 1) OVER (PARTITION BY symbol ORDER BY bucket_ts), 0) - 1.0 AS ret_1h,
    close / NULLIF(LAG(close, 6) OVER (PARTITION BY symbol ORDER BY bucket_ts), 0) - 1.0 AS ret_6h,
    close / NULLIF(LAG(close, 24) OVER (PARTITION BY symbol ORDER BY bucket_ts), 0) - 1.0 AS ret_24h,
    close / NULLIF(LAG(close, 120) OVER (PARTITION BY symbol ORDER BY bucket_ts), 0) - 1.0 AS ret_120h,
    volume / NULLIF(LAG(volume, 1) OVER (PARTITION BY symbol ORDER BY bucket_ts), 0) - 1.0 AS vol_chg_1h,
    volume / NULLIF(LAG(volume, 24) OVER (PARTITION BY symbol ORDER BY bucket_ts), 0) - 1.0 AS vol_chg_24h,
    AVG(close) OVER (PARTITION BY symbol ORDER BY bucket_ts ROWS BETWEEN 23 PRECEDING AND CURRENT ROW) AS ma_24h,
    AVG(close) OVER (PARTITION BY symbol ORDER BY bucket_ts ROWS BETWEEN 119 PRECEDING AND CURRENT ROW) AS ma_120h,
    STDDEV_SAMP(close) OVER (PARTITION BY symbol ORDER BY bucket_ts ROWS BETWEEN 23 PRECEDING AND CURRENT ROW) AS std_24h,
    STDDEV_SAMP(close) OVER (PARTITION BY symbol ORDER BY bucket_ts ROWS BETWEEN 119 PRECEDING AND CURRENT ROW) AS std_120h,
    AVG(volume) OVER (PARTITION BY symbol ORDER BY bucket_ts ROWS BETWEEN 23 PRECEDING AND CURRENT ROW) AS vol_ma_24h,
    AVG(volume) OVER (PARTITION BY symbol ORDER BY bucket_ts ROWS BETWEEN 119 PRECEDING AND CURRENT ROW) AS vol_ma_120h,
    ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY bucket_ts)::double precision AS symbol_step,
    ABS(hashtext(symbol))::double precision AS symbol_hash,
    EXTRACT(hour FROM bucket_ts)::double precision AS hour_utc,
    EXTRACT(dow FROM bucket_ts)::double precision AS dow_utc
  FROM hourly_clean
),
panel AS (
  SELECT
    symbol || '|' || to_char(bucket_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS sample_id,
    symbol,
    bucket_ts,
    trade_date,
    jsonb_build_object(
      'symbol_hash', symbol_hash,
      'symbol_step', symbol_step,
      'open', open,
      'high', high,
      'low', low,
      'close', close,
      'volume', volume,
      'open_interest', open_interest,
      'bar_range', high - low,
      'body', close - open,
      'hl2', (high + low) / 2.0,
      'oc2', (open + close) / 2.0,
      'ret_1h', COALESCE(ret_1h, 0.0),
      'ret_6h', COALESCE(ret_6h, 0.0),
      'ret_24h', COALESCE(ret_24h, 0.0),
      'ret_120h', COALESCE(ret_120h, 0.0),
      'vol_chg_1h', COALESCE(vol_chg_1h, 0.0),
      'vol_chg_24h', COALESCE(vol_chg_24h, 0.0),
      'ma_24h', COALESCE(ma_24h, close),
      'ma_120h', COALESCE(ma_120h, close),
      'std_24h', COALESCE(std_24h, 0.0),
      'std_120h', COALESCE(std_120h, 0.0),
      'zscore_close_24h', CASE WHEN std_24h IS NULL OR std_24h = 0 THEN 0.0 ELSE (close - ma_24h) / std_24h END,
      'zscore_close_120h', CASE WHEN std_120h IS NULL OR std_120h = 0 THEN 0.0 ELSE (close - ma_120h) / std_120h END,
      'vol_ma_24h', COALESCE(vol_ma_24h, volume),
      'vol_ma_120h', COALESCE(vol_ma_120h, volume),
      'hour_utc', hour_utc,
      'dow_utc', dow_utc,
      'is_regular_session_hour', CASE WHEN EXTRACT(hour FROM bucket_ts) BETWEEN 13 AND 19 THEN 1.0 ELSE 0.0 END
    ) AS feature_snapshot,
    target_price_30d,
    target_price_90d,
    target_price_180d
  FROM hourly_features hf
  JOIN zl_targets zt USING (trade_date)
  WHERE zt.target_price_180d IS NOT NULL
)
SELECT
  sample_id,
  symbol,
  bucket_ts,
  trade_date,
  feature_snapshot,
  target_price_30d,
  target_price_90d,
  target_price_180d
FROM panel
"""


@dataclass(frozen=True)
class PanelBuildSummary:
    panel_rows: int
    target_rows: int
    symbol_count: int
    min_trade_date: str | None
    max_trade_date: str | None


def _validate_local_db_url(db_url: str) -> None:
    parsed = urlparse(db_url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise LocalSymbolTimePanelError(f"db url must be postgres/postgresql, got: {parsed.scheme!r}")
    host = (parsed.hostname or "").lower()
    if host not in {"localhost", "127.0.0.1", "::1"}:
        raise LocalSymbolTimePanelError(f"local panel build refuses non-local host: {host or '<empty>'!r}")
    db_name = (parsed.path or "").lstrip("/")
    if db_name != "fusion":
        raise LocalSymbolTimePanelError(
            f"local panel build expects database 'fusion'. got: {db_name or '<empty>'!r}"
        )


def _ensure_tables(cur: object) -> None:
    cur.execute("CREATE SCHEMA IF NOT EXISTS training")
    cur.execute("CREATE SCHEMA IF NOT EXISTS ops")

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS training.matrix_panel_1h (
          sample_id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          bucket_ts TIMESTAMPTZ NOT NULL,
          trade_date DATE NOT NULL,
          feature_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(symbol, bucket_ts)
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS training.matrix_panel_targets_1h (
          sample_id TEXT PRIMARY KEY REFERENCES training.matrix_panel_1h(sample_id) ON DELETE CASCADE,
          symbol TEXT NOT NULL,
          bucket_ts TIMESTAMPTZ NOT NULL,
          trade_date DATE NOT NULL,
          target_price_30d NUMERIC,
          target_price_90d NUMERIC,
          target_price_180d NUMERIC,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(symbol, bucket_ts)
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS ops.local_panel_build_manifest (
          run_id TEXT PRIMARY KEY,
          built_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          db_url TEXT NOT NULL,
          panel_rows BIGINT NOT NULL,
          target_rows BIGINT NOT NULL,
          symbol_count BIGINT NOT NULL,
          min_trade_date DATE,
          max_trade_date DATE,
          notes TEXT NOT NULL
        )
        """
    )

    cur.execute(
        "CREATE INDEX IF NOT EXISTS matrix_panel_1h_symbol_ts_idx ON training.matrix_panel_1h(symbol, bucket_ts)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS matrix_panel_1h_trade_date_idx ON training.matrix_panel_1h(trade_date)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS matrix_panel_targets_1h_trade_date_idx ON training.matrix_panel_targets_1h(trade_date)"
    )


def _summarize_stage(cur: object) -> PanelBuildSummary:
    cur.execute(
        """
        WITH panel AS (
        """
        + PANEL_STAGE_SQL
        + """
        )
        SELECT
          COUNT(*)::BIGINT AS row_count,
          COUNT(*) FILTER (WHERE target_price_30d IS NOT NULL AND target_price_90d IS NOT NULL AND target_price_180d IS NOT NULL)::BIGINT AS target_rows,
          COUNT(DISTINCT symbol)::BIGINT AS symbol_count,
          MIN(trade_date) AS min_trade_date,
          MAX(trade_date) AS max_trade_date
        FROM panel
        """,
        {"numeric_regex": NUMERIC_TEXT_REGEX},
    )
    row_count, target_rows, symbol_count, min_trade_date, max_trade_date = cur.fetchone()
    return PanelBuildSummary(
        panel_rows=int(row_count or 0),
        target_rows=int(target_rows or 0),
        symbol_count=int(symbol_count or 0),
        min_trade_date=str(min_trade_date) if min_trade_date else None,
        max_trade_date=str(max_trade_date) if max_trade_date else None,
    )


def _build_panel(cur: object) -> PanelBuildSummary:
    cur.execute(
        "CREATE TEMP TABLE training_panel_stage ON COMMIT DROP AS " + PANEL_STAGE_SQL,
        {"numeric_regex": NUMERIC_TEXT_REGEX},
    )

    cur.execute("TRUNCATE TABLE training.matrix_panel_targets_1h, training.matrix_panel_1h")

    cur.execute(
        """
        INSERT INTO training.matrix_panel_1h (
          sample_id,
          symbol,
          bucket_ts,
          trade_date,
          feature_snapshot,
          created_at,
          ingested_at
        )
        SELECT
          sample_id,
          symbol,
          bucket_ts,
          trade_date,
          feature_snapshot,
          NOW(),
          NOW()
        FROM training_panel_stage
        ORDER BY bucket_ts, symbol
        """
    )

    cur.execute(
        """
        INSERT INTO training.matrix_panel_targets_1h (
          sample_id,
          symbol,
          bucket_ts,
          trade_date,
          target_price_30d,
          target_price_90d,
          target_price_180d,
          created_at,
          ingested_at
        )
        SELECT
          sample_id,
          symbol,
          bucket_ts,
          trade_date,
          target_price_30d,
          target_price_90d,
          target_price_180d,
          NOW(),
          NOW()
        FROM training_panel_stage
        ORDER BY bucket_ts, symbol
        """
    )

    cur.execute(
        """
        SELECT
          COUNT(*)::BIGINT AS row_count,
          COUNT(*) FILTER (WHERE target_price_30d IS NOT NULL AND target_price_90d IS NOT NULL AND target_price_180d IS NOT NULL)::BIGINT AS target_rows,
          COUNT(DISTINCT symbol)::BIGINT AS symbol_count,
          MIN(trade_date) AS min_trade_date,
          MAX(trade_date) AS max_trade_date
        FROM training_panel_stage
        """
    )
    row_count, target_rows, symbol_count, min_trade_date, max_trade_date = cur.fetchone()
    return PanelBuildSummary(
        panel_rows=int(row_count or 0),
        target_rows=int(target_rows or 0),
        symbol_count=int(symbol_count or 0),
        min_trade_date=str(min_trade_date) if min_trade_date else None,
        max_trade_date=str(max_trade_date) if max_trade_date else None,
    )


def run(*, db_url: str, dry_run: bool = True, approved: bool = False) -> dict[str, object]:
    _validate_local_db_url(db_url)

    payload: dict[str, object] = {
        "phase": "build-local-symbol-time-panel",
        "dry_run": dry_run,
        "approved": approved,
        "db_url": db_url,
        "reads": [
            "raw.databento_ohlcv_1h",
            "raw.databento_ohlcv_1d",
        ],
        "writes": [
            "training.matrix_panel_1h",
            "training.matrix_panel_targets_1h",
            "ops.local_panel_build_manifest",
        ],
        "cloud_writes": [],
        "status": "dry-run" if dry_run else "pending",
    }

    with psycopg2.connect(db_url, connect_timeout=10, application_name="fusion_build_local_symbol_time_panel") as conn:
        with conn.cursor() as cur:
            _ensure_tables(cur)
            if dry_run:
                summary = _summarize_stage(cur)
            else:
                if not approved:
                    raise LocalSymbolTimePanelError(
                        "local panel build requires explicit approval. pass approved=True or --execute"
                    )
                summary = _build_panel(cur)
                run_id = f"local-symbol-time-panel-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
                cur.execute(
                    """
                    INSERT INTO ops.local_panel_build_manifest (
                      run_id,
                      db_url,
                      panel_rows,
                      target_rows,
                      symbol_count,
                      min_trade_date,
                      max_trade_date,
                      notes
                    ) VALUES (%s, %s, %s, %s, %s, %s::date, %s::date, %s)
                    ON CONFLICT (run_id) DO NOTHING
                    """,
                    (
                        run_id,
                        db_url,
                        summary.panel_rows,
                        summary.target_rows,
                        summary.symbol_count,
                        summary.min_trade_date,
                        summary.max_trade_date,
                        "local-only symbol-time panel build from raw Databento hourly + ZL daily targets",
                    ),
                )
                payload["run_id"] = run_id

    payload.update(
        {
            "panel_rows": summary.panel_rows,
            "target_rows": summary.target_rows,
            "symbol_count": summary.symbol_count,
            "trade_date_min": summary.min_trade_date,
            "trade_date_max": summary.max_trade_date,
            "status": "dry-run" if dry_run else "ok",
        }
    )
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a local-only symbol-time AG panel in localhost/fusion")
    parser.add_argument(
        "--db-url",
        default=resolve_local_training_db_url(),
        help="local postgres URL (default: FUSION_LOCAL_TRAINING_DB_URL / LOCAL_TRAINING_DB_URL / localhost)",
    )
    parser.add_argument("--execute", action="store_true", help="perform local DB writes")
    args = parser.parse_args()

    result = run(db_url=args.db_url, dry_run=not args.execute, approved=args.execute)
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
