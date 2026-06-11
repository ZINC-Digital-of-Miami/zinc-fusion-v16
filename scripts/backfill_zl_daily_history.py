#!/usr/bin/env python3
"""One-time deep backfill of ZL daily serving bars and CFTC COT history.

Sources (locked decisions L1/L2, docs/plans/2026-06-11-data-source-pivot-and
-stabilization-plan.md):
  - financialdata.net commodity-prices ZL — PRIMARY for 2015-09 onward
    (licensed daily EOD settles, same-day current bar).
  - Yahoo v8 chart API ZL=F — deep history only (2000-03 onward) using
    explicit period1/period2 epochs; `range=max` silently downsamples to
    monthly and must never be used.
  - CFTC Socrata 6dca-aqww (legacy futures-only) — full weekly COT history
    for soybean oil (CBOT code 007601), same bias formula as
    scripts/fill_site_with_trusted_data.py.

Writes (only with --execute; default is a dry-run report):
  - mkt.price_1d upserts on (symbol, bucket_ts), symbol 'ZL'
  - mkt.latest_price upsert on (symbol)
  - mkt.cftc_1w upserts on (symbol, observation_date)

ZL=F is a front-month continuous series: roll dates produce price jumps.
Bars are fine for charting; do not compute cross-roll returns from them.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import psycopg2
import requests
from psycopg2.extras import Json, execute_values

ROOT = Path(__file__).resolve().parent.parent
HEADERS = {"User-Agent": "Mozilla/5.0 (zinc-fusion-v16 backfill)"}
YAHOO_ZL_FIRST_TRADE_EPOCH = 953078400  # 2000-03-15


def load_local_env(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'").strip('"'))


def require_env(key: str) -> str:
    value = os.getenv(key)
    if not value:
        raise RuntimeError(f"Missing {key} in environment/.env.local")
    return value


def get_json(url: str, *, timeout: int = 30, attempts: int = 3) -> Any:
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            res = requests.get(url, headers=HEADERS, timeout=timeout)
            res.raise_for_status()
            return res.json()
        except Exception as err:  # noqa: BLE001
            last = err
            time.sleep(0.8 * (attempt + 1))
    # Never echo credentials: the financialdata.net key rides in the query string.
    api_key = os.getenv("FINANCIALDATA_API_KEY") or ""
    sanitized_url = url.replace(api_key, "***") if api_key else url
    sanitized_err = str(last).replace(api_key, "***") if api_key else str(last)
    raise RuntimeError(f"Failed request after {attempts} attempts: {sanitized_url} :: {sanitized_err}")


Bar = tuple[date, float, float, float, float, float]  # date, o, h, l, c, v


def fetch_financialdata_bars(api_key: str) -> dict[date, Bar]:
    bars: dict[date, Bar] = {}
    offset = 0
    while True:
        url = (
            "https://financialdata.net/api/v1/commodity-prices"
            f"?identifier=ZL&offset={offset}&key={api_key}"
        )
        page = get_json(url)
        if isinstance(page, dict):
            raise RuntimeError(f"financialdata.net error response: {json.dumps(page)[:200]}")
        if not isinstance(page, list) or not page:
            break
        before = len(bars)
        for row in page:
            try:
                d = datetime.strptime(str(row["date"]), "%Y-%m-%d").date()
                bar = (
                    d,
                    float(row["open"]),
                    float(row["high"]),
                    float(row["low"]),
                    float(row["close"]),
                    float(row.get("volume") or 0.0),
                )
            except (KeyError, TypeError, ValueError):
                continue
            bars[d] = bar
        if len(bars) == before:
            # Page added no new dates — the API is repeating itself; stop
            # rather than loop forever on a provider that ignores offset.
            break
        offset += len(page)
    if not bars:
        raise RuntimeError(
            "financialdata.net returned zero ZL bars — refusing to proceed "
            "with unvalidated Yahoo-only data (it is the licensed primary)."
        )
    return bars


def fetch_yahoo_bars() -> dict[date, Bar]:
    now_epoch = int(time.time())
    url = (
        "https://query2.finance.yahoo.com/v8/finance/chart/ZL%3DF"
        f"?interval=1d&period1={YAHOO_ZL_FIRST_TRADE_EPOCH}&period2={now_epoch}"
    )
    payload = get_json(url)
    result = payload["chart"]["result"][0]
    granularity = result.get("meta", {}).get("dataGranularity")
    if granularity != "1d":
        raise RuntimeError(f"Yahoo returned granularity {granularity!r}, expected '1d'")
    timestamps = result.get("timestamp") or []
    quote = result["indicators"]["quote"][0]
    bars: dict[date, Bar] = {}
    for i, ts in enumerate(timestamps):
        try:
            o, h, l, c = (
                quote["open"][i],
                quote["high"][i],
                quote["low"][i],
                quote["close"][i],
            )
        except (IndexError, KeyError, TypeError):
            continue
        if any(v is None for v in (o, h, l, c)):
            continue
        d = datetime.fromtimestamp(ts, tz=timezone.utc).date()
        v = quote.get("volume", [None])[i] if i < len(quote.get("volume", [])) else None
        bars[d] = (d, float(o), float(h), float(l), float(c), float(v or 0.0))
    return bars


def fetch_cot_history() -> list[dict[str, Any]]:
    # DESC so the newest reports are always retained if the dataset ever
    # outgrows the limit; 007601 = SOYBEAN OIL - CBOT (same rows as the fill
    # script's commodity_name filter).
    params = {
        "$where": "cftc_contract_market_code='007601'",
        "$order": "report_date_as_yyyy_mm_dd DESC",
        "$limit": "2500",
    }
    url = f"https://publicreporting.cftc.gov/resource/6dca-aqww.json?{urlencode(params)}"
    payload = get_json(url, timeout=60)
    if not isinstance(payload, list):
        raise RuntimeError("CFTC Socrata returned non-list payload")
    rows: list[dict[str, Any]] = []
    for raw in payload:
        obs_raw = raw.get("report_date_as_yyyy_mm_dd")
        if not isinstance(obs_raw, str):
            continue
        try:
            obs = datetime.fromisoformat(obs_raw.replace("Z", "+00:00")).date()
        except ValueError:
            continue

        def num(key: str) -> float:
            try:
                return float(raw.get(key) or 0.0)
            except (TypeError, ValueError):
                return 0.0

        net = num("noncomm_positions_long_all") - num("noncomm_positions_short_all")
        open_interest = num("open_interest_all")
        ratio = (net / open_interest) if open_interest > 0 else 0.0
        bias = "bullish" if ratio >= 0.08 else ("bearish" if ratio <= -0.08 else "neutral")
        rows.append(
            {
                "symbol": "ZL",
                "observation_date": obs.isoformat(),
                "bias": bias,
                "managed_money_net": net,
                "managed_money_ratio": ratio,
                "open_interest": open_interest,
                "payload": raw,
            }
        )
    rows.reverse()  # fetched DESC; return chronological
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true", help="write to cloud (default: dry-run report)")
    args = parser.parse_args()

    load_local_env(ROOT / ".env.local")
    db_url = (
        os.getenv("POSTGRES_URL_NON_POOLING")
        or os.getenv("DATABASE_URL")
        or require_env("SUPABASE_DB_URL")
    )
    fd_key = require_env("FINANCIALDATA_API_KEY")

    print("Fetching financialdata.net ZL daily history...", flush=True)
    fd_bars = fetch_financialdata_bars(fd_key)
    print(f"  financialdata.net bars: {len(fd_bars)}"
          f" ({min(fd_bars) if fd_bars else '-'} .. {max(fd_bars) if fd_bars else '-'})")

    print("Fetching Yahoo ZL=F deep daily history...", flush=True)
    yh_bars = fetch_yahoo_bars()
    print(f"  yahoo bars: {len(yh_bars)}"
          f" ({min(yh_bars) if yh_bars else '-'} .. {max(yh_bars) if yh_bars else '-'})")

    # Cross-validate closes on the overlap before trusting either source.
    overlap = sorted(set(fd_bars) & set(yh_bars))
    diffs = [abs(fd_bars[d][4] - yh_bars[d][4]) for d in overlap]
    rel = [
        abs(fd_bars[d][4] - yh_bars[d][4]) / fd_bars[d][4]
        for d in overlap
        if fd_bars[d][4]
    ]
    within = sum(1 for r in rel if r <= 0.005)
    print(
        f"  overlap: {len(overlap)} days | mean abs close diff: "
        f"{(sum(diffs) / len(diffs)) if diffs else 0:.4f} | max: {max(diffs) if diffs else 0:.4f}"
        f" | within 0.5%: {within}/{len(rel)}"
    )
    if rel and within / len(rel) < 0.95:
        worst = sorted(
            ((abs(fd_bars[d][4] - yh_bars[d][4]) / fd_bars[d][4], d) for d in overlap if fd_bars[d][4]),
            reverse=True,
        )[:5]
        for r, d in worst:
            print(f"    worst: {d} fd={fd_bars[d][4]} yahoo={yh_bars[d][4]} ({r:.2%})")
        raise RuntimeError(
            "Cross-validation failed: >5% of overlapping closes differ by more "
            "than 0.5% between financialdata.net and Yahoo. Investigate before writing."
        )

    # financialdata.net (licensed primary) wins on overlap; Yahoo fills deep history.
    merged: dict[date, Bar] = dict(yh_bars)
    merged.update(fd_bars)
    bars = [merged[d] for d in sorted(merged)]
    print(f"  merged bars to upsert: {len(bars)} ({bars[0][0]} .. {bars[-1][0]})")

    print("Fetching CFTC COT soybean-oil history...", flush=True)
    cot_rows = fetch_cot_history()
    print(f"  cot weekly reports: {len(cot_rows)}"
          f" ({cot_rows[0]['observation_date'] if cot_rows else '-'} .. "
          f"{cot_rows[-1]['observation_date'] if cot_rows else '-'})")

    if not args.execute:
        print("\nDRY RUN — nothing written. Re-run with --execute to upsert.")
        return

    conn = psycopg2.connect(db_url, connect_timeout=10, application_name="backfill_zl_daily_history")
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT count(*), max(bucket_ts) FROM mkt.price_1d WHERE symbol = 'ZL'"
                )
                before_count, before_max = cur.fetchone()
                print(f"mkt.price_1d before: {before_count} rows, newest {before_max}")

                execute_values(
                    cur,
                    """
                    INSERT INTO mkt.price_1d (symbol, bucket_ts, open, high, low, close, volume)
                    VALUES %s
                    ON CONFLICT (symbol, bucket_ts) DO UPDATE
                      SET open = EXCLUDED.open,
                          high = EXCLUDED.high,
                          low = EXCLUDED.low,
                          close = EXCLUDED.close,
                          volume = CASE WHEN EXCLUDED.volume > 0 THEN EXCLUDED.volume ELSE mkt.price_1d.volume END,
                          ingested_at = now()
                    """,
                    [
                        ("ZL", datetime.combine(d, datetime.min.time(), tzinfo=timezone.utc), o, h, l, c, v)
                        for d, o, h, l, c, v in bars
                    ],
                    page_size=500,
                )

                latest = bars[-1]
                cur.execute(
                    """
                    INSERT INTO mkt.latest_price (symbol, price, observed_at)
                    VALUES ('ZL', %s, %s)
                    ON CONFLICT (symbol) DO UPDATE
                      SET price = EXCLUDED.price,
                          observed_at = EXCLUDED.observed_at,
                          ingested_at = now()
                    """,
                    (latest[4], datetime.combine(latest[0], datetime.min.time(), tzinfo=timezone.utc)),
                )

                execute_values(
                    cur,
                    """
                    INSERT INTO mkt.cftc_1w (symbol, observation_date, payload)
                    VALUES %s
                    ON CONFLICT (symbol, observation_date) DO UPDATE
                      SET payload = EXCLUDED.payload,
                          ingested_at = now()
                    """,
                    [("ZL", r["observation_date"], Json(r)) for r in cot_rows],
                    page_size=500,
                )

                cur.execute(
                    "SELECT count(*), max(bucket_ts) FROM mkt.price_1d WHERE symbol = 'ZL'"
                )
                after_count, after_max = cur.fetchone()
                cur.execute("SELECT count(*) FROM mkt.cftc_1w WHERE symbol = 'ZL'")
                cot_count = cur.fetchone()[0]
                print(
                    json.dumps(
                        {
                            "status": "SUCCESS",
                            "price1dRows": after_count,
                            "price1dNewest": str(after_max),
                            "price1dAdded": after_count - before_count,
                            "cftcRows": cot_count,
                            "latestClose": latest[4],
                        },
                        indent=2,
                    )
                )
    finally:
        conn.close()


if __name__ == "__main__":
    main()
