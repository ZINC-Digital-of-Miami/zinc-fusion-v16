from __future__ import annotations

import re
from datetime import date
from typing import Any

import pandas as pd
import psycopg2

from .artifacts import (
    assert_no_target_columns,
    feature_columns,
    matrix_path,
    read_parquet,
    specialist_features_path,
    write_parquet,
)
from .config import SPECIALISTS, resolve_cloud_db_url

_COMMON_MARKET_COLUMNS = [
    "close",
    "volume",
    "ret_20d",
    "ret_60d",
    "ret_180d",
    "std_20",
    "std_60",
]

_SPECIALIST_MARKET_COLUMNS: dict[str, list[str]] = {
    "crush": ["zs_close", "zm_close", "crush_margin_board", "crush_margin_chg_20d", "crush_oil_share_pct"],
    "china": ["ret_90d", "ret_180d"],
    "fx": ["ret_30d", "ret_90d"],
    "fed": ["ret_30d", "ret_90d", "std_60"],
    "tariff": ["ret_20d", "ret_60d"],
    "energy": ["cl_close", "spread_zl_cl", "ratio_zl_cl", "ret_30d"],
    "biofuel": ["ret_60d", "ret_180d"],
    "palm": ["ret_60d", "ret_180d"],
    "volatility": ["std_20", "std_60", "mean_revert_20", "mean_revert_50"],
    "substitutes": ["ret_20d", "ret_60d", "ret_180d", "std_60"],
    "trump_effect": ["ret_20d", "ret_90d", "std_60"],
}

_SPECIALIST_SYMBOL_OWNERSHIP: dict[str, str] = {
    "ZS": "crush",
    "ZM": "crush",
    "CL": "energy",
}

_SYMBOL_MARKET_COLUMNS: dict[str, set[str]] = {
    "ZS": {"zs_close", "spread_zl_zs", "ratio_zl_zs"},
    "ZM": {"zm_close", "spread_zl_zm", "ratio_zl_zm"},
    "CL": {"cl_close", "spread_zl_cl", "ratio_zl_cl"},
}

_SPECIALIST_SOURCE_PATTERNS: dict[str, tuple[str, ...]] = {
    "crush": (
        "activity_",
        "weather_",
        "profarmer_",
        "news_crush_",
        "commodities_psoy",
        "commodities_psoil",
        "commodities_pmaiz",
    ),
    "china": (
        "activity_",
        "weather_",
        "profarmer_",
        "news_china_",
        "commodities_psoy",
        "commodities_psoil",
        "commodities_pmaiz",
    ),
    "fx": ("activity_", "rates_", "vol_", "news_fx_"),
    "fed": ("activity_", "rates_", "vol_", "fed_speech_", "legislation_fed_", "news_fed_"),
    "tariff": ("rates_", "legislation_tariff_", "news_tariff_", "profarmer_"),
    "energy": ("commodities_dcoil", "commodities_dhhngsp", "commodities_gas", "vol_", "activity_", "news_energy_"),
    "biofuel": (
        "commodities_gas",
        "commodities_psoil",
        "commodities_ppoil",
        "commodities_wpu",
        "commodities_pcu",
        "legislation_biofuel_",
        "news_biofuel_",
        "profarmer_",
    ),
    "palm": ("commodities_ppoil", "commodities_psoil", "weather_", "news_palm_", "profarmer_"),
    "volatility": ("rates_", "vol_", "activity_", "news_volatility_"),
    "substitutes": (
        "commodities_psoy",
        "commodities_psoil",
        "commodities_ppoil",
        "commodities_pmaiz",
        "commodities_wpu",
        "commodities_pcu",
        "activity_",
        "weather_",
        "news_substitutes_",
        "profarmer_",
    ),
    "trump_effect": (
        "rates_",
        "legislation_trump_effect_",
        "executive_trump_effect_",
        "news_trump_effect_",
    ),
}

_TAG_ALIASES: dict[str, tuple[str, ...]] = {
    "crush": ("crush", "soymeal", "soybean meal", "oil share"),
    "china": ("china", "chinese", "export", "import"),
    "fx": ("fx", "currency", "dollar", "yuan", "cny"),
    "fed": ("fed", "fomc", "rate", "inflation"),
    "tariff": ("tariff", "trade", "duty", "anti-dumping", "import restriction"),
    "energy": ("energy", "crude", "oil", "diesel"),
    "biofuel": ("biofuel", "biodiesel", "renewable", "rin", "lcfs"),
    "palm": ("palm", "mpob", "malaysia", "indonesia"),
    "volatility": ("volatility", "risk", "vix", "ovx"),
    "substitutes": ("substitute", "canola", "sunflower", "tallow", "uco"),
    "trump_effect": (
        "trump",
        "executive",
        "white house",
        "immigration",
        "ice",
        "tariff",
        "trade war",
        "sanction",
        "iran",
        "china deal",
        "deal",
    ),
}


