from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from uuid import uuid4

import pandas as pd

from .artifacts import (
    feature_columns,
    matrix_path,
    model_artifact_dir,
    read_parquet,
    signals_path,
    target_columns,
    training_runs_path,
    write_parquet,
)
from .config import HORIZONS, TARGET_TEMPLATE, load_config
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
LOCKED_EXCLUDED_MODEL_TYPES: tuple[str, ...] = ()


def _parse_int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return int(value)


def _parse_excluded_models_env(default: tuple[str, ...]) -> list[str]:
    raw = os.getenv("AUTOGLUON_EXCLUDED_MODEL_TYPES", ",".join(default))
    return [item.strip() for item in raw.split(",") if item.strip()]


def _resolve_training_contract() -> tuple[int, str, int, int, list[str], bool]:
    allow_override = os.getenv("AUTOGLUON_ALLOW_CONTRACT_OVERRIDE", "0").strip() == "1"
    requested_time_limit = _parse_int_env("AUTOGLUON_TIME_LIMIT_SECONDS", LOCKED_TIME_LIMIT_SECONDS)
    requested_presets = os.getenv("AUTOGLUON_PRESETS", LOCKED_PRESET)
    requested_num_bag_folds = _parse_int_env("AUTOGLUON_NUM_BAG_FOLDS", LOCKED_NUM_BAG_FOLDS)
    requested_num_stack_levels = _parse_int_env("AUTOGLUON_NUM_STACK_LEVELS", LOCKED_NUM_STACK_LEVELS)
    requested_excluded_model_types = _parse_excluded_models_env(LOCKED_EXCLUDED_MODEL_TYPES)

    if allow_override:
        return (
            requested_time_limit,
            requested_presets,
            requested_num_bag_folds,
            requested_num_stack_levels,
            requested_excluded_model_types,
            False,
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
    if requested_excluded_model_types != list(LOCKED_EXCLUDED_MODEL_TYPES):
        conflicts.append(
            "AUTOGLUON_EXCLUDED_MODEL_TYPES="
            f"{requested_excluded_model_types} (locked={list(LOCKED_EXCLUDED_MODEL_TYPES)})"
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
        list(LOCKED_EXCLUDED_MODEL_TYPES),
        True,
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


def _load_training_frame(*, target_mode: str) -> tuple[pd.DataFrame, dict[int, str]]:
    matrix = read_parquet(matrix_path())
    signals = read_parquet(signals_path())
    if matrix.empty:
        raise TrainingContractError("matrix artifact is empty")
    if signals.empty:
        raise TrainingContractError("specialist signals artifact is empty")

    labels = target_columns(matrix.columns)
    expected_labels = [TARGET_TEMPLATE.format(h=h) for h in HORIZONS]
    if labels != expected_labels:
        missing = [label for label in expected_labels if label not in labels]
        extra = [label for label in labels if label not in expected_labels]
        raise TrainingContractError(f"unexpected target labels. missing={missing}, extra={extra}")

    frame = matrix.merge(signals, on="trade_date", how="inner")
    frame = frame.sort_values("trade_date").reset_index(drop=True)
    if frame.empty:
        raise TrainingContractError("matrix and specialist signals have no aligned trade dates")
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


def _split_temporal(
    frame: pd.DataFrame,
    *,
    label: str,
    horizon: int,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.Series, dict[str, object]]:
    model_columns = ["trade_date", *feature_columns(frame.columns), label]
    clean = frame[model_columns].dropna(subset=[label]).copy()
    numeric_cols = [column for column in model_columns if column not in {"trade_date", label}]
    for column in numeric_cols:
        clean[column] = pd.to_numeric(clean[column], errors="coerce")
    clean = clean.dropna(axis=1, how="all")
    clean = clean.dropna(subset=[column for column in clean.columns if column not in {"trade_date", label}], how="all")

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

    train_slice = clean.iloc[:train_end].copy()
    train_groups = pd.to_datetime(train_slice["trade_date"], errors="coerce").dt.to_period("M").astype(str)
    train = train_slice.drop(columns=["trade_date"])
    val = clean.iloc[val_start:val_end].drop(columns=["trade_date"])
    test = clean.iloc[test_start:].drop(columns=["trade_date"])

    meta = {
        "rows": n_rows,
        "horizon_days": horizon,
        "label": label,
        "embargo_rows": embargo,
        "train_rows": int(len(train)),
        "validation_rows": int(len(val)),
        "test_rows": int(len(test)),
        "train_start": str(clean["trade_date"].iloc[0]),
        "train_end": str(clean["trade_date"].iloc[train_end - 1]),
        "validation_start": str(clean["trade_date"].iloc[val_start]),
        "validation_end": str(clean["trade_date"].iloc[val_end - 1]),
        "test_start": str(clean["trade_date"].iloc[test_start]),
        "test_end": str(clean["trade_date"].iloc[-1]),
        "feature_count": int(len([column for column in train.columns if column != label])),
    }
    return train, val, test, train_groups, meta


def _train_one_horizon(
    frame: pd.DataFrame,
    *,
    horizon: int,
    label: str,
    target_mode: str,
    run_id: str,
    presets: str,
    time_limit: int,
    excluded_model_types: list[str],
    num_bag_folds: int,
    num_stack_levels: int,
) -> dict[str, object]:
    from autogluon.tabular import TabularPredictor

    train, val, test, train_groups, split_meta = _split_temporal(frame, label=label, horizon=horizon)
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
        "excluded_model_types": excluded_model_types,
        "ag_args_fit": {"num_gpus": 0},
    }
    if num_bag_folds >= 2:
        fit_kwargs["num_bag_folds"] = num_bag_folds
        fit_kwargs["num_stack_levels"] = num_stack_levels
        fit_kwargs["groups"] = train_groups
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

    summary = {
        "horizon_days": horizon,
        "label": label,
        "eval_metric": "mae",
        "target_mode": target_mode,
        "mae": mae,
        "naive_mae": naive_mae,
        "beats_naive": mae < naive_mae,
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
    labels = [TARGET_TEMPLATE.format(h=horizon) for horizon in HORIZONS]
    run_id = f"{cfg.model_version}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid4().hex[:8]}"
    (
        time_limit,
        presets,
        num_bag_folds,
        num_stack_levels,
        excluded_model_types,
        contract_lock_enforced,
    ) = _resolve_training_contract()
    if num_stack_levels > 0 and num_bag_folds < 2:
        raise TrainingContractError("AUTOGLUON_NUM_STACK_LEVELS requires AUTOGLUON_NUM_BAG_FOLDS >= 2")
    if target_mode not in {"price", "returns"}:
        raise TrainingContractError("AUTOGLUON_TARGET_MODE must be 'price' or 'returns'")

    if dry_run:
        frame_status: dict[str, object]
        try:
            frame, label_map = _load_training_frame(target_mode=target_mode)
            frame_status = {
                "rows": int(len(frame)),
                "feature_columns": len(feature_columns(frame.columns)),
                "target_columns": list(label_map.values()),
                "trade_date_min": str(frame["trade_date"].min()),
                "trade_date_max": str(frame["trade_date"].max()),
            }
        except Exception as exc:
            frame_status = {"artifact_check": "blocked", "error": str(exc)}

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
            "num_bag_folds": num_bag_folds,
            "num_stack_levels": num_stack_levels,
            "excluded_model_types": excluded_model_types,
            "contract_lock_enforced": contract_lock_enforced,
            "writes": [str(model_artifact_dir(run_id)), str(training_runs_path())],
            "cloud_writes": [],
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

    frame, label_map = _load_training_frame(target_mode=target_mode)
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
            excluded_model_types=excluded_model_types,
            num_bag_folds=num_bag_folds,
            num_stack_levels=num_stack_levels,
        )
        for horizon in HORIZONS
    ]

    run_record = {
        "run_id": run_id,
        "model_version": cfg.model_version,
        "started_at": started_at,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "git_sha": _git_sha(),
        "matrix_path": str(matrix_path()),
        "signals_path": str(signals_path()),
        "model_artifact_dir": str(run_dir),
        "presets": presets,
        "time_limit_seconds": time_limit,
        "target_mode": target_mode,
        "num_bag_folds": num_bag_folds,
        "num_stack_levels": num_stack_levels,
        "excluded_model_types": excluded_model_types,
        "contract_lock_enforced": contract_lock_enforced,
        "horizons": summaries,
        "pip_freeze": _pip_freeze(),
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
        "target_mode": target_mode,
        "num_bag_folds": num_bag_folds,
        "num_stack_levels": num_stack_levels,
        "excluded_model_types": json.dumps(excluded_model_types, separators=(",", ":")),
        "contract_lock_enforced": contract_lock_enforced,
        "horizons": json.dumps(summaries, separators=(",", ":"), sort_keys=True),
    }
    existing = pd.read_parquet(training_runs_path()) if training_runs_path().exists() else pd.DataFrame()
    updated = pd.concat([existing, pd.DataFrame([run_history_row])], ignore_index=True)
    write_parquet(updated, training_runs_path())

    return {
        "phase": "train",
        "dry_run": False,
        "approved": approved,
        "readiness": readiness,
        "run_id": run_id,
        "writes": [str(run_dir), str(training_runs_path())],
        "cloud_writes": [],
        "status": "ok",
        "horizons": summaries,
    }
