from __future__ import annotations

import argparse
import glob
import json
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values


DEFAULT_LOCAL_DB_URL = "postgresql://zincdigital@localhost:5432/fusion"
DEFAULT_GLBX_DIR = Path("Data/GLBX-20260508-4HPF5RCNKG")
DEFAULT_FILE_GLOB = "*.ohlcv-1d.csv"

_OPTION_SYMBOL_RE = re.compile(r"^(?P<contract>[A-Z]+[FGHJKMNQUVXZ]\d{1,2}) (?P<option_type>[CP])(?P<strike>\d+)$")
_ROOT_RE = re.compile(r"^(?P<root>[A-Z]+)[FGHJKMNQUVXZ]\d{1,2}$")


class LocalOptionsLoadError(RuntimeError):
    pass


@dataclass(frozen=True)
class LocalOptionsLoadSummary:
    files_scanned: int
    files_with_options: int
    input_rows_total: int
    option_rows_total: int
    trade_date_min: str | None
    trade_date_max: str | None
    roots: list[str]


def _validate_local_db_url(db_url: str) -> None:
    parsed = urlparse(db_url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise LocalOptionsLoadError(f"db url must be postgres/postgresql, got: {parsed.scheme!r}")
    host = (parsed.hostname or "").lower()
    if host not in {"localhost", "127.0.0.1", "::1"}:
        raise LocalOptionsLoadError("local loader is hard-locked to localhost. refusing non-local host")
    db_name = (parsed.path or "").lstrip("/")
    if db_name != "fusion":
        raise LocalOptionsLoadError(f"local loader expects database 'fusion'. got: {db_name or '<empty>'}")


def _fmt_price(value: object) -> str | None:
    numeric = pd.to_numeric(value, errors="coerce")
    if pd.isna(numeric):
        return None
    return f"{float(numeric):.9f}"


def _load_single_file(path: Path) -> tuple[list[tuple[object, ...]], int, int, set[str], str | None, str | None]:
    frame = pd.read_csv(
        path,
        usecols=["ts_event", "symbol", "open", "high", "low", "close", "volume"],
    )
    input_rows = int(len(frame))
    if frame.empty:
        return [], input_rows, 0, set(), None, None

    parsed = frame["symbol"].astype(str).str.extract(_OPTION_SYMBOL_RE)
    mask = parsed["contract"].notna()
    if int(mask.sum()) == 0:
        return [], input_rows, 0, set(), None, None

    options = frame.loc[mask].copy()
    parsed = parsed.loc[mask].copy()

    trade_dates = pd.to_datetime(options["ts_event"], errors="coerce", utc=True).dt.date
    valid_date_mask = trade_dates.notna()
    if int(valid_date_mask.sum()) == 0:
        return [], input_rows, 0, set(), None, None

    options = options.loc[valid_date_mask].copy()
    parsed = parsed.loc[valid_date_mask].copy()
    trade_dates = trade_dates.loc[valid_date_mask]

    roots = parsed["contract"].str.extract(_ROOT_RE, expand=True)["root"]
    roots = roots.fillna("")
    roots_set = {root for root in roots.tolist() if root}

    rows: list[tuple[object, ...]] = []
    for idx in options.index:
        rows.append(
            (
                roots.loc[idx] or None,
                parsed.loc[idx, "contract"],
                trade_dates.loc[idx],
                parsed.loc[idx, "strike"],
                None,  # expiration_date (not available in OHLCV bars)
                parsed.loc[idx, "option_type"],
                _fmt_price(options.loc[idx, "open"]),
                _fmt_price(options.loc[idx, "high"]),
                _fmt_price(options.loc[idx, "low"]),
                _fmt_price(options.loc[idx, "close"]),
                int(pd.to_numeric(options.loc[idx, "volume"], errors="coerce") or 0),
                None,  # open_interest not provided by ohlcv-1d
                None,  # implied_volatility not provided by ohlcv-1d
                None,  # delta not provided by ohlcv-1d
                None,  # gamma not provided by ohlcv-1d
                None,  # theta not provided by ohlcv-1d
                None,  # vega not provided by ohlcv-1d
                "databento_ohlcv_1d_local",
                datetime.now(timezone.utc),
            )
        )

    min_trade_date = str(trade_dates.min())
    max_trade_date = str(trade_dates.max())
    return rows, input_rows, len(rows), roots_set, min_trade_date, max_trade_date


def _ensure_tables(cur: psycopg2.extensions.cursor) -> None:
    cur.execute("CREATE SCHEMA IF NOT EXISTS raw")
    cur.execute("CREATE SCHEMA IF NOT EXISTS ops")
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS raw.databento_options_1d (
          symbol TEXT,
          contract_symbol TEXT,
          as_of_date DATE NOT NULL,
          strike_price TEXT,
          expiration_date TEXT,
          option_type TEXT,
          open TEXT,
          high TEXT,
          low TEXT,
          close TEXT,
          volume BIGINT,
          open_interest DOUBLE PRECISION,
          implied_volatility TEXT,
          delta TEXT,
          gamma TEXT,
          theta TEXT,
          vega TEXT,
          source TEXT,
          ingested_at TIMESTAMP WITHOUT TIME ZONE
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_options_as_of_date ON raw.databento_options_1d (as_of_date)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_options_contract_symbol ON raw.databento_options_1d (contract_symbol)")
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS ops.local_options_load_manifest (
          run_id TEXT PRIMARY KEY,
          loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          db_url TEXT NOT NULL,
          glbx_dir TEXT NOT NULL,
          files_scanned BIGINT NOT NULL,
          files_with_options BIGINT NOT NULL,
          input_rows_total BIGINT NOT NULL,
          option_rows_total BIGINT NOT NULL,
          trade_date_min DATE,
          trade_date_max DATE,
          roots JSONB NOT NULL
        )
        """
    )


def run(
    *,
    db_url: str = DEFAULT_LOCAL_DB_URL,
    glbx_dir: Path = DEFAULT_GLBX_DIR,
    file_glob: str = DEFAULT_FILE_GLOB,
    dry_run: bool = True,
    approved: bool = False,
) -> dict[str, object]:
    _validate_local_db_url(db_url)
    if not glbx_dir.exists():
        raise LocalOptionsLoadError(f"glbx directory not found: {glbx_dir}")

    files = [Path(path) for path in sorted(glob.glob(str(glbx_dir / file_glob)))]
    if not files:
        raise LocalOptionsLoadError(f"no files matched: {glbx_dir / file_glob}")

    files_with_options = 0
    input_rows_total = 0
    option_rows_total = 0
    roots: set[str] = set()
    trade_date_min: str | None = None
    trade_date_max: str | None = None

    # This list is only populated when executing. For dry-run we avoid materializing all rows.
    staged_rows: list[tuple[object, ...]] = []

    for file_path in files:
        rows, input_rows, option_rows, file_roots, file_min, file_max = _load_single_file(file_path)
        input_rows_total += input_rows
        option_rows_total += option_rows
        if option_rows > 0:
            files_with_options += 1
            roots.update(file_roots)
            trade_date_min = file_min if trade_date_min is None or (file_min and file_min < trade_date_min) else trade_date_min
            trade_date_max = file_max if trade_date_max is None or (file_max and file_max > trade_date_max) else trade_date_max
            if not dry_run:
                staged_rows.extend(rows)

    summary = LocalOptionsLoadSummary(
        files_scanned=len(files),
        files_with_options=files_with_options,
        input_rows_total=input_rows_total,
        option_rows_total=option_rows_total,
        trade_date_min=trade_date_min,
        trade_date_max=trade_date_max,
        roots=sorted(roots),
    )

    payload: dict[str, object] = {
        "phase": "local-options-load",
        "dry_run": dry_run,
        "approved": approved,
        "db_url": db_url,
        "glbx_dir": str(glbx_dir),
        "file_glob": file_glob,
        "summary": asdict(summary),
        "status": "dry-run" if dry_run else "pending",
    }

    if dry_run:
        return payload
    if not approved:
        raise LocalOptionsLoadError("options load requires explicit approval. pass approved=True or --execute")
    if option_rows_total <= 0:
        raise LocalOptionsLoadError("no option rows detected in the selected GLBX files")

    run_id = f"local-options-load-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    with psycopg2.connect(db_url, connect_timeout=10, application_name="fusion_load_local_options") as conn:
        with conn.cursor() as cur:
            _ensure_tables(cur)
            cur.execute("TRUNCATE TABLE raw.databento_options_1d")
            execute_values(
                cur,
                """
                INSERT INTO raw.databento_options_1d (
                  symbol, contract_symbol, as_of_date, strike_price, expiration_date, option_type,
                  open, high, low, close, volume, open_interest, implied_volatility, delta, gamma, theta, vega,
                  source, ingested_at
                ) VALUES %s
                """,
                staged_rows,
                page_size=5000,
            )

            cur.execute(
                """
                INSERT INTO ops.local_options_load_manifest (
                  run_id, db_url, glbx_dir, files_scanned, files_with_options,
                  input_rows_total, option_rows_total, trade_date_min, trade_date_max, roots
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s::date, %s::date, %s::jsonb)
                ON CONFLICT (run_id) DO NOTHING
                """,
                (
                    run_id,
                    db_url,
                    str(glbx_dir),
                    summary.files_scanned,
                    summary.files_with_options,
                    summary.input_rows_total,
                    summary.option_rows_total,
                    summary.trade_date_min,
                    summary.trade_date_max,
                    json.dumps(summary.roots, separators=(",", ":")),
                ),
            )

            cur.execute(
                """
                INSERT INTO ops.source_manifest (
                  source_name, source_table, update_frequency, expected_row_count, min_date, max_date,
                  last_validated, health_status, notes
                ) VALUES (
                  'databento_options_local', 'raw.databento_options_1d', 'manual',
                  NULL, %s::date, %s::date, NOW(), 'ok',
                  'Local GLBX ohlcv-1d options reconstruction (price+volume only)'
                )
                ON CONFLICT (source_name) DO UPDATE SET
                  source_table = EXCLUDED.source_table,
                  update_frequency = EXCLUDED.update_frequency,
                  min_date = EXCLUDED.min_date,
                  max_date = EXCLUDED.max_date,
                  last_validated = EXCLUDED.last_validated,
                  health_status = EXCLUDED.health_status,
                  notes = EXCLUDED.notes
                """,
                (summary.trade_date_min, summary.trade_date_max),
            )

    payload["status"] = "ok"
    payload["run_id"] = run_id
    payload["loaded_at"] = datetime.now(timezone.utc).isoformat()
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Load local GLBX options bars into raw.databento_options_1d")
    parser.add_argument("--db-url", default=DEFAULT_LOCAL_DB_URL, help=f"local postgres URL (default: {DEFAULT_LOCAL_DB_URL})")
    parser.add_argument("--glbx-dir", default=str(DEFAULT_GLBX_DIR), help=f"directory containing GLBX CSVs (default: {DEFAULT_GLBX_DIR})")
    parser.add_argument("--file-glob", default=DEFAULT_FILE_GLOB, help=f"glob pattern within --glbx-dir (default: {DEFAULT_FILE_GLOB})")
    parser.add_argument("--execute", action="store_true", help="perform local DB writes")
    args = parser.parse_args()

    result = run(
        db_url=args.db_url,
        glbx_dir=Path(args.glbx_dir),
        file_glob=args.file_glob,
        dry_run=not args.execute,
        approved=args.execute,
    )
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
