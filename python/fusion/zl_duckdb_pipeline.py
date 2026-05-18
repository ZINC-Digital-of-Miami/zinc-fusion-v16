from __future__ import annotations

import argparse
import base64
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import uuid4

import duckdb
import psycopg2
from psycopg2.extras import execute_values

from .config import resolve_cloud_db_url


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DUCKDB_PATH = ROOT / "data/duckdb/zinc_fusion_raw.duckdb"
DATASET = "GLBX.MDP3"
DATABENTO_SYMBOL = "ZL.n.0"
DATABENTO_SCHEMA = "ohlcv-1h"
SOURCE = "databento"
RAW_SCHEMA = "raw"
OPS_SCHEMA = "ops"
RAW_HOURLY_TABLE = "databento_zl_ohlcv_1h"
OPS_FETCH_LOG_TABLE = "databento_zl_fetch_log"
RAW_HOURLY_RELATION = f"{RAW_SCHEMA}.{RAW_HOURLY_TABLE}"


@dataclass(frozen=True)
class HourlyBar:
    symbol: str
    databento_symbol: str
    bucket_ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int


@dataclass(frozen=True)
class DailyBar:
    symbol: str
    bucket_ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int


@dataclass(frozen=True)
class DatabentoResponse:
    status: int
    body: str
    url: str


@dataclass(frozen=True)
class RefreshSummary:
    status: str
    duckdb_path: str
    fetched_rows: int
    hourly_promoted: int
    daily_promoted: int
    latest_observed_at: str | None
    start: str
    end: str
    http_status: int | None


@dataclass
class DuckDBWorkspace:
    conn: duckdb.DuckDBPyConnection
    db_path: Path
    target_path: Path
    temp_dir: Path | None = None
    closed: bool = False

    def close(self, *, commit: bool = True) -> None:
        if self.closed:
            return
        try:
            try:
                self.conn.execute("CHECKPOINT")
            except duckdb.Error:
                pass
            self.conn.close()
            if commit and self.temp_dir is not None:
                self.target_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(self.db_path, self.target_path)
        finally:
            if self.temp_dir is not None:
                shutil.rmtree(self.temp_dir, ignore_errors=True)
            self.closed = True


def load_env_file(path: Path = ROOT / ".env.local") -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def initialize_duckdb(conn: duckdb.DuckDBPyConnection) -> None:
    raw_schema = _duckdb_schema(conn, RAW_SCHEMA)
    ops_schema = _duckdb_schema(conn, OPS_SCHEMA)
    raw_hourly_table = _duckdb_table(conn, RAW_SCHEMA, RAW_HOURLY_TABLE)
    fetch_log_table = _duckdb_table(conn, OPS_SCHEMA, OPS_FETCH_LOG_TABLE)

    conn.execute(f"CREATE SCHEMA IF NOT EXISTS {raw_schema}")
    conn.execute(f"CREATE SCHEMA IF NOT EXISTS {ops_schema}")
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {raw_hourly_table} (
          symbol TEXT NOT NULL,
          databento_symbol TEXT NOT NULL,
          bucket_ts TIMESTAMPTZ NOT NULL,
          open DOUBLE NOT NULL,
          high DOUBLE NOT NULL,
          low DOUBLE NOT NULL,
          close DOUBLE NOT NULL,
          volume BIGINT NOT NULL,
          http_status INTEGER NOT NULL,
          source_url TEXT NOT NULL,
          fetched_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (symbol, bucket_ts)
        )
        """
    )
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {fetch_log_table} (
          run_id TEXT PRIMARY KEY,
          started_at TIMESTAMPTZ NOT NULL,
          finished_at TIMESTAMPTZ NOT NULL,
          status TEXT NOT NULL,
          start_ts TEXT NOT NULL,
          end_ts TEXT NOT NULL,
          http_status INTEGER,
          records_upserted INTEGER NOT NULL,
          error_message TEXT
        )
        """
    )


def connect_duckdb(path: Path) -> duckdb.DuckDBPyConnection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = duckdb.connect(str(path))
    initialize_duckdb(conn)
    return conn