def _safe_name(value: Any) -> str:
    cleaned = re.sub(r"[^0-9a-zA-Z]+", "_", str(value).strip().lower()).strip("_")
    return cleaned or "unknown"


def _read_daily_series(
    conn: Any,
    *,
    table: str,
    prefix: str,
    limit_series: int | None = None,
    align_dates: pd.Series | None = None,
    fill_to_calendar: bool = False,
) -> pd.DataFrame:
    series_filter = ""
    if limit_series is not None:
        series_filter = f"""
        WHERE series_id IN (
          SELECT series_id
          FROM {table}
          GROUP BY series_id
          ORDER BY MAX(observation_date) DESC, COUNT(*) DESC, series_id
          LIMIT {int(limit_series)}
        )
        """

    query = f"""
    SELECT observation_date::date AS trade_date, series_id, value::numeric AS value
    FROM {table}
    {series_filter}
    ORDER BY observation_date, series_id
    """
    frame = pd.read_sql_query(query, conn)
    if frame.empty:
        return pd.DataFrame(columns=["trade_date"])

    frame["trade_date"] = pd.to_datetime(frame["trade_date"]).dt.date
    frame["series_id"] = frame["series_id"].map(lambda item: f"{prefix}_{_safe_name(item)}")
    frame["value"] = pd.to_numeric(frame["value"], errors="coerce")
    pivot = frame.pivot_table(index="trade_date", columns="series_id", values="value", aggfunc="last")
    pivot = pivot.reset_index().sort_values("trade_date")
    if align_dates is not None:
        calendar = (
            pd.DataFrame({"trade_date": pd.to_datetime(align_dates, errors="coerce").dt.date})
            .dropna(subset=["trade_date"])
            .drop_duplicates()
            .sort_values("trade_date")
        )
        if not calendar.empty:
            pivot = calendar.merge(pivot, on="trade_date", how="left").sort_values("trade_date")
            if fill_to_calendar:
                value_cols = [column for column in pivot.columns if column != "trade_date"]
                if value_cols:
                    # Backfill with nearest real observations only; no synthetic constants.
                    pivot[value_cols] = pivot[value_cols].ffill().bfill()
    return pivot


def _read_event_frame(conn: Any, *, table: str, date_column: str, prefix: str) -> pd.DataFrame:
    query = f"""
    SELECT
      t.{date_column}::date AS event_date,
      COALESCE(to_jsonb(t)->>'title', '') AS title,
      COALESCE(to_jsonb(t)->>'source', '') AS source,
      COALESCE(to_jsonb(t)->>'specialist_tags', '') AS specialist_tags,
      COALESCE(to_jsonb(t)->>'url', '') AS url
    FROM {table} t
    WHERE t.{date_column} IS NOT NULL
    ORDER BY t.{date_column}
    """
    frame = pd.read_sql_query(query, conn)
    if frame.empty:
        return pd.DataFrame(columns=["event_date", "search_text", "prefix"])
    frame["event_date"] = pd.to_datetime(frame["event_date"]).dt.date
    frame["search_text"] = (
        frame["title"].fillna("")
        + " "
        + frame["source"].fillna("")
        + " "
        + frame["specialist_tags"].fillna("")
    ).str.lower()
    if table == "alt.profarmer_news":
        title_clean = frame["title"].fillna("").str.strip().str.lower()
        event_date = pd.to_datetime(frame["event_date"], errors="coerce").dt.date
        is_pre2010 = event_date < date(2010, 1, 1)
        is_junk = (
            (frame["url"].fillna("").str.strip() == "")
            & (title_clean.isin({"profarmer", "n"}) | (title_clean.str.len() <= 1))
        )
        frame = frame.loc[~(is_pre2010 | is_junk)].copy()
    frame["prefix"] = prefix
    return frame[["event_date", "search_text", "prefix"]]


