from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from urllib.parse import urlparse

import psycopg2
from psycopg2 import sql as pgsql
from psycopg2.extras import Json, execute_values

from .config import resolve_cloud_db_url, resolve_local_training_db_url


class LocalCloudSyncError(RuntimeError):
    pass


@dataclass(frozen=True)
class MirrorTable:
    schema: str
    table: str
    columns: tuple[str, ...]
    select_sql: str
    create_sql: str
    indexes_sql: tuple[str, ...]

    @property
    def fq_name(self) -> str:
        return f"{self.schema}.{self.table}"


def _validate_local_db_url(db_url: str) -> None:
    parsed = urlparse(db_url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise LocalCloudSyncError(f"local DB URL must be postgres/postgresql, got: {parsed.scheme!r}")
    host = (parsed.hostname or "").lower()
    if host not in {"localhost", "127.0.0.1", "::1"}:
        raise LocalCloudSyncError(f"local sync refuses non-local host: {host or '<empty>'!r}")
    db_name = (parsed.path or "").lstrip("/")
    if db_name != "fusion":
        raise LocalCloudSyncError(f"local sync expects database 'fusion', got: {db_name or '<empty>'!r}")


def _normalize_value(value: Any) -> Any:
    if isinstance(value, dict):
        return Json(value)
    if isinstance(value, list):
        return value
    if isinstance(value, Decimal):
        return value
    return value


MIRROR_TABLES: tuple[MirrorTable, ...] = (
    MirrorTable(
        schema="mkt",
        table="price_1h",
        columns=("symbol", "bucket_ts", "open", "high", "low", "close", "volume", "created_at", "ingested_at"),
        select_sql=(
            "SELECT symbol, bucket_ts, open, high, low, close, volume, created_at, ingested_at "
            "FROM mkt.price_1h ORDER BY symbol, bucket_ts"
        ),
        create_sql="""
            CREATE TABLE IF NOT EXISTS mkt.price_1h (
              id BIGSERIAL PRIMARY KEY,
              symbol TEXT NOT NULL,
              bucket_ts TIMESTAMPTZ NOT NULL,
              open NUMERIC NOT NULL,
              high NUMERIC NOT NULL,
              low NUMERIC NOT NULL,
              close NUMERIC NOT NULL,
              volume BIGINT NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE(symbol, bucket_ts)
            )
        """,
        indexes_sql=("CREATE INDEX IF NOT EXISTS price_1h_symbol_ts_idx ON mkt.price_1h(symbol, bucket_ts)",),
    ),
    MirrorTable(
        schema="mkt",
        table="price_1d",
        columns=("symbol", "bucket_ts", "open", "high", "low", "close", "volume", "created_at", "ingested_at"),
        select_sql=(
            "SELECT symbol, bucket_ts, open, high, low, close, volume, created_at, ingested_at "
            "FROM mkt.price_1d ORDER BY symbol, bucket_ts"
        ),
        create_sql="""
            CREATE TABLE IF NOT EXISTS mkt.price_1d (
              id BIGSERIAL PRIMARY KEY,
              symbol TEXT NOT NULL,
              bucket_ts TIMESTAMPTZ NOT NULL,
              open NUMERIC NOT NULL,
              high NUMERIC NOT NULL,
              low NUMERIC NOT NULL,
              close NUMERIC NOT NULL,
              volume BIGINT NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE(symbol, bucket_ts)
            )
        """,
        indexes_sql=("CREATE INDEX IF NOT EXISTS price_1d_symbol_ts_idx ON mkt.price_1d(symbol, bucket_ts)",),
    ),
    MirrorTable(
        schema="econ",
        table="weather_1d",
        columns=("series_id", "observation_date", "value", "payload", "created_at", "ingested_at"),
        select_sql=(
            "SELECT series_id, observation_date, value, payload, created_at, ingested_at "
            "FROM econ.weather_1d ORDER BY series_id, observation_date"
        ),
        create_sql="""
            CREATE TABLE IF NOT EXISTS econ.weather_1d (
              id BIGSERIAL PRIMARY KEY,
              series_id TEXT NOT NULL,
              observation_date DATE NOT NULL,
              value NUMERIC,
              payload JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE(series_id, observation_date)
            )
        """,
        indexes_sql=("CREATE INDEX IF NOT EXISTS weather_1d_series_date_idx ON econ.weather_1d(series_id, observation_date)",),
    ),
    MirrorTable(
        schema="alt",
        table="profarmer_news",
        columns=("external_id", "title", "body", "source", "specialist_tags", "published_at", "payload", "created_at", "ingested_at"),
        select_sql=(
            "SELECT external_id, title, body, source, specialist_tags, published_at, payload, created_at, ingested_at "
            "FROM alt.profarmer_news ORDER BY published_at, external_id NULLS LAST"
        ),
        create_sql="""
            CREATE TABLE IF NOT EXISTS alt.profarmer_news (
              id BIGSERIAL PRIMARY KEY,
              external_id TEXT UNIQUE,
              title TEXT NOT NULL,
              body TEXT,
              source TEXT NOT NULL,
              specialist_tags TEXT[] NOT NULL DEFAULT '{}'::text[],
              published_at TIMESTAMPTZ NOT NULL,
              payload JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """,
        indexes_sql=("CREATE INDEX IF NOT EXISTS profarmer_news_published_idx ON alt.profarmer_news(published_at)",),
    ),
    MirrorTable(
        schema="alt",
        table="news_events",
        columns=("external_id", "source", "title", "body", "specialist_tags", "published_at", "payload", "created_at", "ingested_at"),
        select_sql=(
            "SELECT external_id, source, title, body, specialist_tags, published_at, payload, created_at, ingested_at "
            "FROM alt.news_events ORDER BY published_at, external_id NULLS LAST"
        ),
        create_sql="""
            CREATE TABLE IF NOT EXISTS alt.news_events (
              id BIGSERIAL PRIMARY KEY,
              external_id TEXT UNIQUE,
              source TEXT NOT NULL,
              title TEXT NOT NULL,
              body TEXT,
              specialist_tags TEXT[] NOT NULL DEFAULT '{}'::text[],
              published_at TIMESTAMPTZ NOT NULL,
              payload JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """,
        indexes_sql=("CREATE INDEX IF NOT EXISTS news_events_published_idx ON alt.news_events(published_at)",),
    ),
    MirrorTable(
        schema="alt",
        table="legislation_1d",
        columns=("external_id", "title", "summary", "source", "published_at", "payload", "created_at", "ingested_at"),
        select_sql=(
            "SELECT external_id, title, summary, source, published_at, payload, created_at, ingested_at "
            "FROM alt.legislation_1d ORDER BY published_at, external_id NULLS LAST"
        ),
        create_sql="""
            CREATE TABLE IF NOT EXISTS alt.legislation_1d (
              id BIGSERIAL PRIMARY KEY,
              external_id TEXT UNIQUE,
              title TEXT NOT NULL,
              summary TEXT,
              source TEXT NOT NULL,
              published_at TIMESTAMPTZ NOT NULL,
              payload JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """,
        indexes_sql=("CREATE INDEX IF NOT EXISTS legislation_1d_published_idx ON alt.legislation_1d(published_at)",),
    ),
    MirrorTable(
        schema="alt",
        table="fed_speeches",
        columns=("external_id", "title", "summary", "source", "published_at", "payload", "created_at", "ingested_at"),
        select_sql=(
            "SELECT external_id, title, summary, source, published_at, payload, created_at, ingested_at "
            "FROM alt.fed_speeches ORDER BY published_at, external_id NULLS LAST"
        ),
        create_sql="""
            CREATE TABLE IF NOT EXISTS alt.fed_speeches (
              id BIGSERIAL PRIMARY KEY,
              external_id TEXT UNIQUE,
              title TEXT NOT NULL,
              summary TEXT,
              source TEXT NOT NULL,
              published_at TIMESTAMPTZ NOT NULL,
              payload JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """,
        indexes_sql=("CREATE INDEX IF NOT EXISTS fed_speeches_published_idx ON alt.fed_speeches(published_at)",),
    ),
    MirrorTable(
        schema="alt",
        table="executive_actions",
        columns=("external_id", "title", "summary", "source", "published_at", "payload", "created_at", "ingested_at"),
        select_sql=(
            "SELECT external_id, title, summary, source, published_at, payload, created_at, ingested_at "
            "FROM alt.executive_actions ORDER BY published_at, external_id NULLS LAST"
        ),
        create_sql="""
            CREATE TABLE IF NOT EXISTS alt.executive_actions (
              id BIGSERIAL PRIMARY KEY,
              external_id TEXT UNIQUE,
              title TEXT NOT NULL,
              summary TEXT,
              source TEXT NOT NULL,
              published_at TIMESTAMPTZ NOT NULL,
              payload JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """,
        indexes_sql=("CREATE INDEX IF NOT EXISTS executive_actions_published_idx ON alt.executive_actions(published_at)",),
    ),
)


def _ensure_manifest_table(cur: Any) -> None:
    cur.execute("CREATE SCHEMA IF NOT EXISTS ops")
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS ops.local_cloud_sync_manifest (
          run_id TEXT PRIMARY KEY,
          synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          cloud_reads JSONB NOT NULL,
          local_writes JSONB NOT NULL,
          row_counts JSONB NOT NULL,
          notes TEXT NOT NULL
        )
        """
    )


def _ensure_target_table(cur: Any, spec: MirrorTable) -> None:
    cur.execute(pgsql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(pgsql.Identifier(spec.schema)))
    cur.execute(spec.create_sql)
    for index_sql in spec.indexes_sql:
        cur.execute(index_sql)


def _fetch_rows(cur: Any, spec: MirrorTable, *, batch_size: int) -> list[tuple[Any, ...]]:
    cur.execute(spec.select_sql)
    rows: list[tuple[Any, ...]] = []
    while True:
        batch = cur.fetchmany(batch_size)
        if not batch:
            break
        rows.extend(batch)
    return rows


def _replace_local_table(cur: Any, spec: MirrorTable, rows: list[tuple[Any, ...]], *, page_size: int) -> int:
    _ensure_target_table(cur, spec)
    table_id = pgsql.Identifier(spec.schema, spec.table)
    cur.execute(pgsql.SQL("TRUNCATE TABLE {} RESTART IDENTITY").format(table_id))
    if not rows:
        return 0
    col_ids = pgsql.SQL(", ").join(pgsql.Identifier(c) for c in spec.columns)
    template = "(" + ", ".join(["%s"] * len(spec.columns)) + ")"
    values = [tuple(_normalize_value(value) for value in row) for row in rows]
    execute_values(
        cur,
        pgsql.SQL("INSERT INTO {} ({}) VALUES %s").format(table_id, col_ids),
        values,
        template=template,
        page_size=page_size,
    )
    return len(values)


def run(*, dry_run: bool = True, batch_size: int = 10000, page_size: int = 5000) -> dict[str, object]:
    cloud_url = resolve_cloud_db_url()
    local_url = resolve_local_training_db_url()
    if not cloud_url:
        raise LocalCloudSyncError("Cloud DB URL is not configured")
    _validate_local_db_url(local_url)

    payload: dict[str, object] = {
        "phase": "sync-cloud-sources-to-local",
        "dry_run": dry_run,
        "cloud_reads": [spec.fq_name for spec in MIRROR_TABLES],
        "local_writes": [spec.fq_name for spec in MIRROR_TABLES] + ["ops.local_cloud_sync_manifest"],
        "row_counts": {},
        "status": "dry-run" if dry_run else "pending",
    }

    row_counts: dict[str, int] = {}
    fetched: dict[str, list[tuple[Any, ...]]] = {}
    with psycopg2.connect(cloud_url, connect_timeout=10, application_name="fusion_sync_cloud_sources_read") as cloud:
        with cloud.cursor() as cur:
            for spec in MIRROR_TABLES:
                rows = _fetch_rows(cur, spec, batch_size=batch_size)
                row_counts[spec.fq_name] = len(rows)
                if not dry_run:
                    fetched[spec.fq_name] = rows

    payload["row_counts"] = row_counts
    if dry_run:
        return payload

    run_id = f"local-cloud-sync-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    with psycopg2.connect(local_url, connect_timeout=10, application_name="fusion_sync_cloud_sources_write") as local:
        with local.cursor() as cur:
            _ensure_manifest_table(cur)
            promoted: dict[str, int] = {}
            for spec in MIRROR_TABLES:
                promoted[spec.fq_name] = _replace_local_table(
                    cur,
                    spec,
                    fetched[spec.fq_name],
                    page_size=page_size,
                )
            cur.execute(
                """
                INSERT INTO ops.local_cloud_sync_manifest (
                  run_id, cloud_reads, local_writes, row_counts, notes
                ) VALUES (%s, %s::jsonb, %s::jsonb, %s::jsonb, %s)
                """,
                (
                    run_id,
                    json.dumps(payload["cloud_reads"]),
                    json.dumps(payload["local_writes"]),
                    json.dumps(promoted, sort_keys=True),
                    "Cloud-to-local mirror for AG staging only; no cloud writes and no model training.",
                ),
            )

    payload["status"] = "ok"
    payload["run_id"] = run_id
    payload["promoted_rows"] = promoted
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Mirror cloud source tables into local Postgres for AG staging")
    parser.add_argument("--execute", action="store_true", help="write mirrored tables into local localhost/fusion")
    parser.add_argument("--batch-size", type=int, default=10000)
    parser.add_argument("--page-size", type=int, default=5000)
    args = parser.parse_args()
    result = run(dry_run=not args.execute, batch_size=args.batch_size, page_size=args.page_size)
    print(json.dumps(result, indent=2, sort_keys=True, default=str))


if __name__ == "__main__":
    main()
