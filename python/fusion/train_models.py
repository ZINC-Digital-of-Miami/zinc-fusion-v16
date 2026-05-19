from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from urllib.parse import urlparse
from uuid import uuid4

import pandas as pd
import psycopg2

from .artifacts import (
    feature_columns,
    matrix_path,
    model_artifact_dir,
    read_parquet,
    target_columns,
    training_runs_path,
    write_parquet,
)
from .config import HORIZONS, TARGET_TEMPLATE, load_config, resolve_local_training_db_url
from .training_readiness_gate import TrainingReadinessError
from .training_readiness_gate import run as run_training_readiness


class TrainingApprovalError(RuntimeError):
    pass


class TrainingContractError(RuntimeError):
    pass


LOCKED_PRESET = "best_quality"
LOCKED_TIME_LIMIT_SECONDS = 3600
LOCKED_NUM_BAG_FOLDS = 5
LOCKED_NUM_STACK_LEVELS = 1
LOCKED_MODEL_SELECTION_MODE = "full_zoo"
LOCKED_TRAINING_SOURCE = "local_postgres_panel"
LOCKED_MIN_DIRECTIONAL_ACCURACY = 0.70
MAX_DEFAULT_NUM_CPUS = 8
MODEL_SELECTION_MODES = {"full_zoo", "include_only", "exclude_only"}
TRAINING_SOURCE_MODES = {"local_postgres_panel", "local_postgres", "parquet_artifacts"}
INTERNAL_MODEL_TYPE_EXCLUSIONS: tuple[str, ...] = (
    "DUMMY",
    "ENS_WEIGHTED",
    "SIMPLE_ENS_WEIGHTED",
    "GBM_PREP",
    "AG_IMAGE_NN",
    "AG_TEXT_NN",
    "FASTTEXT",
)


def _parse_int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return int(value)