def _event_features(matrix_dates: pd.Series, events: pd.DataFrame, *, specialist: str, prefix: str) -> pd.DataFrame:
    dates = pd.DataFrame({"trade_date": pd.to_datetime(matrix_dates).dt.date}).drop_duplicates()
    dates = dates.sort_values("trade_date")
    if events.empty:
        return dates.assign(
            **{
                f"{prefix}_{specialist}_count_30d": 0.0,
                f"{prefix}_{specialist}_count_90d": 0.0,
                f"{prefix}_{specialist}_days_since_latest": pd.NA,
            }
        )

    aliases = _TAG_ALIASES[specialist]
    pattern = "|".join(re.escape(alias) for alias in aliases)
    matched = events[events["search_text"].str.contains(pattern, regex=True, na=False)].copy()
    if matched.empty:
        return dates.assign(
            **{
                f"{prefix}_{specialist}_count_30d": 0.0,
                f"{prefix}_{specialist}_count_90d": 0.0,
                f"{prefix}_{specialist}_days_since_latest": pd.NA,
            }
        )

    counts = matched.groupby("event_date").size().rename("count").sort_index()
    full_index = pd.Index(dates["trade_date"], name="trade_date")
    daily = counts.reindex(full_index, fill_value=0).astype(float)
    out = pd.DataFrame({"trade_date": full_index})
    out[f"{prefix}_{specialist}_count_30d"] = daily.rolling(30, min_periods=1).sum().to_numpy()
    out[f"{prefix}_{specialist}_count_90d"] = daily.rolling(90, min_periods=1).sum().to_numpy()

    latest_seen: list[float | None] = []
    matched_dates = sorted(pd.to_datetime(matched["event_date"]).dt.date.unique())
    cursor = -1
    for trade_date in full_index:
        while cursor + 1 < len(matched_dates) and matched_dates[cursor + 1] <= trade_date:
            cursor += 1
        if cursor < 0:
            latest_seen.append(None)
        else:
            latest_seen.append(float((trade_date - matched_dates[cursor]).days))
    out[f"{prefix}_{specialist}_days_since_latest"] = latest_seen
    return out


def _merge_context(base: pd.DataFrame, context: pd.DataFrame) -> pd.DataFrame:
    if context.empty or list(context.columns) == ["trade_date"]:
        return base
    left = base.sort_values("trade_date")
    right = context.sort_values("trade_date")
    return pd.merge_asof(left, right, on="trade_date", direction="backward")


def _source_context(conn: Any, matrix_dates: pd.Series) -> dict[str, pd.DataFrame]:
    contexts: dict[str, pd.DataFrame] = {
        "rates": _read_daily_series(conn, table="econ.rates_1d", prefix="rates"),
        "commodities": _read_daily_series(conn, table="econ.commodities_1d", prefix="commodities"),
        "vol": _read_daily_series(conn, table="econ.vol_indices_1d", prefix="vol"),
        "activity": _read_daily_series(conn, table="econ.activity_1d", prefix="activity"),
        "weather": _read_daily_series(
            conn,
            table="econ.weather_1d",
            prefix="weather",
            limit_series=12,
            align_dates=matrix_dates,
            fill_to_calendar=True,
        ),
    }

    event_sources = [
        _read_event_frame(conn, table="alt.profarmer_news", date_column="published_at", prefix="profarmer"),
        _read_event_frame(conn, table="alt.news_events", date_column="published_at", prefix="news"),
        _read_event_frame(conn, table="alt.legislation_1d", date_column="published_at", prefix="legislation"),
        _read_event_frame(conn, table="alt.fed_speeches", date_column="published_at", prefix="fed_speech"),
        _read_event_frame(conn, table="alt.executive_actions", date_column="published_at", prefix="executive"),
    ]

    for source_events in event_sources:
        if source_events.empty:
            continue
        prefix = str(source_events["prefix"].iloc[0])
        for specialist in SPECIALISTS:
            contexts[f"{prefix}_{specialist}"] = _event_features(
                matrix_dates,
                source_events,
                specialist=specialist,
                prefix=prefix,
            )

    return contexts


def _select_columns(frame: pd.DataFrame, specialist: str) -> list[str]:
    selected = ["trade_date"]
    market_cols = [*_COMMON_MARKET_COLUMNS, *_SPECIALIST_MARKET_COLUMNS[specialist]]
    for column in market_cols:
        if column in frame.columns and column not in selected:
            selected.append(column)

    patterns = _SPECIALIST_SOURCE_PATTERNS[specialist]
    for column in frame.columns:
        if column in selected or column == "specialist":
            continue
        if any(column.startswith(pattern) for pattern in patterns):
            selected.append(column)

    return selected


def _validate_symbol_ownership_for_specialist(*, specialist: str, columns: list[str]) -> None:
    column_set = set(columns)
    for symbol, owner in _SPECIALIST_SYMBOL_OWNERSHIP.items():
        symbol_cols = _SYMBOL_MARKET_COLUMNS[symbol]
        used = sorted(column_set.intersection(symbol_cols))
        if not used:
            continue
        if specialist != owner:
            raise RuntimeError(
                f"{specialist} includes {symbol}-owned fields {used}; {symbol} is owned by {owner}"
            )


