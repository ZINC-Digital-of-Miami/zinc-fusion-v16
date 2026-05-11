from __future__ import annotations

from decimal import Decimal
from typing import Any

import pandas as pd
import psycopg2

from .artifacts import feature_columns, matrix_path, target_columns, write_parquet
from .config import HORIZONS, TARGET_TEMPLATE, resolve_cloud_db_url


_MATRIX_SQL = """
WITH
zl AS (
  SELECT
    bucket_ts::date AS trade_date,
    open::numeric AS open,
    high::numeric AS high,
    low::numeric AS low,
    close::numeric AS close,
    volume::numeric AS volume
  FROM mkt.price_1d
  WHERE symbol = 'ZL'
),
zs AS (
  SELECT bucket_ts::date AS trade_date, close::numeric AS close
  FROM mkt.price_1d
  WHERE symbol = 'ZS'
),
zm AS (
  SELECT bucket_ts::date AS trade_date, close::numeric AS close
  FROM mkt.price_1d
  WHERE symbol = 'ZM'
),
cl AS (
  SELECT bucket_ts::date AS trade_date, close::numeric AS close
  FROM mkt.price_1d
  WHERE symbol = 'CL'
),
joined AS (
  SELECT
    z.trade_date,
    z.open,
    z.high,
    z.low,
    z.close,
    z.volume,
    zs.close AS zs_close,
    zm.close AS zm_close,
    cl.close AS cl_close
  FROM zl z
  LEFT JOIN zs USING (trade_date)
  LEFT JOIN zm USING (trade_date)
  LEFT JOIN cl USING (trade_date)
),
features AS (
  SELECT
    trade_date,
    open,
    high,
    low,
    close,
    volume,
    zs_close,
    zm_close,
    cl_close,
    (close / NULLIF(LAG(close, 1) OVER (ORDER BY trade_date), 0)) - 1 AS ret_1d,
    (close / NULLIF(LAG(close, 5) OVER (ORDER BY trade_date), 0)) - 1 AS ret_5d,
    (close / NULLIF(LAG(close, 10) OVER (ORDER BY trade_date), 0)) - 1 AS ret_10d,
    (close / NULLIF(LAG(close, 20) OVER (ORDER BY trade_date), 0)) - 1 AS ret_20d,
    (close / NULLIF(LAG(close, 30) OVER (ORDER BY trade_date), 0)) - 1 AS ret_30d,
    (close / NULLIF(LAG(close, 60) OVER (ORDER BY trade_date), 0)) - 1 AS ret_60d,
    (close / NULLIF(LAG(close, 90) OVER (ORDER BY trade_date), 0)) - 1 AS ret_90d,
    (close / NULLIF(LAG(close, 180) OVER (ORDER BY trade_date), 0)) - 1 AS ret_180d,
    (volume / NULLIF(LAG(volume, 1) OVER (ORDER BY trade_date), 0)) - 1 AS vol_chg_1d,
    (volume / NULLIF(LAG(volume, 5) OVER (ORDER BY trade_date), 0)) - 1 AS vol_chg_5d,
    AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 49 PRECEDING AND CURRENT ROW) AS ma_50,
    AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 99 PRECEDING AND CURRENT ROW) AS ma_100,
    AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 199 PRECEDING AND CURRENT ROW) AS ma_200,
    STDDEV_SAMP(close) OVER (ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS std_20,
    STDDEV_SAMP(close) OVER (ORDER BY trade_date ROWS BETWEEN 59 PRECEDING AND CURRENT ROW) AS std_60,
    close - AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS mean_revert_20,
    close - AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 49 PRECEDING AND CURRENT ROW) AS mean_revert_50,
    close - COALESCE(zs_close, close) AS spread_zl_zs,
    close - COALESCE(zm_close, close) AS spread_zl_zm,
    close - COALESCE(cl_close, close) AS spread_zl_cl,
    close / NULLIF(zs_close, 0) AS ratio_zl_zs,
    close / NULLIF(zm_close, 0) AS ratio_zl_zm,
    close / NULLIF(cl_close, 0) AS ratio_zl_cl,
    CASE
      WHEN zs_close IS NULL OR zm_close IS NULL THEN NULL
      ELSE (0.022 * zm_close) + (11.0 * (close / 100.0)) - (zs_close / 100.0)
    END AS crush_margin_board,
    CASE
      WHEN zs_close IS NULL OR zm_close IS NULL THEN NULL
      ELSE (
        (
          (0.022 * zm_close) + (11.0 * (close / 100.0)) - (zs_close / 100.0)
        ) - LAG((0.022 * zm_close) + (11.0 * (close / 100.0)) - (zs_close / 100.0), 20) OVER (ORDER BY trade_date)
      )
    END AS crush_margin_chg_20d,
    CASE
      WHEN zs_close IS NULL OR zm_close IS NULL THEN NULL
      ELSE ((11.0 * (close / 100.0)) / NULLIF((0.022 * zm_close) + (11.0 * (close / 100.0)), 0)) * 100.0
    END AS crush_oil_share_pct,
    LEAD(close, 30) OVER (ORDER BY trade_date) AS target_price_30d,
    LEAD(close, 90) OVER (ORDER BY trade_date) AS target_price_90d,
    LEAD(close, 180) OVER (ORDER BY trade_date) AS target_price_180d
  FROM joined
)
SELECT *
FROM features
WHERE ret_1d IS NOT NULL
  AND ret_5d IS NOT NULL
  AND ret_10d IS NOT NULL
  AND ret_20d IS NOT NULL
  AND ret_30d IS NOT NULL
  AND ret_60d IS NOT NULL
  AND ret_90d IS NOT NULL
  AND ret_180d IS NOT NULL
  AND ma_50 IS NOT NULL
  AND ma_100 IS NOT NULL
  AND ma_200 IS NOT NULL
  AND std_20 IS NOT NULL
  AND std_60 IS NOT NULL
ORDER BY trade_date;
"""


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    return float(value)