def _parse_float_env(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return float(value)


def _parse_csv_env(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def _normalize_model_types(values: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for item in values:
        key = item.strip().upper()
        if not key or key in seen:
            continue
        seen.add(key)
        normalized.append(key)
    return normalized


def _resolve_num_cpus() -> int:
    requested = _parse_int_env("AUTOGLUON_NUM_CPUS", 0)
    if requested > 0:
        return requested
    cpu_total = os.cpu_count() or 1
    return max(1, min(cpu_total, MAX_DEFAULT_NUM_CPUS))


def _apply_runtime_thread_guard(*, num_cpus: int) -> dict[str, int]:
    thread_budget = max(1, min(num_cpus, MAX_DEFAULT_NUM_CPUS))
    runtime_vars = {
        "OMP_NUM_THREADS": thread_budget,
        "OPENBLAS_NUM_THREADS": thread_budget,
        "MKL_NUM_THREADS": thread_budget,
        "VECLIB_MAXIMUM_THREADS": thread_budget,
        "NUMEXPR_NUM_THREADS": thread_budget,
    }
    for key, value in runtime_vars.items():
        os.environ[key] = str(value)
    return runtime_vars


def _resolve_runtime_guard(*, dry_run: bool) -> dict[str, object]:
    allow_unsafe = os.getenv("AUTOGLUON_ALLOW_UNSAFE_RUNTIME", "0").strip() == "1"
    requires_guard = sys.version_info[:2] >= (3, 12)
    runtime = {
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "python_executable": sys.executable,
        "allow_unsafe_runtime": allow_unsafe,
        "requires_safe_runtime": requires_guard,
    }
    if requires_guard and not allow_unsafe and not dry_run:
        raise TrainingContractError(
            "Unsafe AutoGluon runtime detected on Python 3.12+. "
            "Use the project's .venv-ag311 environment for approved training runs, "
            "or set AUTOGLUON_ALLOW_UNSAFE_RUNTIME=1 only for explicit crash-risk override runs."
        )
    return runtime


def _resolve_openmp_runtime() -> dict[str, object]:
    try:
        import lightgbm  # noqa: F401
    except Exception as exc:  # noqa: BLE001
        return {"detected": False, "error": f"lightgbm import failed: {exc}", "openmp_libraries": []}
    try:
        import sklearn  # noqa: F401
    except Exception:
        # sklearn import is optional for this guard; proceed with whatever is loaded.
        pass

    try:
        from threadpoolctl import threadpool_info
    except Exception as exc:  # noqa: BLE001
        return {"detected": False, "error": f"threadpoolctl unavailable: {exc}", "openmp_libraries": []}

    info = threadpool_info()
    openmp_libraries = sorted(
        {
            str(entry.get("filepath"))
            for entry in info
            if entry.get("user_api") == "openmp" and entry.get("filepath")
        }
    )
    return {
        "detected": True,
        "openmp_libraries": openmp_libraries,
        "openmp_library_count": len(openmp_libraries),
    }


def _discover_full_zoo_model_types() -> list[str]:
    from autogluon.tabular.trainer.model_presets import presets

    registry_keys = getattr(presets.ag_model_registry, "keys", [])
    if not isinstance(registry_keys, list) or not registry_keys:
        raise TrainingContractError("unable to discover AutoGluon model registry keys for full-zoo selection")

    internal = set(INTERNAL_MODEL_TYPE_EXCLUSIONS)
    selected: list[str] = []
    for raw_key in registry_keys:
        key = str(raw_key).strip().upper()
        if not key:
            continue
        if key in internal:
            continue
        if key.startswith("IM_"):
            continue
        selected.append(key)
    selected = _normalize_model_types(selected)
    if not selected:
        raise TrainingContractError("full-zoo selection resolved to 0 model types")
    return selected


def _resolve_model_selection(*, allow_override: bool) -> tuple[str, list[str], list[str], list[str], bool]:
    selection_mode = os.getenv("AUTOGLUON_MODEL_SELECTION_MODE", LOCKED_MODEL_SELECTION_MODE).strip().lower()
    if selection_mode not in MODEL_SELECTION_MODES:
        raise TrainingContractError(
            f"unsupported AUTOGLUON_MODEL_SELECTION_MODE={selection_mode!r}; "
            f"valid={sorted(MODEL_SELECTION_MODES)}"
        )

    requested_included = _normalize_model_types(_parse_csv_env("AUTOGLUON_INCLUDED_MODEL_TYPES"))
    requested_excluded = _normalize_model_types(_parse_csv_env("AUTOGLUON_EXCLUDED_MODEL_TYPES"))
    available_full_zoo = _discover_full_zoo_model_types()
    available_set = set(available_full_zoo)

    unknown_included = sorted([value for value in requested_included if value not in available_set])
    unknown_excluded = sorted([value for value in requested_excluded if value not in available_set])
    if unknown_included or unknown_excluded:
        raise TrainingContractError(
            "unknown model types in selection request: "
            + f"included_unknown={unknown_included}, excluded_unknown={unknown_excluded}"
        )

    if selection_mode == "full_zoo":
        if not allow_override and (requested_included or requested_excluded):
            raise TrainingContractError(
                "AUTOGLUON_MODEL_SELECTION_MODE=full_zoo does not accept "
                "AUTOGLUON_INCLUDED_MODEL_TYPES or AUTOGLUON_EXCLUDED_MODEL_TYPES unless "
                "AUTOGLUON_ALLOW_CONTRACT_OVERRIDE=1."
            )
        included_model_types = available_full_zoo
        excluded_model_types: list[str] = []
    elif selection_mode == "include_only":
        if not requested_included:
            raise TrainingContractError(
                "AUTOGLUON_MODEL_SELECTION_MODE=include_only requires AUTOGLUON_INCLUDED_MODEL_TYPES"
            )
        if requested_excluded:
            raise TrainingContractError(
                "AUTOGLUON_MODEL_SELECTION_MODE=include_only cannot be combined with "
                "AUTOGLUON_EXCLUDED_MODEL_TYPES"
            )
        included_model_types = requested_included
        excluded_model_types = []
    else:
        if requested_included:
            raise TrainingContractError(
                "AUTOGLUON_MODEL_SELECTION_MODE=exclude_only cannot be combined with "
                "AUTOGLUON_INCLUDED_MODEL_TYPES"
            )
        included_model_types = []
        excluded_model_types = requested_excluded

    return selection_mode, included_model_types, excluded_model_types, available_full_zoo, selection_mode == LOCKED_MODEL_SELECTION_MODE


def _resolve_training_source(*, allow_override: bool) -> str:
    source = os.getenv("AUTOGLUON_TRAINING_SOURCE", LOCKED_TRAINING_SOURCE).strip().lower() or LOCKED_TRAINING_SOURCE
    if source not in TRAINING_SOURCE_MODES:
        raise TrainingContractError(
            f"unsupported AUTOGLUON_TRAINING_SOURCE={source!r}; valid={sorted(TRAINING_SOURCE_MODES)}"
        )
    if not allow_override and source != LOCKED_TRAINING_SOURCE:
        raise TrainingContractError(
            "Hard lock violation on AG training source: "
            + f"AUTOGLUON_TRAINING_SOURCE={source!r} (locked={LOCKED_TRAINING_SOURCE!r}). "
            + "Set AUTOGLUON_ALLOW_CONTRACT_OVERRIDE=1 only for explicit, approved override runs."
        )
    return source


def _resolve_training_contract() -> tuple[int, str, int, int, str, list[str], list[str], list[str], str, bool, bool]:
    allow_override = os.getenv("AUTOGLUON_ALLOW_CONTRACT_OVERRIDE", "0").strip() == "1"
    requested_time_limit = _parse_int_env("AUTOGLUON_TIME_LIMIT_SECONDS", LOCKED_TIME_LIMIT_SECONDS)
    requested_presets = os.getenv("AUTOGLUON_PRESETS", LOCKED_PRESET)
    requested_num_bag_folds = _parse_int_env("AUTOGLUON_NUM_BAG_FOLDS", LOCKED_NUM_BAG_FOLDS)
    requested_num_stack_levels = _parse_int_env("AUTOGLUON_NUM_STACK_LEVELS", LOCKED_NUM_STACK_LEVELS)
    training_source = _resolve_training_source(allow_override=allow_override)
    (
        selection_mode,
        included_model_types,
        excluded_model_types,
        available_full_zoo,
        model_selection_lock_enforced,
    ) = _resolve_model_selection(allow_override=allow_override)

    if allow_override:
        return (
            requested_time_limit,
            requested_presets,
            requested_num_bag_folds,
            requested_num_stack_levels,
            selection_mode,
            included_model_types,
            excluded_model_types,
            available_full_zoo,
            training_source,
            False,
            model_selection_lock_enforced,
        )

    conflicts: list[str] = []
    if requested_time_limit != LOCKED_TIME_LIMIT_SECONDS:
        conflicts.append(
            f"AUTOGLUON_TIME_LIMIT_SECONDS={requested_time_limit} (locked={LOCKED_TIME_LIMIT_SECONDS})"
        )
    if requested_presets != LOCKED_PRESET:
        conflicts.append(f"AUTOGLUON_PRESETS={requested_presets!r} (locked={LOCKED_PRESET!r})")
    if requested_num_bag_folds != LOCKED_NUM_BAG_FOLDS:
        conflicts.append(
            f"AUTOGLUON_NUM_BAG_FOLDS={requested_num_bag_folds} (locked={LOCKED_NUM_BAG_FOLDS})"
        )
    if requested_num_stack_levels != LOCKED_NUM_STACK_LEVELS:
        conflicts.append(
            f"AUTOGLUON_NUM_STACK_LEVELS={requested_num_stack_levels} (locked={LOCKED_NUM_STACK_LEVELS})"
        )
    if conflicts:
        raise TrainingContractError(
            "Hard lock violation on ZL AG training contract: "
            + "; ".join(conflicts)
            + ". Set AUTOGLUON_ALLOW_CONTRACT_OVERRIDE=1 only for explicit, approved override runs."
        )

    return (
        LOCKED_TIME_LIMIT_SECONDS,
        LOCKED_PRESET,
        LOCKED_NUM_BAG_FOLDS,
        LOCKED_NUM_STACK_LEVELS,
        selection_mode,
        included_model_types,
        excluded_model_types,
        available_full_zoo,
        training_source,
        True,
        model_selection_lock_enforced,
    )


def _git_sha() -> str | None:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    except Exception:
        return None


def _pip_freeze() -> list[str]:
    try:
        output = subprocess.check_output([sys.executable, "-m", "pip", "freeze"], text=True)
        return [line for line in output.splitlines() if line.strip()]
    except Exception:
        return []


def _load_training_frame_from_artifacts(*, target_mode: str) -> tuple[pd.DataFrame, dict[int, str]]:
    matrix = read_parquet(matrix_path())
    if matrix.empty:
        raise TrainingContractError("matrix artifact is empty")

    labels = target_columns(matrix.columns)
    expected_labels = [TARGET_TEMPLATE.format(h=h) for h in HORIZONS]
    if labels != expected_labels:
        missing = [label for label in expected_labels if label not in labels]
        extra = [label for label in labels if label not in expected_labels]
        raise TrainingContractError(f"unexpected target labels. missing={missing}, extra={extra}")

    frame = matrix.sort_values("trade_date").reset_index(drop=True)
    if frame.empty:
        raise TrainingContractError("matrix artifact has no training rows")
    if target_mode not in {"price", "returns"}:
        raise TrainingContractError(f"unsupported AUTOGLUON_TARGET_MODE={target_mode!r}")

    if target_mode == "price":
        for label in expected_labels:
            usable = int(frame[label].notna().sum())
            if usable == 0:
                raise TrainingContractError(f"target label column has no non-null rows: {label}")
        label_map = {horizon: TARGET_TEMPLATE.format(h=horizon) for horizon in HORIZONS}
        return frame, label_map

    if "close" not in frame.columns:
        raise TrainingContractError("returns target mode requires close column in matrix artifact")
    close = pd.to_numeric(frame["close"], errors="coerce")
    if (close <= 0).all():
        raise TrainingContractError("returns target mode requires positive close values")

    label_map: dict[int, str] = {}
    for horizon in HORIZONS:
        price_label = TARGET_TEMPLATE.format(h=horizon)
        returns_label = f"target_return_{horizon}d"
        frame[returns_label] = pd.to_numeric(frame[price_label], errors="coerce") / close - 1.0
        label_map[horizon] = returns_label

    for label in label_map.values():
        usable = int(frame[label].notna().sum())
        if usable == 0:
            raise TrainingContractError(f"returns target column has no non-null rows: {label}")

    return frame, label_map


def _validate_local_training_db_url(db_url: str) -> None:
    parsed = urlparse(db_url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise TrainingContractError(f"local AG DB URL must be postgres/postgresql, got: {parsed.scheme!r}")
    host = (parsed.hostname or "").lower()
    if host not in {"localhost", "127.0.0.1", "::1"}:
        raise TrainingContractError(
            "local AG DB URL must resolve to localhost/127.0.0.1/::1. "
            + f"got host={host or '<empty>'!r}"
        )
    db_name = (parsed.path or "").lstrip("/")
    if db_name != "fusion":
        raise TrainingContractError(
            "local AG DB URL must target database 'fusion'. "
            + f"got {db_name or '<empty>'!r}"
        )


def _load_training_frame_from_local_postgres(*, target_mode: str) -> tuple[pd.DataFrame, dict[int, str]]:
    db_url = resolve_local_training_db_url()
    _validate_local_training_db_url(db_url)

    try:
        with psycopg2.connect(db_url, connect_timeout=10, application_name="fusion_train_local_source") as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT trade_date, feature_snapshot FROM training.matrix_1d ORDER BY trade_date")
                matrix_rows = pd.DataFrame(cur.fetchall(), columns=["trade_date", "feature_snapshot"])
                cur.execute(
                    """
                    SELECT trade_date, target_price_30d, target_price_90d, target_price_180d
                    FROM training.matrix_targets_1d
                    ORDER BY trade_date
                    """
                )
                target_rows = pd.DataFrame(
                    cur.fetchall(),
                    columns=["trade_date", "target_price_30d", "target_price_90d", "target_price_180d"],
                )
    except Exception as exc:  # noqa: BLE001
        message = str(exc)
        if "relation" in message and (
            "training.matrix_1d" in message
            or "training.matrix_targets_1d" in message
        ):
            raise TrainingContractError(
                "Local AG tables are missing. Run local loader first with explicit approval: "
                "`PYTHONPATH=python python3 -m fusion.load_local_db --execute`."
            ) from exc
        raise TrainingContractError(f"unable to read local AG training source: {exc}") from exc

    if matrix_rows.empty:
        raise TrainingContractError("local training.matrix_1d is empty; run local AG load before training")
    if target_rows.empty:
        raise TrainingContractError("local training.matrix_targets_1d is empty; run local AG load before training")

    matrix_features = pd.json_normalize(matrix_rows["feature_snapshot"]).fillna(pd.NA)
    matrix = pd.concat([matrix_rows[["trade_date"]], matrix_features], axis=1)
    target_frame = target_rows[["trade_date", "target_price_30d", "target_price_90d", "target_price_180d"]].copy()

    for frame in (matrix, target_frame):
        frame["trade_date"] = pd.to_datetime(frame["trade_date"], errors="coerce").dt.date

    merged = matrix.merge(target_frame, on="trade_date", how="inner")
    merged = merged.sort_values("trade_date").reset_index(drop=True)
    if merged.empty:
        raise TrainingContractError("local AG matrix + targets have no aligned trade dates")
    return _coerce_training_frame(merged, target_mode=target_mode)


def _load_training_frame_from_local_postgres_panel(*, target_mode: str) -> tuple[pd.DataFrame, dict[int, str]]:
    db_url = resolve_local_training_db_url()
    _validate_local_training_db_url(db_url)

    try:
        with psycopg2.connect(db_url, connect_timeout=10, application_name="fusion_train_local_panel_source") as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                      p.trade_date,
                      p.bucket_ts,
                      p.feature_snapshot,
                      t.target_price_30d,
                      t.target_price_90d,
                      t.target_price_180d
                    FROM training.matrix_panel_1h p
                    JOIN training.matrix_panel_targets_1h t
                      ON t.sample_id = p.sample_id
                    ORDER BY p.bucket_ts, p.symbol
                    """
                )
                panel_rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001
        message = str(exc)
        if "relation" in message and (
            "training.matrix_panel_1h" in message
            or "training.matrix_panel_targets_1h" in message
        ):
            raise TrainingContractError(
                "Local AG symbol-time panel tables are missing. Build and load them first with explicit approval: "
                "`PYTHONPATH=python python3 -m fusion.build_local_symbol_time_panel --execute`."
            ) from exc
        raise TrainingContractError(f"unable to read local AG symbol-time panel source: {exc}") from exc

    if not panel_rows:
        raise TrainingContractError(
            "local training.matrix_panel_1h is empty; build local symbol-time panel before training"
        )

    panel = pd.DataFrame(
        panel_rows,
        columns=[
            "trade_date",
            "bucket_ts",
            "feature_snapshot",
            "target_price_30d",
            "target_price_90d",
            "target_price_180d",
        ],
    )
    panel_features = pd.json_normalize(panel["feature_snapshot"]).fillna(pd.NA)
    frame = pd.concat([panel[["trade_date", "bucket_ts"]], panel_features, panel[[
        "target_price_30d",
        "target_price_90d",
        "target_price_180d",
    ]]], axis=1)

    frame["trade_date"] = pd.to_datetime(frame["trade_date"], errors="coerce").dt.date
    frame["bucket_ts"] = pd.to_datetime(frame["bucket_ts"], errors="coerce", utc=True)
    frame = frame.dropna(subset=["trade_date", "bucket_ts"]).sort_values("bucket_ts").reset_index(drop=True)
    if frame.empty:
        raise TrainingContractError("local AG symbol-time panel has no usable rows after coercion")
    return _coerce_training_frame(frame, target_mode=target_mode)


def _coerce_training_frame(frame: pd.DataFrame, *, target_mode: str) -> tuple[pd.DataFrame, dict[int, str]]:
    expected_labels = [TARGET_TEMPLATE.format(h=h) for h in HORIZONS]
    labels = target_columns(frame.columns)
    if labels != expected_labels:
        missing = [label for label in expected_labels if label not in labels]
        extra = [label for label in labels if label not in expected_labels]
        raise TrainingContractError(f"unexpected target labels. missing={missing}, extra={extra}")

    if target_mode not in {"price", "returns"}:
        raise TrainingContractError(f"unsupported AUTOGLUON_TARGET_MODE={target_mode!r}")

    if target_mode == "price":
        for label in expected_labels:
            usable = int(pd.to_numeric(frame[label], errors="coerce").notna().sum())
            if usable == 0:
                raise TrainingContractError(f"target label column has no non-null rows: {label}")
        label_map = {horizon: TARGET_TEMPLATE.format(h=horizon) for horizon in HORIZONS}
        return frame, label_map

    if "close" not in frame.columns:
        raise TrainingContractError("returns target mode requires close column in training frame")
    close = pd.to_numeric(frame["close"], errors="coerce")
    if (close <= 0).all():
        raise TrainingContractError("returns target mode requires positive close values")

    label_map: dict[int, str] = {}
    for horizon in HORIZONS:
        price_label = TARGET_TEMPLATE.format(h=horizon)
        returns_label = f"target_return_{horizon}d"
        frame[returns_label] = pd.to_numeric(frame[price_label], errors="coerce") / close - 1.0
        label_map[horizon] = returns_label

    for label in label_map.values():
        usable = int(pd.to_numeric(frame[label], errors="coerce").notna().sum())
        if usable == 0:
            raise TrainingContractError(f"returns target column has no non-null rows: {label}")

    return frame, label_map


def _load_training_frame(*, target_mode: str, training_source: str) -> tuple[pd.DataFrame, dict[int, str]]:
    if training_source == "parquet_artifacts":
        frame, _ = _load_training_frame_from_artifacts(target_mode="price")
        return _coerce_training_frame(frame, target_mode=target_mode)
    if training_source == "local_postgres_panel":
        return _load_training_frame_from_local_postgres_panel(target_mode=target_mode)
    if training_source == "local_postgres":
        return _load_training_frame_from_local_postgres(target_mode=target_mode)
    raise TrainingContractError(f"unsupported training source: {training_source!r}")


def _summarize_training_frame_from_local_postgres_panel() -> dict[str, object]:
    db_url = resolve_local_training_db_url()
    _validate_local_training_db_url(db_url)

    with psycopg2.connect(db_url, connect_timeout=10, application_name="fusion_train_panel_dry_summary") as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  COUNT(*)::BIGINT AS rows,
                  COUNT(DISTINCT p.symbol)::BIGINT AS symbol_count,
                  MIN(p.trade_date) AS trade_date_min,
                  MAX(p.trade_date) AS trade_date_max,
                  COUNT(*) FILTER (
                    WHERE t.target_price_30d IS NOT NULL
                      AND t.target_price_90d IS NOT NULL
                      AND t.target_price_180d IS NOT NULL
                  )::BIGINT AS fully_labeled_rows
                FROM training.matrix_panel_1h p
                JOIN training.matrix_panel_targets_1h t
                  ON t.sample_id = p.sample_id
                """
            )
            rows, symbol_count, trade_date_min, trade_date_max, fully_labeled_rows = cur.fetchone()

            cur.execute(
                """
                SELECT
                  MIN((SELECT COUNT(*) FROM jsonb_object_keys(feature_snapshot)))::INT AS min_keys,
                  MAX((SELECT COUNT(*) FROM jsonb_object_keys(feature_snapshot)))::INT AS max_keys
                FROM training.matrix_panel_1h
                """
            )
            min_keys, max_keys = cur.fetchone()

    return {
        "rows": int(rows or 0),
        "symbol_count": int(symbol_count or 0),
        "feature_columns_min_keys": int(min_keys or 0),
        "feature_columns_max_keys": int(max_keys or 0),
        "fully_labeled_rows": int(fully_labeled_rows or 0),
        "target_columns": [TARGET_TEMPLATE.format(h=h) for h in HORIZONS],
        "trade_date_min": str(trade_date_min) if trade_date_min else None,
        "trade_date_max": str(trade_date_max) if trade_date_max else None,
    }


def _dry_run_training_frame_status(*, target_mode: str, training_source: str) -> dict[str, object]:
    if training_source == "local_postgres_panel":
        return _summarize_training_frame_from_local_postgres_panel()

    frame, label_map = _load_training_frame(target_mode=target_mode, training_source=training_source)
    return {
        "rows": int(len(frame)),
        "feature_columns": len(feature_columns(frame.columns)),
        "target_columns": list(label_map.values()),
        "trade_date_min": str(frame["trade_date"].min()),
        "trade_date_max": str(frame["trade_date"].max()),
    }


def _split_temporal(
    frame: pd.DataFrame,
    *,
    label: str,
    horizon: int,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict[str, object]]:
    sort_column = "bucket_ts" if "bucket_ts" in frame.columns else "trade_date"
    model_columns = ["trade_date", *feature_columns(frame.columns), label]
    if sort_column not in model_columns:
        model_columns.insert(1, sort_column)

    clean = frame[model_columns].copy()
    clean = clean.sort_values(sort_column).reset_index(drop=True)
    clean[label] = pd.to_numeric(clean[label], errors="coerce")
    if int(clean[label].notna().sum()) == 0:
        raise TrainingContractError(f"{label} has no numeric values after coercion")
    clean = clean.dropna(subset=[label])
    numeric_cols = [column for column in model_columns if column not in {"trade_date", sort_column, label}]
    for column in numeric_cols:
        clean[column] = pd.to_numeric(clean[column], errors="coerce")
    clean = clean.dropna(axis=1, how="all")
    clean = clean.dropna(
        subset=[column for column in clean.columns if column not in {"trade_date", sort_column, label}],
        how="all",
    )

    n_rows = len(clean)
    min_holdout = max(horizon * 2, 180)
    test_rows = min(max(int(n_rows * 0.15), min_holdout), max(1, n_rows // 4))
    val_rows = min(max(int(n_rows * 0.15), min_holdout), max(1, n_rows // 4))
    embargo = horizon
    train_end = n_rows - val_rows - test_rows - (embargo * 2)
    val_start = train_end + embargo
    val_end = val_start + val_rows
    test_start = val_end + embargo

    if train_end <= 500 or test_start >= n_rows:
        raise TrainingContractError(
            f"not enough rows for temporal split: rows={n_rows}, horizon={horizon}, train_end={train_end}, test_start={test_start}"
        )

    drop_columns = ["trade_date"]
    if sort_column != "trade_date":
        drop_columns.append(sort_column)
    train = clean.iloc[:train_end].drop(columns=drop_columns).copy()
    val = clean.iloc[val_start:val_end].drop(columns=drop_columns)
    test = clean.iloc[test_start:].drop(columns=drop_columns)
    for split_name, split_frame in (("train", train), ("validation", val), ("test", test)):
        if not pd.api.types.is_numeric_dtype(split_frame[label]):
            raise TrainingContractError(
                f"{label} is not numeric in {split_name} split: dtype={split_frame[label].dtype}"
            )
        unsafe_features = [
            column
            for column in split_frame.columns
            if column != label and not pd.api.types.is_numeric_dtype(split_frame[column])
        ]
        if unsafe_features:
            preview = ", ".join(unsafe_features[:10])
            raise TrainingContractError(
                f"non-numeric feature columns in {split_name} split before AutoGluon fit: {preview}"
            )

    meta = {
        "rows": n_rows,
        "horizon_days": horizon,
        "label": label,
        "embargo_rows": embargo,
        "train_rows": int(len(train)),
        "validation_rows": int(len(val)),
        "test_rows": int(len(test)),
        "split_axis": sort_column,
        "train_start": str(clean[sort_column].iloc[0]),
        "train_end": str(clean[sort_column].iloc[train_end - 1]),
        "validation_start": str(clean[sort_column].iloc[val_start]),
        "validation_end": str(clean[sort_column].iloc[val_end - 1]),
        "test_start": str(clean[sort_column].iloc[test_start]),
        "test_end": str(clean[sort_column].iloc[-1]),
        "feature_count": int(len([column for column in train.columns if column != label])),
    }
    return train, val, test, meta


def _train_one_horizon(
    frame: pd.DataFrame,
    *,
    horizon: int,
    label: str,
    target_mode: str,
    run_id: str,
    presets: str,
    time_limit: int,
    num_cpus: int,
    min_directional_accuracy: float,
    model_selection_mode: str,
    included_model_types: list[str],
    excluded_model_types: list[str],
    num_bag_folds: int,
    num_stack_levels: int,
) -> dict[str, object]:
    from autogluon.tabular import TabularPredictor

    train, val, test, split_meta = _split_temporal(frame, label=label, horizon=horizon)
    output_dir = model_artifact_dir(run_id).joinpath(f"horizon_{horizon}d")
    output_dir.mkdir(parents=True, exist_ok=False)

    predictor = TabularPredictor(
        label=label,
        problem_type="regression",
        eval_metric="mae",
        path=str(output_dir),
        verbosity=2,
        log_to_file=True,
    )
    fit_kwargs: dict[str, object] = {
        "train_data": train,
        "tuning_data": val,
        "presets": presets,
        "time_limit": time_limit,
        "num_cpus": num_cpus,
        "ag_args_fit": {"num_gpus": 0},
    }
    if included_model_types:
        fit_kwargs["included_model_types"] = included_model_types
    if excluded_model_types:
        fit_kwargs["excluded_model_types"] = excluded_model_types
    if num_bag_folds >= 2:
        fit_kwargs["num_bag_folds"] = num_bag_folds
        fit_kwargs["num_stack_levels"] = num_stack_levels
        fit_kwargs["use_bag_holdout"] = True
    predictor.fit(**fit_kwargs)

    leaderboard = predictor.leaderboard(test, silent=True)
    leaderboard_path = output_dir.joinpath("leaderboard.csv")
    leaderboard.to_csv(leaderboard_path, index=False)

    importance = predictor.feature_importance(data=test, num_shuffle_sets=5)
    importance_path = output_dir.joinpath("feature_importance.csv")
    importance.to_csv(importance_path)

    predictions = predictor.predict(test.drop(columns=[label]))
    mae = float((predictions - test[label]).abs().mean())
    if target_mode == "returns":
        naive_mae = float(test[label].abs().mean())
    elif "close" in test.columns:
        naive_mae = float((pd.to_numeric(test["close"], errors="coerce") - test[label]).abs().mean())
    else:
        naive_mae = float((test[label].shift(1).fillna(test[label].iloc[0]) - test[label]).abs().mean())

    if target_mode == "returns":
        predicted_direction = pd.Series(predictions).astype(float).apply(lambda x: 1 if x > 0 else (-1 if x < 0 else 0))
        actual_direction = pd.to_numeric(test[label], errors="coerce").apply(lambda x: 1 if x > 0 else (-1 if x < 0 else 0))
    else:
        if "close" in test.columns:
            baseline = pd.to_numeric(test["close"], errors="coerce")
        else:
            baseline = pd.to_numeric(test[label], errors="coerce").shift(1).fillna(pd.to_numeric(test[label], errors="coerce").iloc[0])
        predicted_direction = (pd.Series(predictions).astype(float) - baseline).apply(lambda x: 1 if x > 0 else (-1 if x < 0 else 0))
        actual_direction = (pd.to_numeric(test[label], errors="coerce") - baseline).apply(lambda x: 1 if x > 0 else (-1 if x < 0 else 0))

    direction_pairs = pd.DataFrame({"pred": predicted_direction, "actual": actual_direction}).dropna()
    directional_accuracy = float((direction_pairs["pred"] == direction_pairs["actual"]).mean()) if not direction_pairs.empty else 0.0
    passes_accuracy_threshold = directional_accuracy >= min_directional_accuracy

    summary = {
        "horizon_days": horizon,
        "label": label,
        "eval_metric": "mae",
        "target_mode": target_mode,
        "model_selection_mode": model_selection_mode,
        "included_model_types": included_model_types,
        "excluded_model_types": excluded_model_types,
        "mae": mae,
        "naive_mae": naive_mae,
        "beats_naive": mae < naive_mae,
        "directional_accuracy": directional_accuracy,
        "min_directional_accuracy": min_directional_accuracy,
        "passes_accuracy_threshold": passes_accuracy_threshold,
        "model_path": str(output_dir),
        "leaderboard_path": str(leaderboard_path),
        "feature_importance_path": str(importance_path),
        "split": split_meta,
    }
    output_dir.joinpath("summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    return summary


def run(*, dry_run: bool = False, approved: bool = False) -> dict[str, object]:
    readiness = run_training_readiness(dry_run=dry_run)
    cfg = load_config()
    target_mode = os.getenv("AUTOGLUON_TARGET_MODE", "price").strip().lower() or "price"
    min_directional_accuracy = _parse_float_env("AUTOGLUON_MIN_DIRECTIONAL_ACCURACY", LOCKED_MIN_DIRECTIONAL_ACCURACY)
    labels = [TARGET_TEMPLATE.format(h=horizon) for horizon in HORIZONS]
    run_id = f"{cfg.model_version}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid4().hex[:8]}"
    runtime_guard = _resolve_runtime_guard(dry_run=dry_run)
    num_cpus = _resolve_num_cpus()
    runtime_thread_guard = _apply_runtime_thread_guard(num_cpus=num_cpus)
    openmp_runtime = _resolve_openmp_runtime()
    allow_multiple_openmp = os.getenv("AUTOGLUON_ALLOW_MULTIPLE_OPENMP", "0").strip() == "1"
    strict_openmp_guard = os.getenv("AUTOGLUON_STRICT_OPENMP_GUARD", "0").strip() == "1"
    (
        time_limit,
        presets,
        num_bag_folds,
        num_stack_levels,
        model_selection_mode,
        included_model_types,
        excluded_model_types,
        available_full_zoo,
        training_source,
        contract_lock_enforced,
        model_selection_lock_enforced,
    ) = _resolve_training_contract()
    single_matrix_contract = training_source != "local_postgres_panel"
    if training_source == "parquet_artifacts":
        matrix_source_ref = str(matrix_path())
    elif training_source == "local_postgres_panel":
        matrix_source_ref = "local_postgres.training.matrix_panel_1h"
    else:
        matrix_source_ref = "local_postgres.training.matrix_1d"
    if num_stack_levels > 0 and num_bag_folds < 2:
        raise TrainingContractError("AUTOGLUON_NUM_STACK_LEVELS requires AUTOGLUON_NUM_BAG_FOLDS >= 2")
    if target_mode not in {"price", "returns"}:
        raise TrainingContractError("AUTOGLUON_TARGET_MODE must be 'price' or 'returns'")
    if min_directional_accuracy <= 0 or min_directional_accuracy > 1:
        raise TrainingContractError("AUTOGLUON_MIN_DIRECTIONAL_ACCURACY must be in (0, 1]")
    if (
        not dry_run
        and openmp_runtime.get("detected", False)
        and int(openmp_runtime.get("openmp_library_count", 0)) > 1
        and (
            bool(runtime_guard.get("requires_safe_runtime", False))
            or strict_openmp_guard
        )
        and not allow_multiple_openmp
    ):
        raise TrainingContractError(
            "Multiple OpenMP runtimes detected in process. "
            + f"libraries={openmp_runtime.get('openmp_libraries', [])}. "
            + "This is a known crash risk for full-zoo runs. Align libraries to one OpenMP runtime "
            + "or set AUTOGLUON_ALLOW_MULTIPLE_OPENMP=1 for explicit risk override."
        )

    if dry_run:
        frame_status: dict[str, object]
        try:
            frame_status = _dry_run_training_frame_status(
                target_mode=target_mode,
                training_source=training_source,
            )
        except Exception as exc:
            frame_status = {"training_source_check": "blocked", "error": str(exc)}

        return {
            "phase": "train",
            "dry_run": True,
            "approved": approved,
            "readiness": readiness,
            "training_frame": frame_status,
            "labels": labels,
            "target_mode": target_mode,
            "model_run_id_example": run_id,
            "presets": presets,
            "time_limit_seconds": time_limit,
            "num_cpus": num_cpus,
            "num_bag_folds": num_bag_folds,
            "num_stack_levels": num_stack_levels,
            "model_selection_mode": model_selection_mode,
            "training_source": training_source,
            "included_model_types": included_model_types,
            "excluded_model_types": excluded_model_types,
            "available_full_zoo_model_types": available_full_zoo,
            "contract_lock_enforced": contract_lock_enforced,
            "model_selection_lock_enforced": model_selection_lock_enforced,
            "min_directional_accuracy": min_directional_accuracy,
            "runtime_guard": runtime_guard,
            "runtime_thread_guard": runtime_thread_guard,
            "openmp_runtime": openmp_runtime,
            "allow_multiple_openmp": allow_multiple_openmp,
            "strict_openmp_guard": strict_openmp_guard,
            "writes": [str(model_artifact_dir(run_id)), str(training_runs_path())],
            "cloud_writes": [],
            "single_matrix_training_contract": single_matrix_contract,
            "status": "dry-run",
        }

    if not approved:
        raise TrainingApprovalError(
            "Training requires explicit approval. Use dry-run or pass approved=True."
        )
    if not readiness.get("ready", False):
        blockers = readiness.get("blockers", [])
        lines = "\n".join(f"- {item}" for item in blockers)
        raise TrainingReadinessError(
            "Training readiness gate failed. Resolve blockers before running train:\n" + lines
        )
    if time_limit <= 0:
        raise TrainingContractError("AUTOGLUON_TIME_LIMIT_SECONDS must be > 0")

    frame, label_map = _load_training_frame(target_mode=target_mode, training_source=training_source)
    run_dir = model_artifact_dir(run_id)
    run_dir.mkdir(parents=True, exist_ok=False)
    started_at = datetime.now(timezone.utc).isoformat()

    summaries = [
        _train_one_horizon(
            frame,
            horizon=horizon,
            label=label_map[horizon],
            target_mode=target_mode,
            run_id=run_id,
            presets=presets,
            time_limit=time_limit,
            num_cpus=num_cpus,
            min_directional_accuracy=min_directional_accuracy,
            model_selection_mode=model_selection_mode,
            included_model_types=included_model_types,
            excluded_model_types=excluded_model_types,
            num_bag_folds=num_bag_folds,
            num_stack_levels=num_stack_levels,
        )
        for horizon in HORIZONS
    ]
    failed_accuracy = [item for item in summaries if not item.get("passes_accuracy_threshold", False)]
    accuracy_gate_passed = len(failed_accuracy) == 0
    run_status = "ok" if accuracy_gate_passed else "accuracy-blocked"

    run_record = {
        "run_id": run_id,
        "model_version": cfg.model_version,
        "started_at": started_at,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "git_sha": _git_sha(),
        "matrix_path": matrix_source_ref,
        "signals_path": "not_used_single_matrix_contract",
        "model_artifact_dir": str(run_dir),
        "presets": presets,
        "time_limit_seconds": time_limit,
        "num_cpus": num_cpus,
        "target_mode": target_mode,
        "num_bag_folds": num_bag_folds,
        "num_stack_levels": num_stack_levels,
        "model_selection_mode": model_selection_mode,
        "training_source": training_source,
        "included_model_types": included_model_types,
        "excluded_model_types": excluded_model_types,
        "contract_lock_enforced": contract_lock_enforced,
        "model_selection_lock_enforced": model_selection_lock_enforced,
        "min_directional_accuracy": min_directional_accuracy,
        "accuracy_gate_passed": accuracy_gate_passed,
        "failed_accuracy_horizons": [item["horizon_days"] for item in failed_accuracy],
        "runtime_guard": runtime_guard,
        "runtime_thread_guard": runtime_thread_guard,
        "openmp_runtime": openmp_runtime,
        "allow_multiple_openmp": allow_multiple_openmp,
        "strict_openmp_guard": strict_openmp_guard,
        "status": run_status,
        "horizons": summaries,
        "pip_freeze": _pip_freeze(),
        "single_matrix_training_contract": single_matrix_contract,
    }
    run_dir.joinpath("training_run.json").write_text(json.dumps(run_record, indent=2, sort_keys=True), encoding="utf-8")

    run_history_row = {
        "run_id": run_id,
        "model_version": cfg.model_version,
        "started_at": run_record["started_at"],
        "finished_at": run_record["finished_at"],
        "git_sha": run_record["git_sha"],
        "matrix_path": run_record["matrix_path"],
        "signals_path": run_record["signals_path"],
        "model_artifact_dir": run_record["model_artifact_dir"],
        "presets": presets,
        "time_limit_seconds": time_limit,
        "num_cpus": num_cpus,
        "target_mode": target_mode,
        "num_bag_folds": num_bag_folds,
        "num_stack_levels": num_stack_levels,
        "model_selection_mode": model_selection_mode,
        "training_source": training_source,
        "included_model_types": json.dumps(included_model_types, separators=(",", ":")),
        "excluded_model_types": json.dumps(excluded_model_types, separators=(",", ":")),
        "contract_lock_enforced": contract_lock_enforced,
        "model_selection_lock_enforced": model_selection_lock_enforced,
        "min_directional_accuracy": min_directional_accuracy,
        "accuracy_gate_passed": accuracy_gate_passed,
        "failed_accuracy_horizons": json.dumps(
            [item["horizon_days"] for item in failed_accuracy], separators=(",", ":")
        ),
        "status": run_status,
        "horizons": json.dumps(summaries, separators=(",", ":"), sort_keys=True),
    }
    existing = pd.read_parquet(training_runs_path()) if training_runs_path().exists() else pd.DataFrame()
    updated = pd.concat([existing, pd.DataFrame([run_history_row])], ignore_index=True)
    write_parquet(updated, training_runs_path())
    if not accuracy_gate_passed:
        details = ", ".join(
            [
                f"{item['horizon_days']}d={item['directional_accuracy']:.3f}"
                for item in failed_accuracy
            ]
        )
        raise TrainingContractError(
            "Directional accuracy gate failed. "
            + f"minimum={min_directional_accuracy:.3f}, failed={details}. "
            + "Artifacts and run metadata were saved for forensic review."
        )

    return {
        "phase": "train",
        "dry_run": False,
        "approved": approved,
        "readiness": readiness,
        "run_id": run_id,
        "writes": [str(run_dir), str(training_runs_path())],
        "cloud_writes": [],
        "status": run_status,
        "runtime_guard": runtime_guard,
        "runtime_thread_guard": runtime_thread_guard,
        "openmp_runtime": openmp_runtime,
        "allow_multiple_openmp": allow_multiple_openmp,
        "strict_openmp_guard": strict_openmp_guard,
        "num_cpus": num_cpus,
        "model_selection_mode": model_selection_mode,
        "training_source": training_source,
        "included_model_types": included_model_types,
        "excluded_model_types": excluded_model_types,
        "available_full_zoo_model_types": available_full_zoo,
        "min_directional_accuracy": min_directional_accuracy,
        "accuracy_gate_passed": accuracy_gate_passed,
        "single_matrix_training_contract": single_matrix_contract,
        "horizons": summaries,
    }
