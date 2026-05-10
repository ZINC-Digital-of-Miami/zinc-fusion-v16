from __future__ import annotations

from pathlib import Path
from typing import Iterable

import pandas as pd

from .config import SPECIALISTS, load_config

MATRIX_FILE = "matrix_1d.parquet"
SIGNALS_FILE = "specialist_signals.parquet"
TRAINING_RUNS_FILE = "training_runs.parquet"

TARGET_PREFIX = "target_price_"


def local_data_dir() -> Path:
    return load_config().local_data_dir


def artifact_path(*parts: str) -> Path:
    return local_data_dir().joinpath(*parts)


def matrix_path() -> Path:
    return artifact_path(MATRIX_FILE)


def specialist_features_dir() -> Path:
    return artifact_path("specialist_features")


def specialist_features_path(specialist: str) -> Path:
    if specialist not in SPECIALISTS:
        raise ValueError(f"unknown specialist: {specialist}")
    return specialist_features_dir().joinpath(f"{specialist}.parquet")


def signals_path() -> Path:
    return artifact_path(SIGNALS_FILE)


def training_runs_path() -> Path:
    return artifact_path(TRAINING_RUNS_FILE)


def model_artifact_dir(run_id: str) -> Path:
    return load_config().model_artifact_dir.joinpath(run_id)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def write_parquet(df: pd.DataFrame, path: Path) -> None:
    if df.empty:
        raise RuntimeError(f"refusing to write empty parquet artifact: {path}")
    ensure_parent(path)
    df.to_parquet(path, index=False)


def read_parquet(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"missing local parquet artifact: {path}")
    return pd.read_parquet(path)


def target_columns(columns: Iterable[str]) -> list[str]:
    return [column for column in columns if column.startswith(TARGET_PREFIX)]


def feature_columns(columns: Iterable[str]) -> list[str]:
    return [
        column
        for column in columns
        if column != "trade_date" and not column.startswith(TARGET_PREFIX)
    ]


def assert_no_target_columns(df: pd.DataFrame, *, context: str) -> None:
    leaked = target_columns(df.columns)
    if leaked:
        raise RuntimeError(f"{context} contains target columns: {', '.join(leaked)}")


def numeric_feature_columns(df: pd.DataFrame) -> list[str]:
    excluded = {"trade_date", "specialist"}
    return [
        column
        for column in df.columns
        if column not in excluded
        and not column.startswith(TARGET_PREFIX)
        and pd.api.types.is_numeric_dtype(df[column])
    ]
