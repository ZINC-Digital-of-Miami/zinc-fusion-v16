from __future__ import annotations

import math

import pandas as pd

from .artifacts import (
    assert_no_target_columns,
    numeric_feature_columns,
    signals_path,
    specialist_features_path,
    write_parquet,
)
from .config import SPECIALISTS


def _bounded_tanh(value: float, scale: float = 1.0) -> float:
    if pd.isna(value):
        return 0.0
    return max(-1.0, min(1.0, math.tanh(float(value) * scale)))


def _rolling_zscore(series: pd.Series, *, window: int = 252) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    mean = numeric.rolling(window=window, min_periods=20).mean()
    std = numeric.rolling(window=window, min_periods=20).std(ddof=0)
    z = (numeric - mean) / std.replace(0, pd.NA)
    return z.clip(-5, 5).fillna(0.0)


def _family_columns(columns: list[str], tokens: tuple[str, ...]) -> list[str]:
    return [column for column in columns if any(token in column for token in tokens)]


def _signal_from_columns(frame: pd.DataFrame, columns: list[str], *, scale: float) -> pd.Series:
    if not columns:
        return pd.Series(0.0, index=frame.index)
    zscores = [_rolling_zscore(frame[column]) for column in columns]
    combined = pd.concat(zscores, axis=1).mean(axis=1)
    return combined.map(lambda value: _bounded_tanh(value, scale=scale))


def _build_specialist_signal(specialist: str) -> pd.DataFrame:
    frame = pd.read_parquet(specialist_features_path(specialist))
    if frame.empty:
        raise RuntimeError(f"specialist feature parquet is empty: {specialist}")
    assert_no_target_columns(frame, context=f"{specialist} signal input")

    frame = frame.sort_values("trade_date").reset_index(drop=True)
    numeric_cols = numeric_feature_columns(frame)
    short_cols = _family_columns(numeric_cols, ("ret_20d", "ret_30d", "count_30d", "vol_", "std_20"))
    long_cols = _family_columns(numeric_cols, ("ret_90d", "ret_180d", "count_90d", "activity_", "weather_", "std_60"))

    if not short_cols:
        short_cols = numeric_cols[: max(1, min(5, len(numeric_cols)))]
    if not long_cols:
        long_cols = numeric_cols[-max(1, min(5, len(numeric_cols))) :]

    sig_1 = _signal_from_columns(frame, short_cols, scale=0.75)
    sig_2 = _signal_from_columns(frame, long_cols, scale=0.55)

    observed_ratio = frame[numeric_cols].notna().mean(axis=1) if numeric_cols else pd.Series(0.0, index=frame.index)
    confidence = (observed_ratio * 0.65 + (sig_1.abs() + sig_2.abs()) * 0.175).clip(0, 1)

    return pd.DataFrame(
        {
            "trade_date": pd.to_datetime(frame["trade_date"]).dt.date,
            f"sig_{specialist}_1": sig_1.round(8),
            f"sig_{specialist}_2": sig_2.round(8),
            f"sig_{specialist}_conf": confidence.round(8),
        }
    )


def run(*, dry_run: bool = False) -> dict[str, object]:
    output_path = signals_path()
    input_paths = [specialist_features_path(specialist) for specialist in SPECIALISTS]
    if dry_run:
        return {
            "phase": "specialist-signals",
            "dry_run": True,
            "reads": [str(path) for path in input_paths],
            "writes": [str(output_path)],
            "cloud_writes": [],
            "status": "dry-run",
        }

    merged: pd.DataFrame | None = None
    for specialist in SPECIALISTS:
        specialist_signal = _build_specialist_signal(specialist)
        merged = specialist_signal if merged is None else merged.merge(specialist_signal, on="trade_date", how="inner")

    if merged is None or merged.empty:
        raise RuntimeError("no aligned specialist signal rows were produced")

    assert_no_target_columns(merged, context="specialist signal output")
    write_parquet(merged, output_path)

    signal_columns = [column for column in merged.columns if column != "trade_date"]
    return {
        "phase": "specialist-signals",
        "dry_run": False,
        "reads": [str(path) for path in input_paths],
        "writes": [str(output_path)],
        "cloud_writes": [],
        "status": "ok",
        "rows_written": int(len(merged)),
        "signal_columns": len(signal_columns),
        "trade_date_min": str(merged["trade_date"].min()),
        "trade_date_max": str(merged["trade_date"].max()),
    }
