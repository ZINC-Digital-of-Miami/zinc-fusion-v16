from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

from .artifacts import (
    assert_no_target_columns,
    feature_columns,
    matrix_path,
    read_parquet,
    signals_path,
    specialist_features_path,
    target_columns,
)
from .config import SPECIALISTS, load_config


class PromotionApprovalError(RuntimeError):
    pass


def _resolve_db_url() -> str | None:
    cfg = load_config()
    return cfg.supabase_db_url or cfg.supabase_pooler_url


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
        raise RuntimeError("matrix artifact has no target label columns")
    features = feature_columns(matrix.columns)
    if not features:
        raise RuntimeError("matrix artifact has no feature columns")
    for label in labels:
        series = pd.to_numeric(matrix[label], errors="coerce")
        null_count = int(series.isna().sum())
        try:
            horizon = int(label.replace("target_price_", "").replace("d", ""))
        except ValueError:
            horizon = 0
        if null_count > horizon:
            raise RuntimeError(f"{label} NULL rows={null_count} (>horizon={horizon})")
        if null_count > 0:
            null_positions = series[series.isna()].index.to_list()
            trailing = list(range(len(series) - null_count, len(series)))
            if null_positions != trailing:
                raise RuntimeError(f"{label} NULL rows are not trailing-only")
    return matrix


def _validate_specialist(specialist: str) -> pd.DataFrame:
    frame = read_parquet(specialist_features_path(specialist))
    if frame.empty:
        raise RuntimeError(f"specialist artifact is empty: {specialist}")
    assert_no_target_columns(frame, context=f"{specialist} promotion artifact")
    return frame


def _validate_signals() -> pd.DataFrame:
    signals = read_parquet(signals_path())
    if signals.empty:
        raise RuntimeError("specialist signals artifact is empty")
    assert_no_target_columns(signals, context="signals promotion artifact")
    expected = len(SPECIALISTS) * 3
    actual = len([column for column in signals.columns if column != "trade_date"])
    if actual != expected:
        raise RuntimeError(f"specialist signals column count={actual}, expected={expected}")
    return signals


def _promote_matrix(cur: Any, matrix: pd.DataFrame) -> int:
    excluded = {"trade_date", *target_columns(matrix.columns)}
    rows = [
        (row["trade_date"], _json_from_row(row, exclude=excluded))
        for _, row in matrix.iterrows()
    ]
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


def _promote_specialist(cur: Any, specialist: str, frame: pd.DataFrame) -> int:
    rows = [
        (row["trade_date"], _json_from_row(row, exclude={"trade_date"}))
        for _, row in frame.iterrows()
    ]
    table_name = f"training.specialist_features_{specialist}"
    cur.execute(f"TRUNCATE TABLE {table_name}")
    execute_values(
        cur,
        f"""
        INSERT INTO {table_name} (trade_date, feature_payload, created_at, ingested_at)
        VALUES %s
        """,
        rows,
        template="(%s, %s::jsonb, NOW(), NOW())",
        page_size=1000,
    )
    return len(rows)


def _promote_signals(cur: Any, signals: pd.DataFrame) -> int:
    rows = [
        (row["trade_date"], _json_from_row(row, exclude={"trade_date"}))
        for _, row in signals.iterrows()
    ]
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


def run(*, dry_run: bool = True, approved: bool = False) -> dict[str, object]:
    matrix = _validate_matrix()
    specialists = {specialist: _validate_specialist(specialist) for specialist in SPECIALISTS}
    signals = _validate_signals()

    payload: dict[str, object] = {
        "phase": "promote",
        "dry_run": dry_run,
        "approved": approved,
        "reads": [
            str(matrix_path()),
            str(signals_path()),
            *[str(specialist_features_path(specialist)) for specialist in SPECIALISTS],
        ],
        "writes": ["training.matrix_1d", "training.specialist_signals_1d", *[f"training.specialist_features_{s}" for s in SPECIALISTS]],
        "target_columns_stripped_from_matrix_payload": target_columns(matrix.columns),
        "matrix_rows": int(len(matrix)),
        "signal_rows": int(len(signals)),
        "specialist_rows": {specialist: int(len(frame)) for specialist, frame in specialists.items()},
        "status": "dry-run" if dry_run else "pending",
    }

    if dry_run:
        return payload
    if not approved:
        raise PromotionApprovalError("Cloud promotion requires explicit approval. Pass approved=True or --execute.")

    db_url = _resolve_db_url()
    if not db_url:
        raise RuntimeError(
            "DATABASE_URL (or SUPABASE_DB_URL/POSTGRES_URL_NON_POOLING/POSTGRES_URL) is not set"
        )

    with psycopg2.connect(db_url, connect_timeout=10, application_name="fusion_promote_to_cloud") as conn:
        with conn.cursor() as cur:
            promoted = {
                "training.matrix_1d": _promote_matrix(cur, matrix),
                "training.specialist_signals_1d": _promote_signals(cur, signals),
            }
            for specialist, frame in specialists.items():
                promoted[f"training.specialist_features_{specialist}"] = _promote_specialist(cur, specialist, frame)

    payload["status"] = "ok"
    payload["promoted_rows"] = promoted
    payload["promoted_at"] = datetime.now(timezone.utc).isoformat()
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate and promote local V16 training artifacts to cloud Supabase")
    parser.add_argument("--dry-run", action="store_true", default=True, help="Validate local artifacts without cloud writes")
    parser.add_argument("--execute", action="store_true", help="Perform approved cloud promotion")
    args = parser.parse_args()

    result = run(dry_run=not args.execute, approved=args.execute)
    print(result)


if __name__ == "__main__":
    main()