def open_duckdb_workspace(path: Path, *, force_staged: bool = False) -> DuckDBWorkspace:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not force_staged:
        try:
            conn = duckdb.connect(str(path))
            initialize_duckdb(conn)
            return DuckDBWorkspace(conn=conn, db_path=path, target_path=path)
        except duckdb.IOException as exc:
            if "File locks are not supported" not in str(exc):
                raise

    temp_dir = Path(tempfile.mkdtemp(prefix="zinc-fusion-duckdb-"))
    staged_path = temp_dir / path.name
    if path.exists() and path.stat().st_size > 0:
        shutil.copy2(path, staged_path)
    conn = duckdb.connect(str(staged_path))
    initialize_duckdb(conn)
    return DuckDBWorkspace(
        conn=conn,
        db_path=staged_path,
        target_path=path,
        temp_dir=temp_dir,
    )


def _quote_duckdb_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _duckdb_schema(conn: duckdb.DuckDBPyConnection, schema: str) -> str:
    catalog = conn.execute("SELECT current_catalog()").fetchone()[0]
    return f"{_quote_duckdb_identifier(catalog)}.{_quote_duckdb_identifier(schema)}"


def _duckdb_table(conn: duckdb.DuckDBPyConnection, schema: str, table: str) -> str:
    return f"{_duckdb_schema(conn, schema)}.{_quote_duckdb_identifier(table)}"


def _utc_datetime_from_ns(ns_value: str | int) -> datetime:
    seconds = int(ns_value) / 1_000_000_000
    return datetime.fromtimestamp(seconds, tz=timezone.utc)


def _price(value: object) -> float:
    numeric = float(value)
    if abs(numeric) >= 10_000:
        return numeric / 1_000_000_000
    return numeric


def parse_databento_ndjson(payload: str, *, http_status: int) -> list[HourlyBar]:
    if http_status not in (200, 206):
        raise RuntimeError(f"Databento HTTP {http_status} is not parseable")

    bars: list[HourlyBar] = []
    for line in payload.splitlines():
        if not line.strip():
            continue
        try:
            record = json.loads(line)
            close = _price(record["close"])
            if close == 0:
                continue
            bars.append(
                HourlyBar(
                    symbol="ZL",
                    databento_symbol=DATABENTO_SYMBOL,
                    bucket_ts=_utc_datetime_from_ns(record["hd"]["ts_event"]),
                    open=_price(record["open"]),
                    high=_price(record["high"]),
                    low=_price(record["low"]),
                    close=close,
                    volume=int(record.get("volume", 0)),
                )
            )
        except (json.JSONDecodeError, KeyError, TypeError, ValueError):
            continue
    return bars