def _validate_symbol_ownership_across_specialists(frames: dict[str, pd.DataFrame]) -> None:
    symbol_users: dict[str, set[str]] = {symbol: set() for symbol in _SYMBOL_MARKET_COLUMNS}
    for specialist, frame in frames.items():
        cols = set(frame.columns)
        for symbol, symbol_cols in _SYMBOL_MARKET_COLUMNS.items():
            if cols.intersection(symbol_cols):
                symbol_users[symbol].add(specialist)

    violations: list[str] = []
    for symbol, users in symbol_users.items():
        owner = _SPECIALIST_SYMBOL_OWNERSHIP[symbol]
        if not users:
            continue
        if users != {owner}:
            violations.append(f"{symbol}: users={sorted(users)} owner={owner}")

    if violations:
        raise RuntimeError("specialist symbol ownership violation: " + "; ".join(violations))


def _build_specialist_frame(matrix: pd.DataFrame, contexts: dict[str, pd.DataFrame], specialist: str) -> pd.DataFrame:
    frame = matrix[["trade_date", *feature_columns(matrix.columns)]].copy()
    assert_no_target_columns(frame, context=f"{specialist} specialist feature input")
    frame["trade_date"] = pd.to_datetime(frame["trade_date"])

    for context in contexts.values():
        if context.empty or "trade_date" not in context.columns:
            continue
        clean_context = context.copy()
        clean_context["trade_date"] = pd.to_datetime(clean_context["trade_date"])
        frame = _merge_context(frame, clean_context)

    selected_columns = _select_columns(frame, specialist)
    _validate_symbol_ownership_for_specialist(specialist=specialist, columns=selected_columns)
    selected = frame[selected_columns].copy()
    numeric_cols = [column for column in selected.columns if column != "trade_date"]
    for column in numeric_cols:
        selected[column] = pd.to_numeric(selected[column], errors="coerce")

    source_cols = [column for column in numeric_cols if column not in _COMMON_MARKET_COLUMNS]
    selected.insert(1, "specialist", specialist)
    selected["source_feature_count"] = float(len(source_cols))
    if source_cols:
        selected["source_null_ratio"] = selected[source_cols].isna().mean(axis=1).astype(float)
    else:
        selected["source_null_ratio"] = 1.0

    assert_no_target_columns(selected, context=f"{specialist} specialist feature output")
    selected["trade_date"] = pd.to_datetime(selected["trade_date"]).dt.date
    return selected


def run(*, dry_run: bool = False) -> dict[str, object]:
    output_paths = [specialist_features_path(specialist) for specialist in SPECIALISTS]
    if dry_run:
        return {
            "phase": "specialist-features",
            "dry_run": True,
            "reads": [
                str(matrix_path()),
                "econ.rates_1d",
                "econ.commodities_1d",
                "econ.vol_indices_1d",
                "econ.activity_1d",
                "econ.weather_1d",
                "alt.*",
            ],
            "writes": [str(path) for path in output_paths],
            "cloud_writes": [],
            "specialists": SPECIALISTS,
            "status": "dry-run",
        }

    matrix = read_parquet(matrix_path())
    if matrix.empty:
        raise RuntimeError("local matrix parquet is empty; build matrix first")

    db_url = resolve_cloud_db_url()
    if not db_url:
        raise RuntimeError(
            "Cloud DB URL is not set. Configure DATABASE_URL, SUPABASE_DB_URL, POSTGRES_URL_NON_POOLING, or SUPABASE_POOLER_URL."
        )

    with psycopg2.connect(db_url, connect_timeout=10, application_name="fusion_specialist_features") as conn:
        contexts = _source_context(conn, matrix["trade_date"])

    specialist_counts: dict[str, int] = {}
    source_feature_counts: dict[str, int] = {}
    specialist_frames: dict[str, pd.DataFrame] = {}
    for specialist in SPECIALISTS:
        specialist_frame = _build_specialist_frame(matrix, contexts, specialist)
        specialist_frames[specialist] = specialist_frame

    _validate_symbol_ownership_across_specialists(specialist_frames)

    for specialist, specialist_frame in specialist_frames.items():
        output_path = specialist_features_path(specialist)
        write_parquet(specialist_frame, output_path)
        specialist_counts[specialist] = int(len(specialist_frame))
        source_feature_counts[specialist] = int(specialist_frame["source_feature_count"].iloc[0])

    return {
        "phase": "specialist-features",
        "dry_run": False,
        "reads": [
            str(matrix_path()),
            "econ.rates_1d",
            "econ.commodities_1d",
            "econ.vol_indices_1d",
            "econ.activity_1d",
            "econ.weather_1d",
            "alt.*",
        ],
        "writes": [str(path) for path in output_paths],
        "cloud_writes": [],
        "specialists": SPECIALISTS,
        "status": "ok",
        "rows_written_per_specialist": specialist_counts,
        "source_feature_counts": source_feature_counts,
    }
