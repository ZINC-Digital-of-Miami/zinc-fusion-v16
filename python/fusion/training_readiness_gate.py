from __future__ import annotations

import os
from dataclasses import asdict, dataclass
from datetime import date, datetime, timezone
from typing import Any

import pandas as pd
import psycopg2
from psycopg2 import sql

from .artifacts import (
    assert_no_target_columns,
    feature_columns,
    matrix_path,
    read_parquet,
    signals_path,
    specialist_features_path,
    target_columns,
)
from .config import SPECIALISTS, resolve_local_training_db_url

_ECO_TABLES: tuple[str, ...] = (
    "rates_1d",
    "inflation_1d",
    "labor_1d",
    "activity_1d",
    "money_1d",
    "vol_indices_1d",
    "commodities_1d",
)

_MATRIX_SYMBOL_COLUMN_MAP: dict[str, str] = {
    "ZL": "close",
    "ZS": "zs_close",
    "ZM": "zm_close",
    "CL": "cl_close",
}

_FRED_RAW_TABLES: tuple[tuple[str, str, str, str], ...] = (
    ("raw", "fred_economic_1d", "series_id", "observation_date"),
    ("raw", "fred_observations_1d", "series_id", "as_of_date"),
    ("raw", "fred_economic_full", "series_id", "date"),
    ("raw", "fred_financial_20251215", "series_id", "date"),
    ("raw", "fred_fx_20251215", "series_id", "date"),
    ("raw", "fred_rates_20251215", "series_id", "date"),
)

_WEATHER_SOURCE_TABLES: tuple[tuple[str, str, str, str], ...] = (
    ("econ", "weather_1d", "series_id", "observation_date"),
    ("raw", "weather_observations_1d", "station_id || ':' || variable_id", "as_of_date"),
    ("raw", "noaa_weather_1d", "station_id", "observation_date"),
)

_ALT_SOURCE_TABLES: tuple[tuple[str, str, str], ...] = (
    ("alt", "profarmer_news", "published_at"),
    ("alt", "news_events", "published_at"),
    ("alt", "legislation_1d", "published_at"),
    ("alt", "fed_speeches", "published_at"),
    ("alt", "executive_actions", "published_at"),
    ("raw", "news_buckets", "published_at"),
    ("raw", "bucket_news", "date"),
    ("raw", "usda_wasde", "report_date"),
    ("raw", "usda_export_sales", "report_date"),
    ("raw", "cftc_cot_full", "report_date"),
    ("raw", "cftc_cot_tff", "report_date"),
    ("raw", "eia_biofuels", "date"),
    ("raw", "epa_rin_prices", "date"),
)

_ISSUE_PREVIEW_LIMIT = 20


@dataclass(frozen=True)
class TrainingGateContract:
    required_symbols: tuple[str, ...]
    required_fred_series: tuple[str, ...]
    min_daily_rows_per_symbol: int
    min_hourly_rows_per_symbol: int
    min_symbol_count: int
    min_hourly_source_rows: int
    min_matrix_rows: int
    min_signal_rows: int
    min_specialist_feature_rows: int
    min_fred_series: int
    min_fred_rows: int
    min_weather_series: int
    min_weather_rows: int
    min_alt_rows: int
    max_daily_price_age_days: int
    max_hourly_price_age_hours: int
    max_factor_age_days: int
    max_profarmer_age_days: int
    max_training_trade_date_age_days: int
    max_daily_ohlc_violations: int
    max_hourly_ohlc_violations: int
    min_matrix_feature_keys: int
    min_specialist_feature_keys: int
    min_signal_keys: int
    max_specialist_leakage_match_ratio: float
    max_signal_identity_ratio: float
    enforce_cloud_local_parity: bool
    max_cloud_local_date_lag_days: int
    max_cloud_local_missing_ratio: float
    max_cloud_local_value_mismatch_ratio: float
    cloud_local_value_tolerance: float
    single_matrix_training_contract: bool
    require_options_data: bool
    min_options_rows: int
    max_options_age_days: int


class TrainingReadinessError(RuntimeError):
    pass


def _parse_csv(value: str | None, default: tuple[str, ...]) -> tuple[str, ...]:
    if not value:
        return default
    parsed = tuple(item.strip().upper() for item in value.split(",") if item.strip())
    return parsed or default


def _parse_float(value: str | None, default: float) -> float:
    if not value:
        return default
    return float(value)


def _as_utc_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=timezone.utc)
    if isinstance(value, str):
        parsed = pd.to_datetime(value, errors="coerce", utc=True)
        if pd.isna(parsed):
            return None
        return parsed.to_pydatetime()
    return None


def _age_hours(value: Any, now_utc: datetime) -> float | None:
    dt = _as_utc_datetime(value)
    if dt is None:
        return None
    return (now_utc - dt).total_seconds() / 3600.0


def _age_days(value: Any, now_utc: datetime) -> float | None:
    hours = _age_hours(value, now_utc)
    if hours is None:
        return None
    return hours / 24.0