def upsert_hourly_bars(
    conn: duckdb.DuckDBPyConnection,
    bars: Iterable[HourlyBar],
    *,
    http_status: int,
    source_url: str,
) -> int:
    rows = [
        (
            bar.symbol,
            bar.databento_symbol,
            bar.bucket_ts,
            bar.open,
            bar.high,
            bar.low,
            bar.close,
            bar.volume,
            http_status,
            source_url,
            datetime.now(timezone.utc),
        )
        for bar in bars
    ]
    if not rows:
        return 0

    raw_hourly_table = _duckdb_table(conn, RAW_SCHEMA, RAW_HOURLY_TABLE)
    conn.executemany(
        f"""
        INSERT OR REPLACE INTO {raw_hourly_table} (
          symbol, databento_symbol, bucket_ts, open, high, low, close, volume,
          http_status, source_url, fetched_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    return len(rows)


def latest_hourly_bar(conn: duckdb.DuckDBPyConnection) -> HourlyBar | None:
    raw_hourly_table = _duckdb_table(conn, RAW_SCHEMA, RAW_HOURLY_TABLE)
    row = conn.execute(
        f"""
        SELECT symbol, databento_symbol, bucket_ts, open, high, low, close, volume
        FROM {raw_hourly_table}
        WHERE symbol = 'ZL'
        ORDER BY bucket_ts DESC
        LIMIT 1
        """
    ).fetchone()
    if row is None:
        return None
    return HourlyBar(row[0], row[1], _as_utc(row[2]), row[3], row[4], row[5], row[6], row[7])


def latest_hourly_ts(conn: duckdb.DuckDBPyConnection) -> datetime | None:
    raw_hourly_table = _duckdb_table(conn, RAW_SCHEMA, RAW_HOURLY_TABLE)
    row = conn.execute(
        f"SELECT max(bucket_ts) FROM {raw_hourly_table} WHERE symbol = 'ZL'"
    ).fetchone()
    if row is None or row[0] is None:
        return None
    return _as_utc(row[0])


def rollup_daily_rows(conn: duckdb.DuckDBPyConnection, *, since: datetime | None = None) -> list[DailyBar]:
    raw_hourly_table = _duckdb_table(conn, RAW_SCHEMA, RAW_HOURLY_TABLE)
    where = "WHERE symbol = 'ZL'"
    params: list[object] = []
    if since is not None:
        where += " AND bucket_ts >= ?"
        params.append(since)

    rows = conn.execute(
        f"""
        SELECT
          symbol,
          date_trunc('day', bucket_ts AT TIME ZONE 'UTC') AS bucket_ts,
          first(open ORDER BY bucket_ts ASC) AS open,
          max(high) AS high,
          min(low) AS low,
          first(close ORDER BY bucket_ts DESC) AS close,
          sum(volume)::BIGINT AS volume
        FROM {raw_hourly_table}
        {where}
        GROUP BY symbol, date_trunc('day', bucket_ts AT TIME ZONE 'UTC')
        HAVING sum(volume) >= 100
        ORDER BY bucket_ts
        """,
        params,
    ).fetchall()

    return [
        DailyBar(
            symbol=row[0],
            bucket_ts=_as_utc(row[1]),
            open=float(row[2]),
            high=float(row[3]),
            low=float(row[4]),
            close=float(row[5]),
            volume=int(row[6]),
        )
        for row in rows
    ]


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _iso_z(value: datetime) -> str:
    return _as_utc(value).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _basic_auth(api_key: str) -> str:
    token = base64.b64encode(f"{api_key}:".encode("utf-8")).decode("ascii")
    return f"Basic {token}"


def fetch_dataset_end(api_key: str, *, timeout: int) -> str | None:
    request = Request(
        f"https://hist.databento.com/v0/metadata.get_dataset_range?dataset={DATASET}",
        headers={"Authorization": _basic_auth(api_key)},
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
    except (HTTPError, URLError, TimeoutError):
        return None
    try:
        parsed = json.loads(body)
        return (
            parsed.get("schema", {}).get(DATABENTO_SCHEMA, {}).get("end")
            or parsed.get("end")
        )
    except (TypeError, json.JSONDecodeError):
        return None


def build_databento_url(start: str, end: str) -> str:
    return "https://hist.databento.com/v0/timeseries.get_range?" + urlencode(
        {
            "dataset": DATASET,
            "symbols": DATABENTO_SYMBOL,
            "schema": DATABENTO_SCHEMA,
            "stype_in": "continuous",
            "start": start,
            "end": end,
            "encoding": "json",
        }
    )


def fetch_databento_range(
    api_key: str,
    *,
    start: str,
    end: str,
    timeout: int,
    max_retries: int,
) -> DatabentoResponse:
    url = build_databento_url(start, end)
    request = Request(url, headers={"Authorization": _basic_auth(api_key)})
    last_error: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            with urlopen(request, timeout=timeout) as response:
                return DatabentoResponse(response.status, response.read().decode("utf-8"), url)
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            if exc.code in (200, 206):
                return DatabentoResponse(exc.code, body, url)
            last_error = RuntimeError(f"Databento HTTP {exc.code}: {body[:500]}")
        except (URLError, TimeoutError) as exc:
            last_error = exc
        if attempt < max_retries:
            continue
    raise RuntimeError(str(last_error) if last_error else "Databento request failed")


def resolve_databento_key(db_url: str | None) -> str:
    env_key = os.getenv("DATABENTO_API_KEY")
    if env_key:
        return env_key
    if not db_url:
        raise RuntimeError("Set DATABENTO_API_KEY or a cloud DB URL that can read Vault")
    with psycopg2.connect(db_url, connect_timeout=10, application_name="zl_duckdb_vault_read") as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT decrypted_secret
                FROM vault.decrypted_secrets
                WHERE name IN ('databento_api_key_v2', 'databento_api_key')
                ORDER BY CASE WHEN name = 'databento_api_key_v2' THEN 0 ELSE 1 END
                LIMIT 1
                """
            )
            row = cur.fetchone()
    if not row or not row[0]:
        raise RuntimeError("Databento API key not found in env or Supabase Vault")
    return str(row[0])


