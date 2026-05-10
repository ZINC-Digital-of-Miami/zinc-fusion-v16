from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Final

SPECIALISTS: Final[list[str]] = [
    "crush",
    "china",
    "fx",
    "fed",
    "tariff",
    "energy",
    "biofuel",
    "palm",
    "volatility",
    "substitutes",
    "trump_effect",
]

HORIZONS: Final[list[int]] = [30, 90, 180]  # 1m, 3m, 6m calendar labels for Chris-facing copy.

TARGET_TEMPLATE: Final[str] = "target_price_{h}d"


@dataclass(frozen=True)
class PipelineConfig:
    supabase_db_url: str | None
    supabase_pooler_url: str | None
    model_version: str
    local_data_dir: Path
    model_artifact_dir: Path


def _first_non_empty(*values: str | None) -> str | None:
    for value in values:
        if value:
            return value
    return None


def load_config() -> PipelineConfig:
    import os

    local_data_dir = Path(os.getenv("FUSION_LOCAL_DATA_DIR", "data/fusion")).expanduser()
    model_artifact_dir = Path(os.getenv("FUSION_MODEL_ARTIFACT_DIR", "models/fusion")).expanduser()

    return PipelineConfig(
        # DATABASE_URL is the canonical local/server DB contract for V16.
        # SUPABASE_DB_URL remains a compatibility alias for existing scripts.
        supabase_db_url=_first_non_empty(
            os.getenv("DATABASE_URL"),
            os.getenv("SUPABASE_DB_URL"),
            # Vercel env pull exposes direct Postgres URL under this key.
            os.getenv("POSTGRES_URL_NON_POOLING"),
        ),
        # Keep compatibility with environments that expose POSTGRES_URL.
        supabase_pooler_url=_first_non_empty(
            os.getenv("SUPABASE_POOLER_URL"),
            os.getenv("POSTGRES_URL"),
        ),
        model_version=os.getenv("MODEL_VERSION", "v16-scaffold"),
        local_data_dir=local_data_dir,
        model_artifact_dir=model_artifact_dir,
    )
