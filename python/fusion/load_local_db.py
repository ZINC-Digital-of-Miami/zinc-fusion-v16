from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

from .artifacts import (
    feature_columns,
    matrix_path,
    read_parquet,
    signals_path,
    specialist_features_path,
    target_columns,
)
from .config import SPECIALISTS


class LocalLoadError(RuntimeError):
    pass


DEFAULT_LOCAL_DB_URL = "postgresql://zincdigital@localhost:5432/fusion"


@dataclass(frozen=True)
class LocalLoadSummary:
    matrix_rows: int
    signal_rows: int
    specialist_rows: dict[str, int]
    target_columns_stripped_from_matrix_payload: list[str]
    matrix_label_null_counts: dict[str, int]


def _validate_local_db_url(db_url: str) -> None:
    parsed = urlparse(db_url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise LocalLoadError(f"db url must be postgres/postgresql, got: {parsed.scheme!r}")
    host = (parsed.hostname or "").lower()
    if host not in {"localhost", "127.0.0.1", "::1"}:
        raise LocalLoadError(
            "local loader is hard-locked to localhost. refusing non-local host"
        )
    db_name = (parsed.path or "").lstrip("/")
    if db_name != "fusion":
        raise LocalLoadError(
            f"local loader expects database 'fusion'. got: {db_name or '<empty>'}"
        )


def _json_from_row(row: pd.Series, *, exclude: set[str]) -> str:
    payload: dict[str, Any] = {}
    for key, value in row.items():
        if key in exclude:
            continue
        if pd.isna(value):
            continue
        if isinstance(value, (pd.Timestamp, datetime)):
            payload[key] = value.isoformat()
        elif hasattr(value, "item"):
            payload[key] = value.item()
        else:
            payload[key] = value
    return json.dumps(payload, separators=(",", ":"), sort_keys=True)


def _validate_matrix() -> pd.DataFrame:
    matrix = read_parquet(matrix_path())
    labels = target_columns(matrix.columns)
    if not labels:
        raise LocalLoadError("matrix artifact has no target label columns")
    features = feature_columns(matrix.columns)
    if not features:
        raise LocalLoadError("matrix artifact has no feature columns")
    # Forward-label horizons naturally create trailing NULL rows; this is expected.
    # We only block if a target column has no usable labels at all.
    for label in labels:
        usable = int(matrix[label].notna().sum())
        if usable == 0:
            raise LocalLoadError(f"matrix target label column has no non-null rows: {label}")
    if "trade_date" not in matrix.columns:
        raise LocalLoadError("matrix artifact missing trade_date")
    return matrix.sort_values("trade_date").reset_index(drop=True)


def _validate_signals() -> pd.DataFrame:
    signals = read_parquet(signals_path())
    if signals.empty:
        raise LocalLoadError("specialist signals artifact is empty")
    expected = len(SPECIALISTS) * 3
    actual = len([column for column in signals.columns if column != "trade_date"])
    if actual != expected:
        raise LocalLoadError(f"specialist signals column count={actual}, expected={expected}")
    if "trade_date" not in signals.columns:
        raise LocalLoadError("specialist signals artifact missing trade_date")
    return signals.sort_values("trade_date").reset_index(drop=True)


def _validate_specialists() -> dict[str, pd.DataFrame]:
    payload: dict[str, pd.DataFrame] = {}
    for specialist in SPECIALISTS:
        frame = read_parquet(specialist_features_path(specialist))
        if frame.empty:
            raise LocalLoadError(f"specialist artifact is empty: {specialist}")
        leaked = target_columns(frame.columns)
        if leaked:
            raise LocalLoadError(f"specialist artifact {specialist} leaked targets: {leaked}")
        if "trade_date" not in frame.columns:
            raise LocalLoadError(f"specialist artifact missing trade_date: {specialist}")
        payload[specialist] = frame.sort_values("trade_date").reset_index(drop=True)
    return payload


def _ensure_training_tables(cur: Any) -> None:
    cur.execute("CREATE SCHEMA IF NOT EXISTS training")
    cur.execute("CREATE SCHEMA IF NOT EXISTS ops")

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS training.matrix_1d (
          id BIGSERIAL PRIMARY KEY,
          trade_date DATE NOT NULL UNIQUE,
          feature_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS training.specialist_signals_1d (
          id BIGSERIAL PRIMARY KEY,
          trade_date DATE NOT NULL UNIQUE,
          signal_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    for specialist in SPECIALISTS:
        cur.execute(
            f"""
            CREATE TABLE IF NOT EXISTS training.specialist_features_{specialist} (
              id BIGSERIAL PRIMARY KEY,
              trade_date DATE NOT NULL UNIQUE,
              feature_payload JSONB NOT NULL DEFAULT '{{}}'::jsonb,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS ops.local_load_manifest (
          run_id TEXT PRIMARY KEY,
          loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          db_url TEXT NOT NULL,
          matrix_rows BIGINT NOT NULL,
          signal_rows BIGINT NOT NULL,
          specialist_rows JSONB NOT NULL,
          source_paths JSONB NOT NULL,
          max_trade_date DATE NOT NULL
        )
        """
    )


def _load_matrix(cur: Any, matrix: pd.DataFrame) -> int:
    excluded = {"trade_date", *target_columns(matrix.columns)}
    rows = [(row["trade_date"], _json_from_row(row, exclude=excluded)) for _, row in matrix.iterrows()]
    cur.execute("TRUNCATE TABLE training.matrix_1d")
    execute_values(
        cur,
        """
        INSERT INTO training.matrix_1d (trade_date, feature_snapshot, created_at, ingested_at)
        VALUES %s
        """,
        rows,
        template="(%s, %s::jsonb, NOW(), NOW())",
        page_size=1000,
    )
    return len(rows)


def _load_signals(cur: Any, signals: pd.DataFrame) -> int:
    rows = [(row["trade_date"], _json_from_row(row, exclude={"trade_date"})) for _, row in signals.iterrows()]
    cur.execute("TRUNCATE TABLE training.specialist_signals_1d")
    execute_values(
        cur,
        """
        INSERT INTO training.specialist_signals_1d (trade_date, signal_payload, created_at, ingested_at)
        VALUES %s
        """,
        rows,
        template="(%s, %s::jsonb, NOW(), NOW())",
        page_size=1000,
    )
    return len(rows)


def _load_specialist(cur: Any, specialist: str, frame: pd.DataFrame) -> int:
    rows = [(row["trade_date"], _json_from_row(row, exclude={"trade_date"})) for _, row in frame.iterrows()]
    cur.execute(f"TRUNCATE TABLE training.specialist_features_{specialist}")
    execute_values(
        cur,
        f"""
        INSERT INTO training.specialist_features_{specialist} (trade_date, feature_payload, created_at, ingested_at)
        VALUES %s
        """,
        rows,
        template="(%s, %s::jsonb, NOW(), NOW())",
        page_size=1000,
    )
    return len(rows)


def _touch_source_manifest(cur: Any, *, min_trade_date: str, max_trade_date: str) -> None:
    cur.execute(
        """
        INSERT INTO ops.source_manifest (
          source_name, source_table, update_frequency, expected_row_count, min_date, max_date, last_validated, health_status, notes
        ) VALUES
          ('ag_matrix_local', 'training.matrix_1d', 'manual', NULL, %s::date, %s::date, NOW(), 'ok', 'Local AG matrix artifact load'),
          ('ag_signals_local', 'training.specialist_signals_1d', 'manual', NULL, %s::date, %s::date, NOW(), 'ok', 'Local AG specialist signal artifact load')
        ON CONFLICT (source_name) DO UPDATE SET
          source_table = EXCLUDED.source_table,
          update_frequency = EXCLUDED.update_frequency,
          min_date = EXCLUDED.min_date,
          max_date = EXCLUDED.max_date,
          last_validated = EXCLUDED.last_validated,
          health_status = EXCLUDED.health_status,
          notes = EXCLUDED.notes
        """,
        (min_trade_date, max_trade_date, min_trade_date, max_trade_date),
    )


def run(*, db_url: str = DEFAULT_LOCAL_DB_URL, dry_run: bool = True, approved: bool = False) -> dict[str, object]:
    _validate_local_db_url(db_url)
    matrix = _validate_matrix()
    signals = _validate_signals()
    specialists = _validate_specialists()

    min_trade_date = str(pd.to_datetime(matrix["trade_date"]).min().date())
    max_trade_date = str(pd.to_datetime(matrix["trade_date"]).max().date())

    summary = LocalLoadSummary(
        matrix_rows=int(len(matrix)),
        signal_rows=int(len(signals)),
        specialist_rows={name: int(len(frame)) for name, frame in specialists.items()},
        target_columns_stripped_from_matrix_payload=target_columns(matrix.columns),
        matrix_label_null_counts={
            label: int(matrix[label].isna().sum()) for label in target_columns(matrix.columns)
        },
    )

    payload: dict[str, object] = {
        "phase": "local-load",
        "dry_run": dry_run,
        "approved": approved,
        "db_url": db_url,
        "reads": [
            str(matrix_path()),
            str(signals_path()),
            *[str(specialist_features_path(specialist)) for specialist in SPECIALISTS],
        ],
        "writes": [
            "training.matrix_1d",
            "training.specialist_signals_1d",
            *[f"training.specialist_features_{specialist}" for specialist in SPECIALISTS],
            "ops.local_load_manifest",
            "ops.source_manifest",
        ],
        "matrix_rows": summary.matrix_rows,
        "signal_rows": summary.signal_rows,
        "specialist_rows": summary.specialist_rows,
        "trade_date_min": min_trade_date,
        "trade_date_max": max_trade_date,
        "target_columns_stripped_from_matrix_payload": summary.target_columns_stripped_from_matrix_payload,
        "matrix_label_null_counts": summary.matrix_label_null_counts,
        "status": "dry-run" if dry_run else "pending",
    }

    if dry_run:
        return payload
    if not approved:
        raise LocalLoadError("local load requires explicit approval. pass approved=True or --execute")

    run_id = f"local-load-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    source_paths = {
        "matrix": str(matrix_path()),
        "signals": str(signals_path()),
        "specialists": {specialist: str(specialist_features_path(specialist)) for specialist in SPECIALISTS},
    }

    with psycopg2.connect(db_url, connect_timeout=10, application_name="fusion_load_local_db") as conn:
        with conn.cursor() as cur:
            _ensure_training_tables(cur)
            promoted = {
                "training.matrix_1d": _load_matrix(cur, matrix),
                "training.specialist_signals_1d": _load_signals(cur, signals),
            }
            for specialist, frame in specialists.items():
                promoted[f"training.specialist_features_{specialist}"] = _load_specialist(cur, specialist, frame)

            _touch_source_manifest(
                cur,
                min_trade_date=min_trade_date,
                max_trade_date=max_trade_date,
            )
            cur.execute(
                """
                INSERT INTO ops.local_load_manifest (
                  run_id, db_url, matrix_rows, signal_rows, specialist_rows, source_paths, max_trade_date
                ) VALUES (%s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::date)
                ON CONFLICT (run_id) DO NOTHING
                """,
                (
                    run_id,
                    db_url,
                    summary.matrix_rows,
                    summary.signal_rows,
                    json.dumps(summary.specialist_rows, separators=(",", ":"), sort_keys=True),
                    json.dumps(source_paths, separators=(",", ":"), sort_keys=True),
                    max_trade_date,
                ),
            )

    payload["status"] = "ok"
    payload["promoted_rows"] = promoted
    payload["run_id"] = run_id
    payload["loaded_at"] = datetime.now(timezone.utc).isoformat()
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Load V16 AG artifacts into local fusion DB tables only")
    parser.add_argument(
        "--db-url",
        default=DEFAULT_LOCAL_DB_URL,
        help=f"local postgres URL (default: {DEFAULT_LOCAL_DB_URL})",
    )
    parser.add_argument("--execute", action="store_true", help="perform local DB writes")
    args = parser.parse_args()

    result = run(db_url=args.db_url, dry_run=not args.execute, approved=args.execute)
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