def bootstrap_from_supabase(
    conn: duckdb.DuckDBPyConnection,
    db_url: str,
    *,
    lookback_days: int,
) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    with psycopg2.connect(db_url, connect_timeout=10, application_name="zl_duckdb_bootstrap") as pg:
        with pg.cursor() as cur:
            cur.execute(
                """
                SELECT symbol, bucket_ts, open, high, low, close, volume
                FROM mkt.price_1h
                WHERE symbol = 'ZL' AND bucket_ts >= %s
                ORDER BY bucket_ts
                """,
                (cutoff,),
            )
            rows = cur.fetchall()
    bars = [
        HourlyBar(
            symbol=row[0],
            databento_symbol=DATABENTO_SYMBOL,
            bucket_ts=_as_utc(row[1]),
            open=float(row[2]),
            high=float(row[3]),
            low=float(row[4]),
            close=float(row[5]),
            volume=int(row[6]),
        )
        for row in rows
    ]
    return upsert_hourly_bars(conn, bars, http_status=200, source_url="supabase-bootstrap")


def promote_to_supabase(
    conn: duckdb.DuckDBPyConnection,
    db_url: str,
    *,
    since: datetime,
) -> tuple[int, int, datetime | None]:
    raw_hourly_table = _duckdb_table(conn, RAW_SCHEMA, RAW_HOURLY_TABLE)
    hourly_rows = conn.execute(
        f"""
        SELECT symbol, bucket_ts, open, high, low, close, volume
        FROM {raw_hourly_table}
        WHERE symbol = 'ZL' AND bucket_ts >= ?
        ORDER BY bucket_ts
        """,
        [since],
    ).fetchall()
    daily_rows = rollup_daily_rows(conn, since=since.replace(hour=0, minute=0, second=0, microsecond=0))
    latest = latest_hourly_bar(conn)

    with psycopg2.connect(db_url, connect_timeout=10, application_name="zl_duckdb_promote") as pg:
        with pg.cursor() as cur:
            if hourly_rows:
                execute_values(
                    cur,
                    """
                    INSERT INTO mkt.price_1h (symbol, bucket_ts, open, high, low, close, volume)
                    VALUES %s
                    ON CONFLICT (symbol, bucket_ts) DO UPDATE SET
                      open = EXCLUDED.open,
                      high = EXCLUDED.high,
                      low = EXCLUDED.low,
                      close = EXCLUDED.close,
                      volume = EXCLUDED.volume,
                      ingested_at = now()
                    """,
                    hourly_rows,
                )
            if daily_rows:
                execute_values(
                    cur,
                    """
                    INSERT INTO mkt.price_1d (symbol, bucket_ts, open, high, low, close, volume)
                    VALUES %s
                    ON CONFLICT (symbol, bucket_ts) DO UPDATE SET
                      open = EXCLUDED.open,
                      high = EXCLUDED.high,
                      low = EXCLUDED.low,
                      close = EXCLUDED.close,
                      volume = EXCLUDED.volume,
                      ingested_at = now()
                    """,
                    [
                        (
                            row.symbol,
                            row.bucket_ts,
                            row.open,
                            row.high,
                            row.low,
                            row.close,
                            row.volume,
                        )
                        for row in daily_rows
                    ],
                )
            if latest is not None:
                cur.execute(
                    """
                    INSERT INTO mkt.latest_price (symbol, price, observed_at, ingested_at)
                    VALUES (%s, %s, %s, now())
                    ON CONFLICT (symbol) DO UPDATE SET
                      price = EXCLUDED.price,
                      observed_at = EXCLUDED.observed_at,
                      ingested_at = now()
                    """,
                    (latest.symbol, latest.close, latest.bucket_ts),
                )
            cur.execute(
                """
                INSERT INTO ops.ingest_run (
                  run_id, job_name, source, status, started_at, finished_at,
                  records_upserted, error_message
                )
                VALUES (%s, %s, %s, %s, now(), now(), %s, NULL)
                """,
                (
                    str(uuid4()),
                    "duckdb_zl_databento_refresh",
                    SOURCE,
                    "SUCCESS",
                    len(hourly_rows),
                ),
            )
        pg.commit()

    return len(hourly_rows), len(daily_rows), latest.bucket_ts if latest else None