def _ratio(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return float(numerator) / float(denominator)


def _format_issues(issues: list[str]) -> str:
    if len(issues) <= _ISSUE_PREVIEW_LIMIT:
        return "; ".join(issues)
    shown = "; ".join(issues[:_ISSUE_PREVIEW_LIMIT])
    return f"{shown}; ... {len(issues) - _ISSUE_PREVIEW_LIMIT} more"


def _table_exists(cur: Any, *, schema: str, table: str) -> bool:
    cur.execute(
        """
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = %s AND table_name = %s
        )
        """,
        (schema, table),
    )
    return bool(cur.fetchone()[0])


def _column_exists(cur: Any, *, schema: str, table: str, column: str) -> bool:
    cur.execute(
        """
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = %s AND table_name = %s AND column_name = %s
        )
        """,
        (schema, table, column),
    )
    return bool(cur.fetchone()[0])


def _load_contract() -> TrainingGateContract:
    enforce_parity = os.getenv("TRAINING_ENFORCE_CLOUD_LOCAL_PARITY", "0").strip().lower()
    single_matrix = os.getenv("TRAINING_SINGLE_MATRIX_CONTRACT", "1").strip().lower()
    require_options = os.getenv("TRAINING_REQUIRE_OPTIONS", "0").strip().lower()
    return TrainingGateContract(
        required_symbols=_parse_csv(
            os.getenv("TRAINING_REQUIRED_SYMBOLS"),
            (),
        ),
        required_fred_series=_parse_csv(
            os.getenv("TRAINING_REQUIRED_FRED_SERIES"),
            (),
        ),
        min_daily_rows_per_symbol=int(os.getenv("TRAINING_MIN_DAILY_ROWS_PER_SYMBOL", "250")),
        min_hourly_rows_per_symbol=int(os.getenv("TRAINING_MIN_HOURLY_ROWS_PER_SYMBOL", "500")),
        min_symbol_count=int(os.getenv("TRAINING_MIN_SYMBOL_COUNT", "20")),
        min_hourly_source_rows=int(os.getenv("TRAINING_MIN_HOURLY_SOURCE_ROWS", "500000")),
        min_matrix_rows=int(os.getenv("TRAINING_MIN_MATRIX_ROWS", "500000")),
        min_signal_rows=int(os.getenv("TRAINING_MIN_SIGNAL_ROWS", "250")),
        min_specialist_feature_rows=int(os.getenv("TRAINING_MIN_SPECIALIST_FEATURE_ROWS", "250")),
        min_fred_series=int(os.getenv("TRAINING_MIN_FRED_SERIES", "50")),
        min_fred_rows=int(os.getenv("TRAINING_MIN_FRED_ROWS", "500000")),
        min_weather_series=int(os.getenv("TRAINING_MIN_WEATHER_SERIES", "4")),
        min_weather_rows=int(os.getenv("TRAINING_MIN_WEATHER_ROWS", "500000")),
        min_alt_rows=int(os.getenv("TRAINING_MIN_ALT_ROWS", "1")),
        max_daily_price_age_days=int(os.getenv("TRAINING_MAX_DAILY_PRICE_AGE_DAYS", "4")),
        max_hourly_price_age_hours=int(os.getenv("TRAINING_MAX_HOURLY_PRICE_AGE_HOURS", "72")),
        max_factor_age_days=int(os.getenv("TRAINING_MAX_FACTOR_AGE_DAYS", "45")),
        max_profarmer_age_days=int(os.getenv("TRAINING_MAX_PROFARMER_AGE_DAYS", "10")),
        # Training labels require forward horizon availability; 180-day targets
        # naturally shift max trade_date far behind "today".
        max_training_trade_date_age_days=int(os.getenv("TRAINING_MAX_TRADE_DATE_AGE_DAYS", "320")),
        max_daily_ohlc_violations=int(os.getenv("TRAINING_MAX_DAILY_OHLC_VIOLATIONS", "0")),
        max_hourly_ohlc_violations=int(os.getenv("TRAINING_MAX_HOURLY_OHLC_VIOLATIONS", "0")),
        min_matrix_feature_keys=int(os.getenv("TRAINING_MIN_MATRIX_FEATURE_KEYS", "20")),
        min_specialist_feature_keys=int(os.getenv("TRAINING_MIN_SPECIALIST_FEATURE_KEYS", "5")),
        min_signal_keys=int(os.getenv("TRAINING_MIN_SIGNAL_KEYS", str(len(SPECIALISTS) * 3))),
        max_specialist_leakage_match_ratio=_parse_float(
            os.getenv("TRAINING_MAX_SPECIALIST_LEAKAGE_MATCH_RATIO"),
            0.98,
        ),
        max_signal_identity_ratio=_parse_float(
            os.getenv("TRAINING_MAX_SIGNAL_IDENTITY_RATIO"),
            0.98,
        ),
        enforce_cloud_local_parity=enforce_parity not in {"0", "false", "no", "off"},
        max_cloud_local_date_lag_days=int(os.getenv("TRAINING_MAX_CLOUD_LOCAL_DATE_LAG_DAYS", "0")),
        max_cloud_local_missing_ratio=_parse_float(
            os.getenv("TRAINING_MAX_CLOUD_LOCAL_MISSING_RATIO"),
            0.0,
        ),
        max_cloud_local_value_mismatch_ratio=_parse_float(
            os.getenv("TRAINING_MAX_CLOUD_LOCAL_VALUE_MISMATCH_RATIO"),
            0.0,
        ),
        cloud_local_value_tolerance=_parse_float(
            os.getenv("TRAINING_CLOUD_LOCAL_VALUE_TOLERANCE"),
            1e-9,
        ),
        single_matrix_training_contract=single_matrix not in {"0", "false", "no", "off"},
        require_options_data=require_options in {"1", "true", "yes", "on"},
        min_options_rows=int(os.getenv("TRAINING_MIN_OPTIONS_ROWS", "1000")),
        max_options_age_days=int(os.getenv("TRAINING_MAX_OPTIONS_AGE_DAYS", "14")),
    )


def _check_symbol_table(
    cur: Any,
    *,
    schema: str,
    table: str,
    ts_column: str,
    required_symbols: tuple[str, ...],
    min_rows: int,
    max_age_hours: int | None,
    max_age_days: int | None,
    now_utc: datetime,
) -> tuple[bool, str]:
    query = sql.SQL(
        "SELECT symbol, COUNT(*)::BIGINT AS row_count, MAX({ts_col}) AS latest_ts "
        "FROM {schema_name}.{table_name} "
        "WHERE symbol = ANY(%s) "
        "GROUP BY symbol"
    ).format(
        ts_col=sql.Identifier(ts_column),
        schema_name=sql.Identifier(schema),
        table_name=sql.Identifier(table),
    )
    cur.execute(query, (list(required_symbols),))
    rows = cur.fetchall()
    by_symbol = {row[0].upper(): {"rows": int(row[1]), "latest": row[2]} for row in rows}
    issues: list[str] = []

    for symbol in required_symbols:
        info = by_symbol.get(symbol)
        if info is None:
            issues.append(f"{symbol}: missing")
            continue
        if info["rows"] < min_rows:
            issues.append(f"{symbol}: rows={info['rows']} (<{min_rows})")
        if max_age_hours is not None:
            age = _age_hours(info["latest"], now_utc)
            if age is None:
                issues.append(f"{symbol}: no latest timestamp")
            elif age > max_age_hours:
                issues.append(f"{symbol}: stale age_hours={age:.1f} (>{max_age_hours})")
        if max_age_days is not None:
            age_days = _age_days(info["latest"], now_utc)
            if age_days is None:
                issues.append(f"{symbol}: no latest timestamp")
            elif age_days > max_age_days:
                issues.append(f"{symbol}: stale age_days={age_days:.1f} (>{max_age_days})")

    if issues:
        return False, f"{schema}.{table} failed -> " + _format_issues(issues)
    return True, f"{schema}.{table} passed for {len(required_symbols)} symbols"


def _check_ohlc_integrity(
    cur: Any,
    *,
    schema: str,
    table: str,
    required_symbols: tuple[str, ...],
    max_violations: int,
) -> tuple[bool, str]:
    query = sql.SQL(
        "SELECT "
        "COUNT(*) FILTER (WHERE high < GREATEST(open, close))::BIGINT AS high_violations, "
        "COUNT(*) FILTER (WHERE low > LEAST(open, close))::BIGINT AS low_violations "
        "FROM {schema_name}.{table_name} "
        "WHERE symbol = ANY(%s)"
    ).format(
        schema_name=sql.Identifier(schema),
        table_name=sql.Identifier(table),
    )
    cur.execute(query, (list(required_symbols),))
    high_violations, low_violations = cur.fetchone()
    high_violations = int(high_violations or 0)
    low_violations = int(low_violations or 0)
    total = high_violations + low_violations

    if total > max_violations:
        return (
            False,
            f"{schema}.{table} ohlc violations={total} (high={high_violations}, low={low_violations}, "
            f"max={max_violations})",
        )
    return True, f"{schema}.{table} ohlc violations={total}"


def _discover_local_symbols(cur: Any, *, contract: TrainingGateContract) -> tuple[tuple[str, ...], str]:
    if contract.required_symbols:
        return contract.required_symbols, f"env override ({len(contract.required_symbols)} symbols)"

    if not _table_exists(cur, schema="raw", table="databento_ohlcv_1h"):
        return (), "raw.databento_ohlcv_1h missing"

    cur.execute(
        """
        SELECT symbol
        FROM raw.databento_ohlcv_1h
        WHERE symbol IS NOT NULL AND trim(symbol) <> ''
        GROUP BY symbol
        ORDER BY symbol
        """
    )
    symbols = tuple(str(row[0]).upper() for row in cur.fetchall())
    return symbols, f"all local raw.databento_ohlcv_1h symbols ({len(symbols)} symbols)"


def _check_symbol_scope(
    symbols: tuple[str, ...],
    *,
    contract: TrainingGateContract,
    detail: str,
) -> tuple[bool, str]:
    if len(symbols) < contract.min_symbol_count:
        return (
            False,
            f"local symbol scope failed -> {detail}; symbols={len(symbols)} (<{contract.min_symbol_count})",
        )
    return True, f"local symbol scope passed -> {detail}"


def _check_source_row_floor(
    cur: Any,
    *,
    schema: str,
    table: str,
    date_column: str,
    min_rows: int,
    max_age_hours: int | None,
    max_age_days: int | None,
    now_utc: datetime,
) -> tuple[bool, str]:
    if not _table_exists(cur, schema=schema, table=table):
        return False, f"{schema}.{table} missing"

    query = sql.SQL(
        "SELECT COUNT(*)::BIGINT AS row_count, MAX({date_col}) AS latest_value "
        "FROM {schema_name}.{table_name}"
    ).format(
        date_col=sql.Identifier(date_column),
        schema_name=sql.Identifier(schema),
        table_name=sql.Identifier(table),
    )
    cur.execute(query)
    row_count, latest_value = cur.fetchone()
    row_count = int(row_count or 0)
    issues: list[str] = []
    details = [f"rows={row_count}"]

    if row_count < min_rows:
        issues.append(f"rows={row_count} (<{min_rows})")

    if max_age_hours is not None:
        age_hours = _age_hours(latest_value, now_utc)
        if age_hours is None:
            issues.append(f"no latest {date_column}")
        elif age_hours > max_age_hours:
            issues.append(f"stale {date_column} age_hours={age_hours:.1f} (>{max_age_hours})")
        else:
            details.append(f"{date_column}_age_hours={age_hours:.1f}")

    if max_age_days is not None:
        age_days = _age_days(latest_value, now_utc)
        if age_days is None:
            issues.append(f"no latest {date_column}")
        elif age_days > max_age_days:
            issues.append(f"stale {date_column} age_days={age_days:.1f} (>{max_age_days})")
        else:
            details.append(f"{date_column}_age_days={age_days:.1f}")

    if issues:
        return False, f"{schema}.{table} failed -> " + _format_issues(issues)
    return True, f"{schema}.{table} " + ", ".join(details)


def _check_table_rows_and_age(
    cur: Any,
    *,
    schema: str,
    table: str,
    date_column: str,
    freshness_column: str | None,
    min_rows: int,
    max_freshness_age_days: int,
    max_value_age_days: int | None,
    now_utc: datetime,
) -> tuple[bool, str]:
    if freshness_column:
        query = sql.SQL(
            "SELECT COUNT(*)::BIGINT AS row_count, "
            "MAX({date_col}) AS latest_value, "
            "MAX({fresh_col}) AS latest_freshness "
            "FROM {schema_name}.{table_name}"
        ).format(
            date_col=sql.Identifier(date_column),
            fresh_col=sql.Identifier(freshness_column),
            schema_name=sql.Identifier(schema),
            table_name=sql.Identifier(table),
        )
    else:
        query = sql.SQL(
            "SELECT COUNT(*)::BIGINT AS row_count, MAX({date_col}) AS latest_value "
            "FROM {schema_name}.{table_name}"
        ).format(
            date_col=sql.Identifier(date_column),
            schema_name=sql.Identifier(schema),
            table_name=sql.Identifier(table),
        )
    cur.execute(query)
    fetched = cur.fetchone()
    row_count = int(fetched[0])
    latest_value = fetched[1]
    latest_freshness = fetched[2] if freshness_column else None

    if row_count < min_rows:
        return False, f"{schema}.{table} rows={row_count} (<{min_rows})"

    detail_parts = [f"rows={row_count}"]
    issues: list[str] = []

    if freshness_column:
        freshness_age_days = _age_days(latest_freshness, now_utc)
        if freshness_age_days is None:
            issues.append(f"no latest {freshness_column}")
        elif freshness_age_days > max_freshness_age_days:
            issues.append(
                f"stale {freshness_column} age_days={freshness_age_days:.1f} "
                f"(>{max_freshness_age_days})"
            )
        else:
            detail_parts.append(f"{freshness_column}_age_days={freshness_age_days:.1f}")
    else:
        age_days = _age_days(latest_value, now_utc)
        if age_days is None:
            issues.append(f"no latest {date_column}")
        elif age_days > max_freshness_age_days:
            issues.append(f"stale {date_column} age_days={age_days:.1f} (>{max_freshness_age_days})")
        else:
            detail_parts.append(f"{date_column}_age_days={age_days:.1f}")

    if max_value_age_days is not None:
        value_age_days = _age_days(latest_value, now_utc)
        if value_age_days is None:
            issues.append(f"no latest {date_column}")
        elif value_age_days > max_value_age_days:
            issues.append(f"stale {date_column} age_days={value_age_days:.1f} (>{max_value_age_days})")
        else:
            detail_parts.append(f"{date_column}_age_days={value_age_days:.1f}")

    if issues:
        return False, f"{schema}.{table} failed -> " + _format_issues(issues)
    return True, f"{schema}.{table} " + ", ".join(detail_parts)


def _check_json_payload_width(
    cur: Any,
    *,
    schema: str,
    table: str,
    payload_column: str,
    min_keys: int,
) -> tuple[bool, str]:
    query = sql.SQL(
        "SELECT COUNT(*)::BIGINT AS row_count, "
        "COUNT(*) FILTER (WHERE {payload_col} IS NULL)::BIGINT AS null_payload_rows, "
        "MIN((SELECT COUNT(*) FROM jsonb_object_keys({payload_col})))::INT AS min_key_count, "
        "MAX((SELECT COUNT(*) FROM jsonb_object_keys({payload_col})))::INT AS max_key_count "
        "FROM {schema_name}.{table_name}"
    ).format(
        payload_col=sql.Identifier(payload_column),
        schema_name=sql.Identifier(schema),
        table_name=sql.Identifier(table),
    )
    cur.execute(query)
    row_count, null_payload_rows, min_key_count, max_key_count = cur.fetchone()
    row_count = int(row_count or 0)
    null_payload_rows = int(null_payload_rows or 0)
    min_key_count = int(min_key_count or 0)
    max_key_count = int(max_key_count or 0)

    if row_count <= 0:
        return False, f"{schema}.{table} has 0 rows"
    if null_payload_rows > 0:
        return False, f"{schema}.{table} has {null_payload_rows} NULL {payload_column} rows"
    if min_key_count < min_keys:
        return (
            False,
            f"{schema}.{table} {payload_column} min_keys={min_key_count} (<{min_keys})",
        )
    return True, f"{schema}.{table} {payload_column} keys min={min_key_count}, max={max_key_count}"


def _check_cloud_matrix_has_no_targets(cur: Any) -> tuple[bool, str]:
    target_keys = ("target_price_30d", "target_price_90d", "target_price_180d")
    checks = " OR ".join([f"feature_snapshot ? '{key}'" for key in target_keys])
    cur.execute(
        "SELECT COUNT(*)::BIGINT AS row_count, "
        f"COUNT(*) FILTER (WHERE {checks})::BIGINT AS target_payload_rows "
        "FROM training.matrix_1d"
    )
    row_count, target_payload_rows = cur.fetchone()
    row_count = int(row_count or 0)
    target_payload_rows = int(target_payload_rows or 0)
    if target_payload_rows > 0:
        return (
            False,
            f"training.matrix_1d feature_snapshot contains target labels in {target_payload_rows}/{row_count} rows",
        )
    return True, "training.matrix_1d feature_snapshot contains no target labels"


def _check_local_matrix_artifact(
    *,
    contract: TrainingGateContract,
    now_utc: datetime,
) -> tuple[bool, str]:
    try:
        matrix = read_parquet(matrix_path())
    except Exception as exc:  # noqa: BLE001
        return False, f"local matrix artifact failed -> {exc}"

    labels = target_columns(matrix.columns)
    expected_labels = ["target_price_30d", "target_price_90d", "target_price_180d"]
    features = feature_columns(matrix.columns)
    issues: list[str] = []
    if len(matrix) < contract.min_matrix_rows:
        issues.append(f"rows={len(matrix)} (<{contract.min_matrix_rows})")
    if labels != expected_labels:
        issues.append(f"target_columns={labels}, expected={expected_labels}")
    if len(features) < contract.min_matrix_feature_keys:
        issues.append(f"feature_columns={len(features)} (<{contract.min_matrix_feature_keys})")
    if labels:
        for label in labels:
            series = pd.to_numeric(matrix[label], errors="coerce")
            null_count = int(series.isna().sum())
            try:
                horizon = int(label.replace("target_price_", "").replace("d", ""))
            except ValueError:
                horizon = 0
            if null_count > horizon:
                issues.append(f"{label} NULL rows={null_count} (>horizon={horizon})")
                continue
            if null_count > 0:
                null_positions = series[series.isna()].index.to_list()
                if null_positions and null_positions != list(
                    range(len(series) - null_count, len(series))
                ):
                    issues.append(f"{label} NULL rows are not trailing-only")
    else:
        issues.append("missing target labels")
    if "trade_date" not in matrix.columns:
        issues.append("missing trade_date")
    else:
        latest = pd.to_datetime(matrix["trade_date"]).max()
        age_days = _age_days(latest.to_pydatetime(), now_utc)
        if age_days is None:
            issues.append("invalid latest trade_date")
        elif age_days > contract.max_training_trade_date_age_days:
            issues.append(
                f"stale trade_date age_days={age_days:.1f} "
                f"(>{contract.max_training_trade_date_age_days})"
            )

    if issues:
        return False, "local matrix artifact failed -> " + "; ".join(issues)
    return (
        True,
        f"local matrix artifact rows={len(matrix)}, features={len(features)}, targets={len(labels)}",
    )


def _check_local_specialist_artifact(
    specialist: str,
    *,
    contract: TrainingGateContract,
) -> tuple[bool, str]:
    try:
        frame = read_parquet(specialist_features_path(specialist))
        assert_no_target_columns(frame, context=f"local specialist {specialist}")
    except Exception as exc:  # noqa: BLE001
        return False, f"local specialist {specialist} failed -> {exc}"

    features = [column for column in frame.columns if column not in {"trade_date", "specialist"}]
    issues: list[str] = []
    if len(frame) < contract.min_specialist_feature_rows:
        issues.append(f"rows={len(frame)} (<{contract.min_specialist_feature_rows})")
    if len(features) < contract.min_specialist_feature_keys:
        issues.append(f"feature_columns={len(features)} (<{contract.min_specialist_feature_keys})")
    if "source_feature_count" in frame.columns and float(frame["source_feature_count"].max()) <= 0:
        issues.append("source_feature_count is 0")

    if issues:
        return False, "local specialist artifact failed -> " + "; ".join(issues)
    return True, f"local specialist artifact {specialist} rows={len(frame)}, features={len(features)}"


def _check_local_signal_artifact(*, contract: TrainingGateContract) -> tuple[bool, str]:
    try:
        signals = read_parquet(signals_path())
        assert_no_target_columns(signals, context="local specialist signals")
    except Exception as exc:  # noqa: BLE001
        return False, f"local specialist signals failed -> {exc}"

    signal_cols = [column for column in signals.columns if column != "trade_date"]
    if len(signals) < contract.min_signal_rows:
        return False, f"local specialist signals rows={len(signals)} (<{contract.min_signal_rows})"
    if len(signal_cols) < contract.min_signal_keys:
        return False, f"local specialist signals columns={len(signal_cols)} (<{contract.min_signal_keys})"
    return True, f"local specialist signals rows={len(signals)}, columns={len(signal_cols)}"


def _check_cloud_local_symbol_parity(
    cur: Any,
    *,
    contract: TrainingGateContract,
) -> tuple[bool, str]:
    try:
        matrix = read_parquet(matrix_path()).copy()
    except Exception as exc:  # noqa: BLE001
        return False, f"cloud/local parity failed -> unable to read local matrix: {exc}"

    if "trade_date" not in matrix.columns:
        return False, "cloud/local parity failed -> local matrix missing trade_date"

    matrix["trade_date"] = pd.to_datetime(matrix["trade_date"], errors="coerce").dt.date
    local_trade_dates = matrix["trade_date"].dropna().tolist()
    if not local_trade_dates:
        return False, "cloud/local parity failed -> local matrix has no valid trade_date values"
    local_trade_date_set = set(local_trade_dates)
    local_min_trade_date = min(local_trade_date_set)
    local_max_trade_date = max(local_trade_date_set)
    issues: list[str] = []
    details: list[str] = []

    for symbol in contract.required_symbols:
        matrix_col = _MATRIX_SYMBOL_COLUMN_MAP.get(symbol)
        if not matrix_col:
            issues.append(f"{symbol}: no matrix column mapping")
            continue
        if matrix_col not in matrix.columns:
            issues.append(f"{symbol}: local matrix missing column {matrix_col}")
            continue

        local = matrix[["trade_date", matrix_col]].rename(columns={matrix_col: "close"})
        local["close"] = pd.to_numeric(local["close"], errors="coerce")
        local = local.dropna(subset=["trade_date", "close"]).sort_values("trade_date")
        if local.empty:
            issues.append(f"{symbol}: local matrix has 0 non-null rows in {matrix_col}")
            continue

        cur.execute(
            "SELECT bucket_ts::date AS trade_date, close::numeric AS close "
            "FROM mkt.price_1d WHERE symbol = %s ORDER BY bucket_ts::date",
            (symbol,),
        )
        rows = cur.fetchall()
        if not rows:
            issues.append(f"{symbol}: cloud mkt.price_1d has 0 rows")
            continue

        cloud = pd.DataFrame(rows, columns=["trade_date", "close"])
        cloud["trade_date"] = pd.to_datetime(cloud["trade_date"], errors="coerce").dt.date
        cloud["close"] = pd.to_numeric(cloud["close"], errors="coerce")
        cloud = cloud.dropna(subset=["trade_date", "close"]).sort_values("trade_date")
        if cloud.empty:
            issues.append(f"{symbol}: cloud mkt.price_1d has 0 usable close rows")
            continue
        cloud = cloud[
            (cloud["trade_date"] >= local_min_trade_date)
            & (cloud["trade_date"] <= local_max_trade_date)
            & (cloud["trade_date"].isin(local_trade_date_set))
        ]
        if cloud.empty:
            issues.append(f"{symbol}: cloud has 0 rows on local training trade-date calendar")
            continue

        merged = cloud.merge(
            local,
            on="trade_date",
            how="outer",
            suffixes=("_cloud", "_local"),
            indicator=True,
        )
        cloud_only = int((merged["_merge"] == "left_only").sum())
        local_only = int((merged["_merge"] == "right_only").sum())
        missing_ratio = _ratio(cloud_only + local_only, len(merged))
        if missing_ratio > contract.max_cloud_local_missing_ratio:
            issues.append(
                f"{symbol}: missing_ratio={missing_ratio:.4f} "
                f"(cloud_only={cloud_only}, local_only={local_only}, "
                f"max={contract.max_cloud_local_missing_ratio:.4f})"
            )

        both = merged[merged["_merge"] == "both"].copy()
        if both.empty:
            issues.append(f"{symbol}: no overlapping cloud/local dates")
            continue

        value_delta = (both["close_cloud"] - both["close_local"]).abs()
        mismatch_count = int((value_delta > contract.cloud_local_value_tolerance).sum())
        mismatch_ratio = _ratio(mismatch_count, len(both))
        if mismatch_ratio > contract.max_cloud_local_value_mismatch_ratio:
            issues.append(
                f"{symbol}: value_mismatch_ratio={mismatch_ratio:.4f} "
                f"(mismatches={mismatch_count}, overlap={len(both)}, "
                f"tol={contract.cloud_local_value_tolerance:g}, "
                f"max={contract.max_cloud_local_value_mismatch_ratio:.4f})"
            )

        cloud_latest = max(cloud["trade_date"])
        local_latest = max(local["trade_date"])
        lag_days = int((cloud_latest - local_latest).days)
        if lag_days > contract.max_cloud_local_date_lag_days:
            issues.append(
                f"{symbol}: local lags cloud by {lag_days}d "
                f"(max={contract.max_cloud_local_date_lag_days}d)"
            )

        details.append(
            f"{symbol}[cloud_rows={len(cloud)},local_rows={len(local)},overlap={len(both)},lag_days={lag_days}]"
        )

    if issues:
        return False, "cloud/local symbol parity failed -> " + "; ".join(issues)
    return True, "cloud/local symbol parity passed -> " + ", ".join(details)


def _check_fred_series(
    cur: Any,
    *,
    required_series: tuple[str, ...],
    min_series: int,
    min_rows: int,
    max_age_days: int,
    now_utc: datetime,
) -> tuple[bool, str]:
    union_parts: list[str] = []
    for schema_name, table_name, series_column, date_column in _FRED_RAW_TABLES:
        if not _table_exists(cur, schema=schema_name, table=table_name):
            continue
        if not _column_exists(cur, schema=schema_name, table=table_name, column=series_column):
            continue
        if not _column_exists(cur, schema=schema_name, table=table_name, column=date_column):
            continue
        union_parts.append(
            f"SELECT {series_column}::text AS series_id, {date_column}::timestamp AS observation_date "
            f"FROM {schema_name}.{table_name} "
            f"WHERE {series_column} IS NOT NULL AND {date_column} IS NOT NULL"
        )

    if not union_parts:
        return False, "fred local universe failed -> no supported raw FRED long tables found"

    union = " UNION ALL ".join(union_parts)
    scope = "env override" if required_series else "all local raw FRED series"
    where_clause = "WHERE series_id = ANY(%s)" if required_series else ""
    query = (
        "WITH fred_union AS ("
        + union
        + ") "
        + "SELECT series_id, COUNT(*)::BIGINT AS row_count, MAX(observation_date) AS latest "
        + f"FROM fred_union {where_clause} GROUP BY series_id"
    )
    cur.execute(query, (list(required_series),) if required_series else None)
    rows = cur.fetchall()
    by_series = {row[0].upper(): {"rows": int(row[1]), "latest": row[2]} for row in rows}
    issues: list[str] = []
    row_total = sum(info["rows"] for info in by_series.values())
    latest_values = [info["latest"] for info in by_series.values() if info["latest"] is not None]

    if len(by_series) < min_series:
        issues.append(f"series={len(by_series)} (<{min_series})")
    if row_total < min_rows:
        issues.append(f"rows={row_total} (<{min_rows})")
    latest = max(latest_values) if latest_values else None
    latest_age_days = _age_days(latest, now_utc)
    if latest_age_days is None:
        issues.append("no latest FRED observation")
    elif latest_age_days > max_age_days:
        issues.append(f"stale FRED universe latest age_days={latest_age_days:.1f} (>{max_age_days})")

    series_to_check = required_series if required_series else tuple(sorted(by_series))
    if required_series:
        for series_id in series_to_check:
            info = by_series.get(series_id)
            if info is None:
                issues.append(f"{series_id}: missing")
                continue
            if info["rows"] < 1:
                issues.append(f"{series_id}: rows=0")
                continue
            age_days = _age_days(info["latest"], now_utc)
            if age_days is None:
                issues.append(f"{series_id}: no latest observation")
            elif age_days > max_age_days:
                issues.append(f"{series_id}: stale age_days={age_days:.1f} (>{max_age_days})")

    if issues:
        return False, f"fred local universe failed ({scope}) -> " + _format_issues(issues)
    return (
        True,
        f"fred local universe passed ({scope}) -> rows={row_total}, series={len(by_series)}, latest={latest}, latest_age_days={latest_age_days:.1f}",
    )


def _check_weather_series(
    cur: Any,
    *,
    min_weather_series: int,
    min_weather_rows: int,
    max_age_days: int,
    now_utc: datetime,
) -> tuple[bool, str]:
    union_parts: list[str] = []
    for schema_name, table_name, series_expr, date_column in _WEATHER_SOURCE_TABLES:
        if not _table_exists(cur, schema=schema_name, table=table_name):
            continue
        if not _column_exists(cur, schema=schema_name, table=table_name, column=date_column):
            continue
        union_parts.append(
            f"SELECT ({series_expr})::text AS series_id, {date_column}::timestamp AS observation_date "
            f"FROM {schema_name}.{table_name} "
            f"WHERE {date_column} IS NOT NULL"
        )

    if not union_parts:
        return False, "weather local universe failed -> no supported local weather source tables found"

    union = " UNION ALL ".join(union_parts)
    cur.execute(
        "WITH weather_union AS ("
        + union
        + ") "
        + "SELECT COUNT(*)::BIGINT AS row_count, "
        + "COUNT(DISTINCT series_id)::BIGINT AS series_count, "
        + "MAX(observation_date) AS latest "
        + "FROM weather_union"
    )
    row_count, series_count, latest = cur.fetchone()
    row_count = int(row_count or 0)
    series_count = int(series_count or 0)
    issues: list[str] = []

    if series_count < min_weather_series:
        issues.append(f"series={series_count} (<{min_weather_series})")
    if row_count < min_weather_rows:
        issues.append(f"rows={row_count} (<{min_weather_rows})")

    age_days = _age_days(latest, now_utc)
    if age_days is None:
        issues.append("no latest observation_date")
    elif age_days > max_age_days:
        issues.append(f"stale observation_date age_days={age_days:.1f} (>{max_age_days})")

    if issues:
        return False, "weather local universe failed -> " + _format_issues(issues)
    return True, f"weather local universe rows={row_count}, series={series_count}, age_days={age_days:.1f}"


def _check_alt_source_tables(
    cur: Any,
    *,
    min_rows: int,
    max_age_days: int,
    now_utc: datetime,
) -> tuple[bool, str]:
    issues: list[str] = []
    details: list[str] = []
    stale_details: list[str] = []
    total_rows = 0
    latest_values: list[Any] = []

    for schema_name, table_name, date_column in _ALT_SOURCE_TABLES:
        if not _table_exists(cur, schema=schema_name, table=table_name):
            continue
        if not _column_exists(cur, schema=schema_name, table=table_name, column=date_column):
            continue

        query = sql.SQL(
            "SELECT COUNT(*)::BIGINT AS row_count, MAX({date_col}) AS latest_value "
            "FROM {schema_name}.{table_name}"
        ).format(
            date_col=sql.Identifier(date_column),
            schema_name=sql.Identifier(schema_name),
            table_name=sql.Identifier(table_name),
        )
        cur.execute(query)
        row_count, latest_value = cur.fetchone()
        row_count = int(row_count or 0)
        total_rows += row_count
        if row_count <= 0:
            continue
        latest_values.append(latest_value)
        details.append(f"{schema_name}.{table_name}[rows={row_count}]")

        age_days = _age_days(latest_value, now_utc)
        if age_days is None:
            stale_details.append(f"{schema_name}.{table_name}: no latest {date_column}")
        elif age_days > max_age_days:
            stale_details.append(
                f"{schema_name}.{table_name}: stale {date_column} age_days={age_days:.1f} (>{max_age_days})"
            )

    if total_rows < min_rows:
        issues.append(f"rows={total_rows} (<{min_rows})")
    latest = max((_as_utc_datetime(value) for value in latest_values), default=None)
    age_days = _age_days(latest, now_utc)
    if age_days is None:
        issues.append("no latest populated alt/econ source timestamp")
    elif age_days > max_age_days:
        issues.append(f"latest populated source stale age_days={age_days:.1f} (>{max_age_days})")
    if issues:
        return False, "alt/econ source tables failed -> " + _format_issues(issues)

    detail = f"alt/econ source tables passed -> total_rows={total_rows}, latest_age_days={age_days:.1f}"
    if details:
        detail += ", populated=" + ", ".join(details)
    if stale_details:
        detail += ", stale_supporting_sources=" + _format_issues(stale_details)
    return True, detail


def _check_profarmer(
    cur: Any,
    *,
    max_age_days: int,
    now_utc: datetime,
) -> tuple[bool, str]:
    cur.execute(
        """
        SELECT
          COUNT(*)::BIGINT AS row_count,
          MAX(published_at) AS latest,
          COUNT(*) FILTER (
            WHERE published_at < '2010-01-01'::timestamptz
          )::BIGINT AS pre2010_rows,
          COUNT(*) FILTER (
            WHERE ((payload->>'url') IS NULL OR payload->>'url' = '')
              AND (
                lower(coalesce(title, '')) IN ('profarmer', 'n')
                OR char_length(trim(coalesce(title, ''))) <= 1
              )
          )::BIGINT AS likely_fake_rows
        FROM alt.profarmer_news
        """
    )
    row_count, latest, pre2010_rows, likely_fake_rows = cur.fetchone()
    row_count = int(row_count)
    pre2010_rows = int(pre2010_rows or 0)
    likely_fake_rows = int(likely_fake_rows or 0)

    if row_count < 1:
        return False, "alt.profarmer_news rows=0"
    if pre2010_rows > 0:
        return False, f"alt.profarmer_news has {pre2010_rows} rows with published_at before 2010-01-01"
    if likely_fake_rows > 0:
        return False, f"alt.profarmer_news has {likely_fake_rows} likely fake rows (empty URL + junk title)"

    age_days = _age_days(latest, now_utc)
    if age_days is None:
        return False, "alt.profarmer_news has no latest published_at"
    if age_days > max_age_days:
        return False, f"alt.profarmer_news stale age_days={age_days:.1f} (>{max_age_days})"

    return (
        True,
        f"alt.profarmer_news rows={row_count}, age_days={age_days:.1f}, pre2010_rows={pre2010_rows}, likely_fake_rows={likely_fake_rows}",
    )


def _check_specialist_target_leakage(
    *,
    max_match_ratio: float,
) -> tuple[bool, str]:
    try:
        matrix = read_parquet(matrix_path()).copy()
    except Exception as exc:  # noqa: BLE001
        return False, f"specialist target leakage failed -> unable to read local matrix: {exc}"

    required = {"trade_date", "close", "target_price_30d", "target_price_90d", "target_price_180d"}
    missing_required = sorted(required - set(matrix.columns))
    if missing_required:
        return False, f"specialist target leakage failed -> local matrix missing columns: {missing_required}"

    matrix["trade_date"] = pd.to_datetime(matrix["trade_date"], errors="coerce").dt.date
    matrix = matrix.dropna(subset=["trade_date"])
    matrix["delta_30"] = pd.to_numeric(matrix["target_price_30d"], errors="coerce") - pd.to_numeric(
        matrix["close"], errors="coerce"
    )
    matrix["delta_90"] = pd.to_numeric(matrix["target_price_90d"], errors="coerce") - pd.to_numeric(
        matrix["close"], errors="coerce"
    )
    matrix["delta_180"] = pd.to_numeric(matrix["target_price_180d"], errors="coerce") - pd.to_numeric(
        matrix["close"], errors="coerce"
    )
    base = matrix[["trade_date", "delta_30", "delta_90", "delta_180"]].copy()

    offenders: list[str] = []
    checked: list[str] = []
    skipped: list[str] = []
    tol = 1e-12

    for specialist in SPECIALISTS:
        try:
            frame = read_parquet(specialist_features_path(specialist)).copy()
        except Exception as exc:  # noqa: BLE001
            skipped.append(f"{specialist}: unreadable ({exc})")
            continue

        needed = {"trade_date", "mom_30", "mom_90", "mom_180"}
        if not needed.issubset(set(frame.columns)):
            missing = sorted(needed - set(frame.columns))
            skipped.append(f"{specialist}: missing {missing}")
            continue

        frame["trade_date"] = pd.to_datetime(frame["trade_date"], errors="coerce").dt.date
        merged = base.merge(frame[["trade_date", "mom_30", "mom_90", "mom_180"]], on="trade_date", how="inner")
        merged = merged.dropna(subset=["delta_30", "delta_90", "delta_180", "mom_30", "mom_90", "mom_180"])
        if merged.empty:
            skipped.append(f"{specialist}: 0 overlap")
            continue

        r30 = float((pd.to_numeric(merged["mom_30"], errors="coerce") - merged["delta_30"]).abs().le(tol).mean())
        r90 = float((pd.to_numeric(merged["mom_90"], errors="coerce") - merged["delta_90"]).abs().le(tol).mean())
        r180 = float((pd.to_numeric(merged["mom_180"], errors="coerce") - merged["delta_180"]).abs().le(tol).mean())
        checked.append(f"{specialist}[rows={len(merged)},r30={r30:.3f},r90={r90:.3f},r180={r180:.3f}]")
        if r30 >= max_match_ratio or r90 >= max_match_ratio or r180 >= max_match_ratio:
            offenders.append(
                f"{specialist}: r30={r30:.3f}, r90={r90:.3f}, r180={r180:.3f}, max={max_match_ratio:.3f}"
            )

    if offenders:
        return False, "specialist target leakage failed -> " + "; ".join(offenders)
    if checked:
        if skipped:
            return True, "specialist target leakage passed -> " + "; ".join(checked) + "; skipped: " + "; ".join(skipped)
        return True, "specialist target leakage passed -> " + "; ".join(checked)
    return True, "specialist target leakage skipped -> no specialist mom_* columns available"


def _check_signal_identity(
    cur: Any,
    *,
    max_identity_ratio: float,
) -> tuple[bool, str]:
    families = ("1", "2", "conf")
    checks: dict[str, tuple[int, int]] = {}

    for family in families:
        base = f"sig_{SPECIALISTS[0]}_{family}"
        comparisons = " AND ".join(
            [f"(signal_payload->>'sig_{specialist}_{family}') = (signal_payload->>'{base}')" for specialist in SPECIALISTS[1:]]
        )
        query = (
            "SELECT COUNT(*)::BIGINT AS row_count, "
            f"COUNT(*) FILTER (WHERE {comparisons})::BIGINT AS same_count "
            "FROM training.specialist_signals_1d"
        )
        cur.execute(query)
        row_count, same_count = cur.fetchone()
        checks[family] = (int(row_count or 0), int(same_count or 0))

    offenders: list[str] = []
    details: list[str] = []
    for family, (row_count, same_count) in checks.items():
        identity_ratio = _ratio(same_count, row_count)
        details.append(f"{family}={identity_ratio:.3f}")
        if identity_ratio >= max_identity_ratio:
            offenders.append(f"{family}={identity_ratio:.3f}")

    if offenders:
        return (
            False,
            "specialist signal identity failed -> "
            + ", ".join(offenders)
            + f" (max={max_identity_ratio:.3f})",
        )
    return True, "specialist signal identity passed -> " + ", ".join(details)


def _check_price_ingest_jobs(cur: Any, *, max_age_hours: int, now_utc: datetime) -> tuple[bool, str]:
    required_jobs = ("ingest_zl_intraday", "rollup_zl_daily")
    cur.execute(
        "SELECT job_name, MAX(finished_at) AS latest_ok "
        "FROM ops.ingest_run "
        "WHERE status = 'ok' AND job_name = ANY(%s) "
        "GROUP BY job_name",
        (list(required_jobs),),
    )
    rows = cur.fetchall()
    by_job = {row[0]: row[1] for row in rows}
    issues: list[str] = []

    for job_name in required_jobs:
        latest = by_job.get(job_name)
        if latest is None:
            issues.append(f"{job_name}: no successful run")
            continue
        age = _age_hours(latest, now_utc)
        if age is None:
            issues.append(f"{job_name}: invalid latest timestamp")
        elif age > max_age_hours:
            issues.append(f"{job_name}: stale age_hours={age:.1f} (>{max_age_hours})")

    if issues:
        return False, "price ingest jobs failed -> " + "; ".join(issues)
    return True, "price ingest jobs passed"


def _check_options_data(
    cur: Any,
    *,
    min_rows: int,
    max_age_days: int,
    now_utc: datetime,
) -> tuple[bool, str]:
    candidates = (
        ("raw", "databento_options_1d"),
        ("mkt", "options_1d"),
        ("raw", "options_1d"),
    )
    preferred_date_columns = (
        "as_of_date",
        "trade_date",
        "observation_date",
        "bucket_ts",
        "ts_event",
    )

    for schema_name, table_name in candidates:
        cur.execute(
            "SELECT column_name "
            "FROM information_schema.columns "
            "WHERE table_schema = %s AND table_name = %s",
            (schema_name, table_name),
        )
        columns = {row[0] for row in cur.fetchall()}
        if not columns:
            continue

        date_column = next((column for column in preferred_date_columns if column in columns), None)
        if date_column is None:
            return (
                False,
                f"{schema_name}.{table_name} exists but has no supported date column "
                f"{preferred_date_columns}",
            )

        query = sql.SQL(
            "SELECT COUNT(*)::BIGINT AS row_count, MAX({date_col}) AS latest_value "
            "FROM {schema_name}.{table_name}"
        ).format(
            date_col=sql.Identifier(date_column),
            schema_name=sql.Identifier(schema_name),
            table_name=sql.Identifier(table_name),
        )
        cur.execute(query)
        row_count, latest_value = cur.fetchone()
        row_count = int(row_count or 0)

        if row_count < min_rows:
            return False, f"{schema_name}.{table_name} rows={row_count} (<{min_rows})"

        age_days = _age_days(latest_value, now_utc)
        if age_days is None:
            return False, f"{schema_name}.{table_name} has no latest {date_column}"
        if age_days > max_age_days:
            return (
                False,
                f"{schema_name}.{table_name} stale {date_column} age_days={age_days:.1f} "
                f"(>{max_age_days})",
            )

        return (
            True,
            f"{schema_name}.{table_name} rows={row_count}, {date_column}_age_days={age_days:.1f}",
        )

    return False, "options data table missing (checked raw.databento_options_1d, mkt.options_1d, raw.options_1d)"


def run(*, dry_run: bool = False) -> dict[str, object]:
    contract = _load_contract()
    result: dict[str, object] = {
        "phase": "train-readiness",
        "dry_run": dry_run,
        "status": "ok",
        "ready": True,
        "contract": asdict(contract),
        "checks": [],
        "blockers": [],
    }

    db_url = resolve_local_training_db_url()
    if not db_url:
        result["status"] = "blocked"
        result["ready"] = False
        result["blockers"] = [
            "Local AG DB URL is not configured. Configure FUSION_LOCAL_TRAINING_DB_URL or LOCAL_TRAINING_DB_URL."
        ]
        return result

    checks: list[dict[str, object]] = []
    blockers: list[str] = []
    now_utc = datetime.now(timezone.utc)

    pass_flag, detail = _check_local_matrix_artifact(contract=contract, now_utc=now_utc)
    checks.append({"check": "local_matrix_artifact", "passed": pass_flag, "detail": detail})
    if not pass_flag:
        blockers.append(detail)

    if contract.single_matrix_training_contract:
        checks.append(
            {
                "check": "local_specialist_artifacts",
                "passed": True,
                "detail": "skipped (TRAINING_SINGLE_MATRIX_CONTRACT=1)",
            }
        )
    else:
        for specialist in SPECIALISTS:
            pass_flag, detail = _check_local_specialist_artifact(specialist, contract=contract)
            checks.append(
                {
                    "check": f"local_specialist_artifact_{specialist}",
                    "passed": pass_flag,
                    "detail": detail,
                }
            )
            if not pass_flag:
                blockers.append(detail)

        pass_flag, detail = _check_local_signal_artifact(contract=contract)
        checks.append({"check": "local_specialist_signals", "passed": pass_flag, "detail": detail})
        if not pass_flag:
            blockers.append(detail)

    try:
        conn = psycopg2.connect(
            db_url,
            connect_timeout=10,
            application_name="fusion_train_readiness_gate",
        )
        conn.autocommit = True
        cur = conn.cursor()

        required_symbols, symbol_scope_detail = _discover_local_symbols(cur, contract=contract)
        pass_flag, detail = _check_symbol_scope(
            required_symbols,
            contract=contract,
            detail=symbol_scope_detail,
        )
        checks.append({"check": "local_symbol_scope", "passed": pass_flag, "detail": detail})
        if not pass_flag:
            blockers.append(detail)

        pass_flag, detail = _check_source_row_floor(
            cur,
            schema="raw",
            table="databento_ohlcv_1h",
            date_column="ts_event",
            min_rows=contract.min_hourly_source_rows,
            max_age_hours=contract.max_hourly_price_age_hours,
            max_age_days=None,
            now_utc=now_utc,
        )
        checks.append({"check": "local_hourly_source_rows", "passed": pass_flag, "detail": detail})
        if not pass_flag:
            blockers.append(detail)

        pass_flag, detail = _check_symbol_table(
            cur,
            schema="raw",
            table="databento_ohlcv_1d",
            ts_column="trade_date",
            required_symbols=required_symbols,
            min_rows=contract.min_daily_rows_per_symbol,
            max_age_hours=None,
            max_age_days=contract.max_daily_price_age_days,
            now_utc=now_utc,
        )
        checks.append({"check": "local_price_1d_symbols", "passed": pass_flag, "detail": detail})
        if not pass_flag:
            blockers.append(detail)

        if contract.enforce_cloud_local_parity:
            pass_flag, detail = _check_cloud_local_symbol_parity(cur, contract=contract)
            checks.append({"check": "cloud_local_symbol_parity", "passed": pass_flag, "detail": detail})
            if not pass_flag:
                blockers.append(detail)
        else:
            checks.append(
                {
                    "check": "cloud_local_symbol_parity",
                    "passed": True,
                    "detail": "skipped (TRAINING_ENFORCE_CLOUD_LOCAL_PARITY=0)",
                }
            )

        pass_flag, detail = _check_symbol_table(
            cur,
            schema="raw",
            table="databento_ohlcv_1h",
            ts_column="ts_event",
            required_symbols=required_symbols,
            min_rows=contract.min_hourly_rows_per_symbol,
            max_age_hours=contract.max_hourly_price_age_hours,
            max_age_days=None,
            now_utc=now_utc,
        )
        checks.append({"check": "local_price_1h_symbols", "passed": pass_flag, "detail": detail})
        if not pass_flag:
            blockers.append(detail)

        pass_flag, detail = _check_ohlc_integrity(
            cur,
            schema="raw",
            table="databento_ohlcv_1d",
            required_symbols=required_symbols,
            max_violations=contract.max_daily_ohlc_violations,
        )
        checks.append({"check": "local_price_1d_ohlc", "passed": pass_flag, "detail": detail})
        if not pass_flag:
            blockers.append(detail)

        pass_flag, detail = _check_ohlc_integrity(
            cur,
            schema="raw",
            table="databento_ohlcv_1h",
            required_symbols=required_symbols,
            max_violations=contract.max_hourly_ohlc_violations,
        )
        checks.append({"check": "local_price_1h_ohlc", "passed": pass_flag, "detail": detail})
        if not pass_flag:
            blockers.append(detail)

        pass_flag, detail = _check_fred_series(
            cur,
            required_series=contract.required_fred_series,
            min_series=contract.min_fred_series,
            min_rows=contract.min_fred_rows,
            max_age_days=contract.max_factor_age_days,
            now_utc=now_utc,
        )
        checks.append({"check": "fred_local_universe", "passed": pass_flag, "detail": detail})
        if not pass_flag:
            blockers.append(detail)

        pass_flag, detail = _check_weather_series(
            cur,
            min_weather_series=contract.min_weather_series,
            min_weather_rows=contract.min_weather_rows,
            max_age_days=contract.max_factor_age_days,
            now_utc=now_utc,
        )
        checks.append({"check": "weather_local_universe", "passed": pass_flag, "detail": detail})
        if not pass_flag:
            blockers.append(detail)

        pass_flag, detail = _check_alt_source_tables(
            cur,
            min_rows=contract.min_alt_rows,
            max_age_days=contract.max_factor_age_days,
            now_utc=now_utc,
        )
        checks.append({"check": "alt_local_sources", "passed": pass_flag, "detail": detail})
        if not pass_flag:
            blockers.append(detail)

        if _table_exists(cur, schema="alt", table="profarmer_news"):
            pass_flag, detail = _check_profarmer(
                cur,
                max_age_days=contract.max_profarmer_age_days,
                now_utc=now_utc,
            )
        else:
            pass_flag, detail = (
                False,
                "alt.profarmer_news missing from local AG DB; cloud-only ProFarmer is not an AG-ready local source",
            )
        checks.append({"check": "profarmer_news", "passed": pass_flag, "detail": detail})
        if not pass_flag:
            blockers.append(detail)

        pass_flag, detail = _check_table_rows_and_age(
            cur,
            schema="training",
            table="matrix_1d",
            date_column="trade_date",
            freshness_column="ingested_at",
            min_rows=contract.min_matrix_rows,
            max_freshness_age_days=contract.max_factor_age_days,
            max_value_age_days=contract.max_training_trade_date_age_days,
            now_utc=now_utc,
        )
        checks.append({"check": "training_matrix", "passed": pass_flag, "detail": detail})
        if not pass_flag:
            blockers.append(detail)

        pass_flag, detail = _check_table_rows_and_age(
            cur,
            schema="training",
            table="matrix_targets_1d",
            date_column="trade_date",
            freshness_column="ingested_at",
            min_rows=contract.min_matrix_rows,
            max_freshness_age_days=contract.max_factor_age_days,
            max_value_age_days=contract.max_training_trade_date_age_days,
            now_utc=now_utc,
        )
        checks.append({"check": "training_matrix_targets", "passed": pass_flag, "detail": detail})
        if not pass_flag:
            blockers.append(detail)

        pass_flag, detail = _check_json_payload_width(
            cur,
            schema="training",
            table="matrix_1d",
            payload_column="feature_snapshot",
            min_keys=contract.min_matrix_feature_keys,
        )
        checks.append({"check": "training_matrix_payload", "passed": pass_flag, "detail": detail})
        if not pass_flag:
            blockers.append(detail)

        pass_flag, detail = _check_cloud_matrix_has_no_targets(cur)
        checks.append({"check": "training_matrix_target_payload", "passed": pass_flag, "detail": detail})
        if not pass_flag:
            blockers.append(detail)

        if contract.single_matrix_training_contract:
            checks.append(
                {
                    "check": "local_specialist_contract",
                    "passed": True,
                    "detail": "skipped specialist_signals/specialist_features checks (TRAINING_SINGLE_MATRIX_CONTRACT=1)",
                }
            )
        else:
            pass_flag, detail = _check_table_rows_and_age(
                cur,
                schema="training",
                table="specialist_signals_1d",
                date_column="trade_date",
                freshness_column="ingested_at",
                min_rows=contract.min_signal_rows,
                max_freshness_age_days=contract.max_factor_age_days,
                max_value_age_days=contract.max_training_trade_date_age_days,
                now_utc=now_utc,
            )
            checks.append({"check": "specialist_signals", "passed": pass_flag, "detail": detail})
            if not pass_flag:
                blockers.append(detail)

            pass_flag, detail = _check_json_payload_width(
                cur,
                schema="training",
                table="specialist_signals_1d",
                payload_column="signal_payload",
                min_keys=contract.min_signal_keys,
            )
            checks.append({"check": "specialist_signals_payload", "passed": pass_flag, "detail": detail})
            if not pass_flag:
                blockers.append(detail)

            for specialist in SPECIALISTS:
                table_name = f"specialist_features_{specialist}"
                pass_flag, detail = _check_table_rows_and_age(
                    cur,
                    schema="training",
                    table=table_name,
                    date_column="trade_date",
                    freshness_column="ingested_at",
                    min_rows=contract.min_specialist_feature_rows,
                    max_freshness_age_days=contract.max_factor_age_days,
                    max_value_age_days=contract.max_training_trade_date_age_days,
                    now_utc=now_utc,
                )
                checks.append({"check": table_name, "passed": pass_flag, "detail": detail})
                if not pass_flag:
                    blockers.append(detail)

                pass_flag, detail = _check_json_payload_width(
                    cur,
                    schema="training",
                    table=table_name,
                    payload_column="feature_payload",
                    min_keys=contract.min_specialist_feature_keys,
                )
                checks.append(
                    {
                        "check": f"{table_name}_payload",
                        "passed": pass_flag,
                        "detail": detail,
                    }
                )
                if not pass_flag:
                    blockers.append(detail)

            pass_flag, detail = _check_specialist_target_leakage(
                max_match_ratio=contract.max_specialist_leakage_match_ratio,
            )
            checks.append({"check": "specialist_target_leakage", "passed": pass_flag, "detail": detail})
            if not pass_flag:
                blockers.append(detail)

            pass_flag, detail = _check_signal_identity(
                cur,
                max_identity_ratio=contract.max_signal_identity_ratio,
            )
            checks.append({"check": "specialist_signal_identity", "passed": pass_flag, "detail": detail})
            if not pass_flag:
                blockers.append(detail)

        checks.append(
            {
                "check": "price_ingest_runs",
                "passed": True,
                "detail": "skipped for local AG readiness; local raw tables and training matrix freshness are authoritative",
            }
        )

        if contract.require_options_data:
            pass_flag, detail = _check_options_data(
                cur,
                min_rows=contract.min_options_rows,
                max_age_days=contract.max_options_age_days,
                now_utc=now_utc,
            )
            checks.append({"check": "options_data", "passed": pass_flag, "detail": detail})
            if not pass_flag:
                blockers.append(detail)
        else:
            checks.append(
                {
                    "check": "options_data",
                    "passed": True,
                    "detail": "excluded from AG readiness by policy (TRAINING_REQUIRE_OPTIONS=0)",
                }
            )

        cur.close()
        conn.close()
    except Exception as exc:  # noqa: BLE001
        result["status"] = "blocked"
        result["ready"] = False
        result["checks"] = checks
        blockers.append(f"readiness query failure: {exc}")
        result["blockers"] = blockers
        return result

    ready = not blockers
    result["status"] = "ready" if ready else "blocked"
    result["ready"] = ready
    result["checks"] = checks
    result["blockers"] = blockers
    return result


def assert_ready() -> dict[str, object]:
    gate = run(dry_run=False)
    if not gate.get("ready", False):
        blockers = gate.get("blockers", [])
        lines = "\n".join(f"- {item}" for item in blockers)
        raise TrainingReadinessError(f"Training readiness gate failed:\n{lines}")
    return gate