def _normalize_matrix(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        raise RuntimeError("matrix build returned 0 rows")

    df = df.copy()
    df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.date

    for column in df.columns:
        if column == "trade_date":
            continue
        df[column] = df[column].map(_to_float).astype("float64")

    expected_targets = [TARGET_TEMPLATE.format(h=h) for h in HORIZONS]
    missing_targets = [column for column in expected_targets if column not in df.columns]
    if missing_targets:
        raise RuntimeError(f"matrix is missing target columns: {', '.join(missing_targets)}")

    feature_cols = feature_columns(df.columns)
    label_cols = target_columns(df.columns)
    if not feature_cols:
        raise RuntimeError("matrix has no non-target feature columns")
    return df[["trade_date", *feature_cols, *label_cols]]


def run(*, dry_run: bool = False) -> dict[str, object]:
    output_path = matrix_path()
    if dry_run:
        return {
            "phase": "matrix",
            "dry_run": True,
            "reads": ["mkt.price_1d"],
            "writes": [str(output_path)],
            "cloud_writes": [],
            "status": "dry-run",
        }

    db_url = resolve_cloud_db_url()
    if not db_url:
        raise RuntimeError(
            "Cloud DB URL is not set. Configure DATABASE_URL, SUPABASE_DB_URL, POSTGRES_URL_NON_POOLING, or SUPABASE_POOLER_URL."
        )

    with psycopg2.connect(db_url, connect_timeout=10, application_name="fusion_build_matrix") as conn:
        df = pd.read_sql_query(_MATRIX_SQL, conn)

    matrix = _normalize_matrix(df)
    write_parquet(matrix, output_path)

    return {
        "phase": "matrix",
        "dry_run": False,
        "reads": ["mkt.price_1d"],
        "writes": [str(output_path)],
        "cloud_writes": [],
        "status": "ok",
        "rows_written": int(len(matrix)),
        "feature_columns": len(feature_columns(matrix.columns)),
        "target_columns": target_columns(matrix.columns),
        "target_non_null_counts": {
            column: int(matrix[column].notna().sum()) for column in target_columns(matrix.columns)
        },
        "target_null_counts": {
            column: int(matrix[column].isna().sum()) for column in target_columns(matrix.columns)
        },
        "trade_date_min": str(matrix["trade_date"].min()),
        "trade_date_max": str(matrix["trade_date"].max()),
    }