def log_duckdb_fetch(
    conn: duckdb.DuckDBPyConnection,
    *,
    started_at: datetime,
    status: str,
    start_ts: str,
    end_ts: str,
    http_status: int | None,
    records: int,
    error_message: str | None,
) -> None:
    fetch_log_table = _duckdb_table(conn, OPS_SCHEMA, OPS_FETCH_LOG_TABLE)
    conn.execute(
        f"""
        INSERT INTO {fetch_log_table} (
          run_id, started_at, finished_at, status, start_ts, end_ts,
          http_status, records_upserted, error_message
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            str(uuid4()),
            started_at,
            datetime.now(timezone.utc),
            status,
            start_ts,
            end_ts,
            http_status,
            records,
            error_message,
        ],
    )


def run_refresh(args: argparse.Namespace) -> RefreshSummary:
    load_env_file()
    db_url = resolve_cloud_db_url()
    duckdb_path = Path(args.duckdb)
    workspace = open_duckdb_workspace(duckdb_path)
    conn = workspace.conn
    started_at = datetime.now(timezone.utc)
    http_status: int | None = None
    fetched_rows = 0
    hourly_promoted = 0
    daily_promoted = 0
    latest_observed_at: datetime | None = None
    start = args.start or ""
    end = args.end or ""

    try:
        if latest_hourly_ts(conn) is None and db_url:
            bootstrap_from_supabase(conn, db_url, lookback_days=args.bootstrap_days)

        latest_ts = latest_hourly_ts(conn)
        if args.start:
            start_dt = datetime.fromisoformat(args.start.replace("Z", "+00:00"))
        elif latest_ts is not None:
            start_dt = latest_ts - timedelta(hours=args.overlap_hours)
        else:
            start_dt = datetime.now(timezone.utc) - timedelta(hours=args.backfill_hours)

        api_key = resolve_databento_key(db_url)
        end = args.end or fetch_dataset_end(api_key, timeout=args.timeout) or _iso_z(datetime.now(timezone.utc))
        start = _iso_z(start_dt)

        response = fetch_databento_range(
            api_key,
            start=start,
            end=end,
            timeout=args.timeout,
            max_retries=args.max_retries,
        )
        http_status = response.status
        bars = parse_databento_ndjson(response.body, http_status=response.status)
        fetched_rows = upsert_hourly_bars(conn, bars, http_status=response.status, source_url=response.url)

        if args.promote:
            if not db_url:
                raise RuntimeError("Cannot promote without a cloud DB URL")
            hourly_promoted, daily_promoted, latest_observed_at = promote_to_supabase(
                conn,
                db_url,
                since=start_dt,
            )

        log_duckdb_fetch(
            conn,
            started_at=started_at,
            status="SUCCESS",
            start_ts=start,
            end_ts=end,
            http_status=http_status,
            records=fetched_rows,
            error_message=None,
        )
        return RefreshSummary(
            status="SUCCESS",
            duckdb_path=str(duckdb_path),
            fetched_rows=fetched_rows,
            hourly_promoted=hourly_promoted,
            daily_promoted=daily_promoted,
            latest_observed_at=_iso_z(latest_observed_at) if latest_observed_at else None,
            start=start,
            end=end,
            http_status=http_status,
        )
    except Exception as exc:
        log_duckdb_fetch(
            conn,
            started_at=started_at,
            status="FAILED",
            start_ts=start,
            end_ts=end,
            http_status=http_status,
            records=fetched_rows,
            error_message=str(exc),
        )
        raise
    finally:
        workspace.close()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Refresh ZL Databento raw bars into local DuckDB and promote serving rows to Supabase."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    refresh = subparsers.add_parser("refresh")
    refresh.add_argument("--duckdb", default=str(DEFAULT_DUCKDB_PATH))
    refresh.add_argument("--start", help="ISO UTC start override, e.g. 2026-05-15T00:00:00Z")
    refresh.add_argument("--end", help="ISO UTC end override")
    refresh.add_argument("--backfill-hours", type=int, default=72)
    refresh.add_argument("--bootstrap-days", type=int, default=14)
    refresh.add_argument("--overlap-hours", type=int, default=12)
    refresh.add_argument("--timeout", type=int, default=120)
    refresh.add_argument("--max-retries", type=int, default=2)
    refresh.add_argument("--promote", action=argparse.BooleanOptionalAction, default=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "refresh":
        summary = run_refresh(args)
        print(json.dumps(summary.__dict__, indent=2))
        return 0
    parser.error(f"unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
