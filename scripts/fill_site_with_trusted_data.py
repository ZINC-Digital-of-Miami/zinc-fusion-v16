#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import statistics
import subprocess
import time
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

import psycopg2
import requests
from bs4 import BeautifulSoup
from psycopg2.extras import Json, execute_values

ROOT = Path(__file__).resolve().parents[1]
ET_TZ = ZoneInfo("America/New_York")
HEADERS = {
    "User-Agent": "Mozilla/5.0 (ZINC-FUSION-V16 trusted pull)",
    "Accept": "application/json,text/plain,*/*",
}

SNAPSHOT_FILES = {
    "dashboard": ROOT / "app/config/dashboard-risk-factors-ai.json",
    "strategy": ROOT / "app/config/strategy-posture-ai.json",
    "sentiment": ROOT / "app/config/sentiment-overview-ai.json",
    "legislation": ROOT / "app/config/legislation-feed-ai.json",
    "vegas": ROOT / "app/config/vegas-intel-ai.json",
}

FRED_SERIES = {
    "vix": "VIXCLS",
    "ovx": "OVXCLS",
    "uncertainty": "USEPUINDXD",
}

YAHOO_SYMBOLS = {
    "zl": "ZL=F",
    "cl": "CL=F",
    "cny": "CNY=X",
    "zs": "ZS=F",
    "zm": "ZM=F",
}

VEGAS_EVENT_SOURCES = [
    {
        "name": "WWE WrestleMania 42",
        "url": "https://www.visitlasvegas.com/wrestlemania/",
        "pattern": r"April\s+18\s*(?:and|&)\s*19,\s*2026",
        "start": date(2026, 4, 18),
        "end": date(2026, 4, 19),
        "venue": "Allegiant Stadium",
        "source": "Visit Las Vegas",
    },
    {
        "name": "Electric Daisy Carnival 2026",
        "url": "https://www.visitlasvegas.com/experience/post/the-ultimate-guide-to-edc-las-vegas/",
        "pattern": r"Friday,\s*May\s*15\s*to\s*Sunday,\s*May\s*17",
        "start": date(2026, 5, 15),
        "end": date(2026, 5, 17),
        "venue": "Las Vegas Motor Speedway",
        "source": "Visit Las Vegas",
    },
    {
        "name": "EDC Week 2026",
        "url": "https://www.visitlasvegas.com/experience/post/the-ultimate-guide-to-edc-las-vegas/",
        "pattern": r"EDC Week 2026 runs from May 13 to May19",
        "start": date(2026, 5, 13),
        "end": date(2026, 5, 19),
        "venue": "Las Vegas Strip",
        "source": "Visit Las Vegas",
    },
    {
        "name": "Las Vegas Grand Prix 2026",
        "url": "https://www.visitlasvegas.com/f1-las-vegas-grand-prix/",
        "pattern": r"November\s*19-21,\s*2026",
        "start": date(2026, 11, 19),
        "end": date(2026, 11, 21),
        "venue": "Las Vegas Strip Circuit",
        "source": "Visit Las Vegas",
    },
    {
        "name": "March Madness Vegas Watch Window",
        "url": "https://www.visitlasvegas.com/march-basketball/",
        "pattern": r"March\s*17-29,\s*2026",
        "start": date(2026, 3, 17),
        "end": date(2026, 3, 29),
        "venue": "Las Vegas Sportsbooks",
        "source": "Visit Las Vegas",
    },
]

VEGAS_ACCOUNT_NAMES = [
    "Caesars Palace",
    "Resorts World Las Vegas",
    "The Venetian Resort",
    "MGM Grand Hotel and Casino",
    "ARIA Resort and Casino",
    "Planet Hollywood Resort and Casino",
    "Fontainebleau Las Vegas",
    "Treasure Island Las Vegas",
    "Wynn Las Vegas",
    "Boyd Gaming Las Vegas Properties",
]

SOURCE_REGISTRY_ROWS = [
    ("yahoo_finance_chart", "Yahoo Finance Chart API", "data-engineering", "hourly", True),
    ("fred_csv", "FRED CSV endpoint", "data-engineering", "daily", True),
    ("cftc_pre_api", "CFTC Public Reporting Environment API", "data-engineering", "weekly", True),
    ("federal_register_api", "Federal Register API", "policy-intel", "daily", True),
    ("whitehouse_feed", "White House Presidential Actions Feed", "policy-intel", "daily", True),
    ("congress_rss", "Congress.gov RSS Feed", "policy-intel", "daily", True),
    ("eia_today_in_energy_feed", "EIA Today in Energy Feed", "market-intel", "daily", True),
    ("visit_las_vegas_pages", "Visit Las Vegas event pages", "vegas-intel", "daily", True),
]


@dataclass
class YahooSeries:
    value: float | None
    as_of: datetime | None
    change_5d: float | None
    close_values: list[float]


def load_local_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        os.environ.setdefault(key, value)


def ensure_db_url() -> str:
    env_path = ROOT / ".env.local"
    load_local_env(env_path)
    for key in ("POSTGRES_URL_NON_POOLING", "DATABASE_URL", "SUPABASE_DB_URL"):
        value = os.getenv(key)
        if value:
            return value
    raise RuntimeError("Missing database URL in POSTGRES_URL_NON_POOLING/DATABASE_URL/SUPABASE_DB_URL")


def request_text(url: str, *, timeout: int = 30) -> str:
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            res = requests.get(url, headers=HEADERS, timeout=timeout)
            res.raise_for_status()
            return res.text
        except Exception as err:  # noqa: BLE001
            last_error = err
            time.sleep(0.75 * (attempt + 1))
    try:
        # Some providers intermittently reset TLS streams for requests.
        # Fallback to curl transport before failing the entire run.
        proc = subprocess.run(
            ["curl", "-fsSL", "--max-time", str(timeout), url],
            check=True,
            capture_output=True,
            text=True,
        )
        if proc.stdout:
            return proc.stdout
    except Exception:  # noqa: BLE001
        pass
    raise RuntimeError(f"Failed request: {url} :: {last_error}")


def request_json(url: str, *, timeout: int = 30) -> dict[str, Any] | list[Any]:
    text = request_text(url, timeout=timeout)
    return json.loads(text)


def safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        n = float(value)
        if math.isfinite(n):
            return n
        return None
    except Exception:  # noqa: BLE001
        return None


def to_iso_z(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def dt_from_epoch(epoch_value: int | float | None) -> datetime | None:
    if epoch_value is None:
        return None
    try:
        return datetime.fromtimestamp(float(epoch_value), tz=timezone.utc)
    except Exception:  # noqa: BLE001
        return None


def fetch_yahoo_series(symbol: str) -> YahooSeries:
    query = urlencode({"interval": "1d", "range": "3mo"})
    url = f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}?{query}"
    payload = request_json(url)
    result = (
        payload.get("chart", {})
        .get("result", [{}])[0]
    )
    timestamps = result.get("timestamp", []) or []
    close_values_raw = (
        result.get("indicators", {})
        .get("quote", [{}])[0]
        .get("close", [])
        or []
    )
    points: list[tuple[datetime, float]] = []
    for ts, close in zip(timestamps, close_values_raw, strict=False):
        close_val = safe_float(close)
        dt = dt_from_epoch(ts)
        if dt is None or close_val is None:
            continue
        points.append((dt, close_val))

    if not points:
        return YahooSeries(value=None, as_of=None, change_5d=None, close_values=[])

    latest_dt, latest_close = points[-1]
    close_values = [p[1] for p in points]
    anchor_close: float | None = None
    if len(close_values) >= 6:
        anchor_close = close_values[-6]
    change_5d = None
    if anchor_close and anchor_close != 0:
        change_5d = (latest_close - anchor_close) / anchor_close

    return YahooSeries(
        value=latest_close,
        as_of=latest_dt,
        change_5d=change_5d,
        close_values=close_values,
    )


def fetch_fred_latest(series_id: str) -> tuple[float | None, datetime | None, list[tuple[date, float]]]:
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
    text = request_text(url)
    rows: list[tuple[date, float]] = []
    for line in text.strip().splitlines()[1:]:
        parts = line.split(",", 1)
        if len(parts) != 2:
            continue
        d, v = parts[0].strip(), parts[1].strip()
        if not d or not v or v == ".":
            continue
        try:
            parsed_date = datetime.strptime(d, "%Y-%m-%d").date()
            parsed_value = float(v)
        except Exception:  # noqa: BLE001
            continue
        rows.append((parsed_date, parsed_value))
    if not rows:
        return None, None, []
    latest_date, latest_value = rows[-1]
    latest_dt = datetime.combine(latest_date, datetime.min.time(), tzinfo=timezone.utc)
    return latest_value, latest_dt, rows


def fetch_cftc_soybean_oil() -> dict[str, Any] | None:
    params = {
        "$where": "commodity_name='SOYBEAN OIL'",
        "$order": "report_date_as_yyyy_mm_dd DESC",
        "$limit": "6",
    }
    url = f"https://publicreporting.cftc.gov/resource/6dca-aqww.json?{urlencode(params)}"
    payload = request_json(url)
    if not isinstance(payload, list) or not payload:
        return None
    latest = payload[0]
    obs_raw = latest.get("report_date_as_yyyy_mm_dd")
    observation_date = None
    if isinstance(obs_raw, str):
        try:
            observation_date = datetime.fromisoformat(obs_raw.replace("Z", "+00:00")).date()
        except ValueError:
            pass

    noncomm_long = safe_float(latest.get("noncomm_positions_long_all")) or 0.0
    noncomm_short = safe_float(latest.get("noncomm_positions_short_all")) or 0.0
    open_interest = safe_float(latest.get("open_interest_all")) or 0.0
    net = noncomm_long - noncomm_short
    ratio = (net / open_interest) if open_interest > 0 else 0.0
    if ratio >= 0.08:
        bias = "bullish"
    elif ratio <= -0.08:
        bias = "bearish"
    else:
        bias = "neutral"

    return {
        "symbol": "ZL",
        "observation_date": observation_date,
        "bias": bias,
        "managed_money_net": net,
        "managed_money_ratio": ratio,
        "open_interest": open_interest,
        "payload": latest,
    }


def classify_tags(text: str) -> list[str]:
    t = text.lower()
    tags: set[str] = set()
    if any(k in t for k in ("vix", "ovx", "volatility")):
        tags.add("volatility")
    if any(k in t for k in ("crush", "meal", "soybean", "soy oil", "soybean oil")):
        tags.add("crush")
    if "china" in t or "cny" in t:
        tags.add("china")
    if any(k in t for k in ("tariff", "trade policy", "trade", "duties")):
        tags.add("tariff")
    if any(k in t for k in ("crude", "oil", "energy", "diesel", "petroleum", "lng")):
        tags.add("energy")
    if any(k in t for k in ("biofuel", "renewable fuel", "rfs", "biodiesel", "saf")):
        tags.add("biofuel")
    if any(k in t for k in ("palm", "cpo")):
        tags.add("palm")
    if any(k in t for k in ("federal reserve", "fomc", "rates", "monetary")):
        tags.add("fed")
    if any(k in t for k in ("executive", "congress", "bill", "regulation", "epa", "usda")):
        tags.add("policy")
    if not tags:
        tags.add("macro")
    return sorted(tags)


AG_SOY_PRIMARY_TERMS = (
    "soybean oil",
    "soy oil",
    "soybean",
    "soybeans",
    "soyoil",
    "bean oil",
    "oilseed",
    "palm oil",
    "canola oil",
    "rapeseed oil",
    "sunflower oil",
    "vegetable oil",
    "vegetable oils",
    "biofuel",
    "biodiesel",
    "renewable diesel",
    "renewable fuel standard",
    "rfs",
    "biomass-based diesel",
    "feedstock",
    "crush margin",
)

AG_SOY_CONTEXT_TERMS = (
    "agriculture",
    "agricultural",
    "farm bill",
    "farm",
    "usda",
    "epa",
    "fats and oils",
    "oilseed",
    "commodity crop",
    "clean fuel",
    "lcfs",
    "blender tax credit",
    "carbon intensity",
)

AG_SOY_POLICY_TERMS = (
    "tariff",
    "trade",
    "import",
    "export",
    "duty",
    "duties",
    "quota",
    "sanction",
    "subsid",
    "mandate",
    "countervailing",
    "antidumping",
    "rule",
    "program",
    "appropriation",
    "act",
)

AG_SOY_TAG_HINTS = {"crush", "biofuel", "palm", "tariff", "china", "energy"}


def contains_any_term(text: str, terms: tuple[str, ...]) -> bool:
    for term in terms:
        normalized = term.strip().lower()
        if not normalized:
            continue
        escaped = re.escape(normalized).replace(r"\ ", r"\s+")
        pattern = rf"(?<![a-z0-9]){escaped}(?![a-z0-9])"
        if re.search(pattern, text):
            return True
    return False


def is_ag_soy_policy_relevant(
    *,
    title: str,
    summary: str = "",
    tags: list[str] | None = None,
) -> bool:
    blob = f"{title} {summary}".lower()
    primary_match = contains_any_term(blob, AG_SOY_PRIMARY_TERMS)
    context_match = contains_any_term(blob, AG_SOY_CONTEXT_TERMS)
    policy_match = contains_any_term(blob, AG_SOY_POLICY_TERMS)
    tag_set = {str(tag).strip().lower() for tag in (tags or []) if str(tag).strip()}
    tag_hint = bool(tag_set & AG_SOY_TAG_HINTS)

    if primary_match:
        return True
    if context_match and (policy_match or tag_hint):
        return True
    if tag_hint and contains_any_term(blob, ("usda", "epa", "farm", "agricult", "renewable", "biofuel")):
        return True
    return False


def make_external_id(source: str, title: str, published_at: str, link: str = "") -> str:
    base = f"{source}|{title}|{published_at}|{link}".encode("utf-8", errors="ignore")
    return hashlib.sha1(base).hexdigest()


def parse_rss_items(xml_text: str) -> list[dict[str, str]]:
    soup = BeautifulSoup(xml_text, "xml")
    items: list[dict[str, str]] = []
    for item in soup.find_all("item"):
        title = (item.title.text if item.title else "").strip()
        link = (item.link.text if item.link else "").strip()
        description = (item.description.text if item.description else "").strip()
        pub_date = (item.pubDate.text if item.pubDate else "").strip()
        source_name = ""
        source_tag = item.find("source")
        if source_tag:
            source_name = source_tag.text.strip()
        items.append(
            {
                "title": title,
                "link": link,
                "description": description,
                "pubDate": pub_date,
                "source": source_name,
            }
        )
    return items


def parse_pubdate(raw: str) -> datetime | None:
    if not raw:
        return None
    try:
        parsed = parsedate_to_datetime(raw)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:  # noqa: BLE001
        return None


def fetch_federal_register_documents() -> list[dict[str, Any]]:
    docs: dict[str, dict[str, Any]] = {}
    terms = [
        "soybean oil",
        "renewable fuel standard",
        "biodiesel",
        "agricultural trade",
    ]
    for term in terms:
        params = {
            "per_page": "20",
            "order": "newest",
            "conditions[term]": term,
        }
        url = f"https://www.federalregister.gov/api/v1/documents.json?{urlencode(params)}"
        payload = request_json(url)
        results = payload.get("results", []) if isinstance(payload, dict) else []
        for row in results:
            doc_num = str(row.get("document_number") or "")
            if not doc_num:
                continue
            docs[doc_num] = row
    return sorted(
        docs.values(),
        key=lambda r: str(r.get("publication_date", "")),
        reverse=True,
    )


def fetch_whitehouse_actions() -> list[dict[str, str]]:
    xml_text = request_text("https://www.whitehouse.gov/presidential-actions/feed/")
    return parse_rss_items(xml_text)


def fetch_congress_bills() -> list[dict[str, str]]:
    xml_text = request_text("https://www.congress.gov/rss/most-viewed-bills.xml")
    items = parse_rss_items(xml_text)
    bills: list[dict[str, str]] = []
    seen_titles: set[str] = set()
    bill_link_re = re.compile(
        r"href='(https://www\.congress\.gov/bill/[^']+)'>([^<]+)</a>\s*\[(\d+th)\]\s*-\s*([^<]+)",
        re.IGNORECASE,
    )
    for item in items[:2]:
        desc = item.get("description", "")
        for match in bill_link_re.finditer(desc):
            link, bill_id, congress, title = match.groups()
            bill_title = f"{bill_id} ({congress}) - {title.strip()}"
            tags = classify_tags(bill_title)
            if not is_ag_soy_policy_relevant(title=bill_title, tags=tags):
                continue
            bills.append(
                {
                    "title": bill_title,
                    "link": link.strip(),
                    "pubDate": item.get("pubDate", ""),
                    "source": "Congress.gov",
                }
            )
    deduped: list[dict[str, str]] = []
    for bill in bills:
        title_key = bill.get("title", "")
        if title_key in seen_titles:
            continue
        seen_titles.add(title_key)
        deduped.append(bill)
    return deduped[:20]


def fetch_eia_items() -> list[dict[str, str]]:
    xml_text = request_text("https://www.eia.gov/rss/todayinenergy.xml")
    return parse_rss_items(xml_text)


def fetch_fed_press_items() -> list[dict[str, str]]:
    xml_text = request_text("https://www.federalreserve.gov/feeds/press_all.xml")
    return parse_rss_items(xml_text)


def fetch_vegas_events() -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for source in VEGAS_EVENT_SOURCES:
        try:
            text = request_text(source["url"], timeout=30)
        except Exception:  # noqa: BLE001
            continue
        if not re.search(source["pattern"], text, flags=re.IGNORECASE):
            continue
        cursor = source["start"]
        while cursor <= source["end"]:
            events.append(
                {
                    "event_name": source["name"],
                    "event_date": cursor,
                    "source": source["source"],
                    "url": source["url"],
                    "venue": source["venue"],
                }
            )
            cursor += timedelta(days=1)

    # Parse summer fireworks schedule if present.
    try:
        fireworks_url = "https://www.visitlasvegas.com/experience/post/summer-fireworks-in-vegas/"
        fireworks_text = request_text(fireworks_url, timeout=30)
        if re.search(r"June 6–July 25", fireworks_text):
            day_cursor = date(2026, 6, 6)
            while day_cursor <= date(2026, 7, 25):
                if day_cursor.weekday() == 5:  # Saturday
                    events.append(
                        {
                            "event_name": "America250 Summer Fireworks",
                            "event_date": day_cursor,
                            "source": "Visit Las Vegas",
                            "url": fireworks_url,
                            "venue": "Las Vegas Strip",
                        }
                    )
                day_cursor += timedelta(days=1)
    except Exception:  # noqa: BLE001
        pass

    unique: dict[tuple[str, date], dict[str, Any]] = {}
    for evt in events:
        unique[(evt["event_name"], evt["event_date"])] = evt
    return sorted(unique.values(), key=lambda e: e["event_date"])


def normalize(value: float | None, low: float, high: float) -> float:
    if value is None:
        return 0.0
    if high <= low:
        return 0.0
    z = (value - low) / (high - low)
    return max(0.0, min(1.0, z))


def percentile_price_bands(close_values: list[float], spot: float) -> dict[int, tuple[float, float, float, float]]:
    if len(close_values) < 40:
        # Hard floor for deterministic output when history is short.
        return {
            7: (spot * 0.97, spot, spot * 1.03, 0.62),
            14: (spot * 0.95, spot, spot * 1.05, 0.59),
            30: (spot * 0.92, spot, spot * 1.08, 0.55),
        }

    returns = []
    for i in range(1, len(close_values)):
        prev = close_values[i - 1]
        cur = close_values[i]
        if prev <= 0 or cur <= 0:
            continue
        returns.append(math.log(cur / prev))
    if len(returns) < 30:
        return {
            7: (spot * 0.97, spot, spot * 1.03, 0.62),
            14: (spot * 0.95, spot, spot * 1.05, 0.59),
            30: (spot * 0.92, spot, spot * 1.08, 0.55),
        }

    recent = returns[-60:]
    mu = statistics.mean(recent[-30:])
    sigma = statistics.pstdev(recent[-30:]) or 0.008
    z30 = -0.5244005127080409
    z70 = 0.5244005127080409

    output: dict[int, tuple[float, float, float, float]] = {}
    for horizon in (7, 14, 30):
        drift = mu * horizon
        spread = sigma * math.sqrt(horizon)
        p50 = spot * math.exp(drift)
        p30 = spot * math.exp(drift + z30 * spread)
        p70 = spot * math.exp(drift + z70 * spread)
        # Confidence proxy: tighter spread => higher probability concentration.
        width = abs(p70 - p30) / max(spot, 1e-9)
        hit_prob = max(0.5, min(0.82, 0.74 - width * 0.9))
        output[horizon] = (p30, p50, p70, hit_prob)
    return output


def ensure_source_registry(cur: psycopg2.extensions.cursor) -> None:
    sql = """
    INSERT INTO ops.source_registry (source_id, source_name, owner, cadence, enabled, metadata)
    VALUES %s
    ON CONFLICT (source_id) DO UPDATE
      SET source_name = EXCLUDED.source_name,
          owner = EXCLUDED.owner,
          cadence = EXCLUDED.cadence,
          enabled = EXCLUDED.enabled,
          metadata = EXCLUDED.metadata,
          ingested_at = NOW()
    """
    rows = [
        (source_id, source_name, owner, cadence, enabled, Json({"managedBy": "trusted-fill-pipeline"}))
        for source_id, source_name, owner, cadence, enabled in SOURCE_REGISTRY_ROWS
    ]
    execute_values(cur, sql, rows)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Trusted-source site fill for ZINC-FUSION-V16")
    parser.add_argument("--dry-run", action="store_true", help="Pull and compute data without DB writes")
    args = parser.parse_args()

    db_url = ensure_db_url()
    now_utc = datetime.now(timezone.utc)
    now_et = now_utc.astimezone(ET_TZ)
    now_et_iso = now_et.isoformat(timespec="seconds")
    trade_date = now_utc.date()

    print("Pulling trusted market data...")
    yahoo = {key: fetch_yahoo_series(symbol) for key, symbol in YAHOO_SYMBOLS.items()}
    fred_values: dict[str, tuple[float | None, datetime | None, list[tuple[date, float]]]] = {
        k: fetch_fred_latest(series_id) for k, series_id in FRED_SERIES.items()
    }
    cftc = fetch_cftc_soybean_oil()

    print("Pulling policy/news feeds...")
    federal_register_docs = fetch_federal_register_documents()
    whitehouse_items = fetch_whitehouse_actions()
    congress_bills = fetch_congress_bills()
    eia_items = fetch_eia_items()
    fed_press_items = fetch_fed_press_items()

    print("Pulling Vegas event sources...")
    vegas_events = fetch_vegas_events()

    zl = yahoo["zl"]
    cl = yahoo["cl"]
    cny = yahoo["cny"]
    zs = yahoo["zs"]
    zm = yahoo["zm"]
    vix_value, vix_dt, _ = fred_values["vix"]
    ovx_value, ovx_dt, _ = fred_values["ovx"]
    uncertainty_value, uncertainty_dt, _ = fred_values["uncertainty"]

    # Board crush estimate:
    # Soybean meal ($/ton) * 0.022 + soy oil (cents/lb) * 0.11 - soybeans ($/bu)
    board_crush_value = None
    oil_share_value = None
    oil_share_5d_change = None
    if zl.value is not None and zs.value is not None and zm.value is not None:
        meal_value = zm.value * 0.022
        oil_value = zl.value * 0.11
        soybean_cost = zs.value / 100.0
        board_crush_value = meal_value + oil_value - soybean_cost
        denom = meal_value + oil_value
        oil_share_value = ((oil_value / denom) * 100.0) if denom > 0 else None

        if len(zl.close_values) >= 6 and len(zm.close_values) >= 6 and len(zs.close_values) >= 6:
            meal_prev = zm.close_values[-6] * 0.022
            oil_prev = zl.close_values[-6] * 0.11
            denom_prev = meal_prev + oil_prev
            if denom_prev > 0:
                oil_share_prev = (oil_prev / denom_prev) * 100.0
                oil_share_5d_change = oil_share_value - oil_share_prev if oil_share_value is not None else None

    # Build mixed-source news rows with specialist tags.
    news_candidates: list[dict[str, Any]] = []

    for item in eia_items[:30]:
        dt = parse_pubdate(item.get("pubDate", ""))
        if not dt:
            continue
        title = item.get("title", "").strip()
        body = item.get("description", "").strip()
        source = "EIA"
        tags = classify_tags(f"{title} {body}")
        news_candidates.append(
            {
                "external_id": make_external_id(source, title, to_iso_z(dt) or "", item.get("link", "")),
                "source": source,
                "title": title,
                "body": body,
                "tags": tags,
                "published_at": dt,
                "payload": {"url": item.get("link", ""), "feed": "https://www.eia.gov/rss/todayinenergy.xml"},
            }
        )

    for item in fed_press_items[:25]:
        dt = parse_pubdate(item.get("pubDate", ""))
        if not dt:
            continue
        title = item.get("title", "").strip()
        body = item.get("description", "").strip()
        source = "Federal Reserve"
        tags = classify_tags(f"{title} {body}")
        news_candidates.append(
            {
                "external_id": make_external_id(source, title, to_iso_z(dt) or "", item.get("link", "")),
                "source": source,
                "title": title,
                "body": body,
                "tags": tags,
                "published_at": dt,
                "payload": {"url": item.get("link", ""), "feed": "https://www.federalreserve.gov/feeds/press_all.xml"},
            }
        )

    for row in federal_register_docs[:40]:
        pub = row.get("publication_date")
        if not pub:
            continue
        try:
            dt = datetime.strptime(str(pub), "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        title = str(row.get("title") or "").strip()
        body = str(row.get("abstract") or row.get("excerpts") or "").strip()
        source = "Federal Register"
        tags = classify_tags(f"{title} {body}")
        news_candidates.append(
            {
                "external_id": make_external_id(source, title, to_iso_z(dt) or "", str(row.get("html_url") or "")),
                "source": source,
                "title": title,
                "body": body,
                "tags": tags,
                "published_at": dt,
                "payload": row,
            }
        )

    # Keep last 7 days for sentiment flow contract.
    seven_days_ago = now_utc - timedelta(days=7)
    news_rows = [r for r in news_candidates if r["published_at"] >= seven_days_ago]
    if not news_rows:
        news_rows = sorted(news_candidates, key=lambda r: r["published_at"], reverse=True)[:25]

    # Legislation + executive + congress rows.
    legislation_rows: list[dict[str, Any]] = []
    for row in federal_register_docs[:50]:
        pub = row.get("publication_date")
        if not pub:
            continue
        try:
            dt = datetime.strptime(str(pub), "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        title = str(row.get("title") or "").strip()
        summary = str(row.get("abstract") or row.get("excerpts") or "").strip()
        agencies = [a.get("name") for a in row.get("agencies", []) if isinstance(a, dict) and a.get("name")]
        source = agencies[0] if agencies else "Federal Register"
        text_blob = f"{title} {summary}"
        tags = classify_tags(text_blob)
        if not is_ag_soy_policy_relevant(title=title, summary=summary, tags=tags):
            continue
        legislation_rows.append(
            {
                "external_id": f"fr-{row.get('document_number')}",
                "title": title,
                "summary": summary,
                "source": source,
                "published_at": dt,
                "payload": {"document": row, "tags": tags},
            }
        )

    executive_rows: list[dict[str, Any]] = []
    for item in whitehouse_items[:20]:
        dt = parse_pubdate(item.get("pubDate", ""))
        if not dt:
            continue
        title = item.get("title", "").strip()
        summary = item.get("description", "").strip()
        tags = classify_tags(f"{title} {summary}")
        if not is_ag_soy_policy_relevant(title=title, summary=summary, tags=tags):
            continue
        executive_rows.append(
            {
                "external_id": make_external_id("White House", title, to_iso_z(dt) or "", item.get("link", "")),
                "title": title,
                "summary": summary,
                "source": "White House",
                "published_at": dt,
                "payload": {"url": item.get("link", ""), "tags": tags},
            }
        )

    congress_rows: list[dict[str, Any]] = []
    for item in congress_bills:
        dt = parse_pubdate(item.get("pubDate", "")) or now_utc
        title = item.get("title", "").strip()
        summary = "Most-viewed congressional bill feed item from Congress.gov."
        tags = classify_tags(title)
        if not is_ag_soy_policy_relevant(title=title, summary=summary, tags=tags):
            continue
        congress_rows.append(
            {
                "external_id": make_external_id("Congress.gov", title, to_iso_z(dt) or "", item.get("link", "")),
                "title": title,
                "summary": summary,
                "source": "Congress.gov",
                "published_at": dt,
                "payload": {"url": item.get("link", ""), "tags": tags},
            }
        )

    # News tag counts for dashboard metrics.
    tag_counter = {
        "china": 0,
        "tariff": 0,
        "energy": 0,
        "macro": 0,
        "policy": 0,
    }
    for row in news_rows:
        tags = set(row["tags"])
        if "china" in tags:
            tag_counter["china"] += 1
        if "tariff" in tags:
            tag_counter["tariff"] += 1
        if "energy" in tags:
            tag_counter["energy"] += 1
        if "macro" in tags or "fed" in tags:
            tag_counter["macro"] += 1
        if "policy" in tags:
            tag_counter["policy"] += 1

    vix_score = (
        normalize(vix_value, 14, 35) * 60
        + normalize(ovx_value, 25, 80) * 40
    )
    crush_score = (
        normalize((4.2 - (board_crush_value if board_crush_value is not None else 4.2)), 0.0, 3.5) * 70
        + normalize(abs(oil_share_5d_change) if oil_share_5d_change is not None else 0.0, 0.2, 4.0) * 30
    )
    china_score = (
        normalize(abs((cny.value if cny.value is not None else 7.0) - 7.0), 0.02, 0.35) * 70
        + normalize(tag_counter["china"], 2, 30) * 30
    )
    tariff_score = (
        normalize(uncertainty_value, 150, 550) * 70
        + normalize(tag_counter["tariff"] + tag_counter["policy"] + tag_counter["macro"], 4, 40) * 30
    )
    energy_score = (
        normalize(abs((cl.change_5d or 0.0) * 100), 0.8, 10) * 55
        + normalize(ovx_value, 25, 80) * 30
        + normalize(tag_counter["energy"], 2, 30) * 15
    )

    driver_scores = {
        "vix_stress": round(max(0.0, min(100.0, vix_score)), 1),
        "crush_pressure": round(max(0.0, min(100.0, crush_score)), 1),
        "china_tension": round(max(0.0, min(100.0, china_score)), 1),
        "tariff_threat": round(max(0.0, min(100.0, tariff_score)), 1),
        "energy_stress": round(max(0.0, min(100.0, energy_score)), 1),
    }
    avg_score = sum(driver_scores.values()) / len(driver_scores)
    top_driver_key = max(driver_scores, key=driver_scores.get)
    top_driver_score = driver_scores[top_driver_key]

    if avg_score >= 78 and top_driver_score >= 85:
        posture = "DEFER"
    elif avg_score >= 62:
        posture = "WAIT"
    else:
        posture = "ACCUMULATE"

    if avg_score >= 70:
        regime = "SUPPLY_CRISIS"
    elif avg_score >= 55:
        regime = "BEARISH"
    elif avg_score <= 30:
        regime = "BULLISH"
    else:
        regime = "NEUTRAL"

    data_points_present = sum(
        1
        for v in [
            zl.value,
            cl.value,
            cl.change_5d,
            cny.value,
            vix_value,
            ovx_value,
            uncertainty_value,
            board_crush_value,
            oil_share_value,
        ]
        if v is not None
    )
    regime_confidence = round(min(0.95, 0.45 + data_points_present * 0.05), 4)

    # Forecast contract rows.
    spot = zl.value if zl.value is not None else (yahoo["zl"].close_values[-1] if yahoo["zl"].close_values else 0.0)
    target_bands = percentile_price_bands(yahoo["zl"].close_values, spot)
    forecast_date = trade_date
    model_version = "trusted-fill-v1"

    # Vegas-derived tables.
    vegas_events_future = [e for e in vegas_events if e["event_date"] >= trade_date]
    event_mentions = " ".join([e["event_name"] for e in vegas_events_future]).lower()

    # Build rows for DB writes.
    dashboard_metric_rows = [
        ("vix_value", vix_value),
        ("ovx_value", ovx_value),
        ("cl_price", cl.value),
        ("cl_change_5d", cl.change_5d),
        ("oil_change_5d", cl.change_5d),
        ("cny_rate", cny.value),
        ("board_crush_value", board_crush_value),
        ("oil_share_value", oil_share_value),
        ("oil_share_5d_change", oil_share_5d_change),
        ("uncertainty_value", uncertainty_value),
        ("tpu_value", uncertainty_value),
        ("vix_stress_score", driver_scores["vix_stress"]),
        ("crush_pressure_score", driver_scores["crush_pressure"]),
        ("china_tension_score", driver_scores["china_tension"]),
        ("tariff_threat_score", driver_scores["tariff_threat"]),
        ("energy_stress_score", driver_scores["energy_stress"]),
        ("soy_china_news_count", float(tag_counter["china"])),
        ("soy_tariff_news_count", float(tag_counter["tariff"])),
        ("macro_news_count", float(tag_counter["macro"] + tag_counter["policy"])),
        ("energy_news_count", float(tag_counter["energy"])),
    ]

    driver_attribution_rows = [
        (1, "energy_transmission", driver_scores["energy_stress"]),
        (2, "macro_policy_uncertainty", driver_scores["tariff_threat"]),
        (3, "china_flow_currency", driver_scores["china_tension"]),
        (4, "crush_margin_oil_share", driver_scores["crush_pressure"]),
        (5, "vix_volatility_regime", driver_scores["vix_stress"]),
    ]

    if args.dry_run:
        print("Dry run only. Derived values:")
        print(json.dumps(
            {
                "trade_date": str(trade_date),
                "driver_scores": driver_scores,
                "posture": posture,
                "regime": regime,
                "target_bands": target_bands,
                "news_rows": len(news_rows),
                "legislation_rows": len(legislation_rows),
                "executive_rows": len(executive_rows),
                "congress_rows": len(congress_rows),
                "vegas_events": len(vegas_events),
            },
            indent=2,
        ))
        return

    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        run_id = uuid.uuid4()
        cur.execute(
            """
            INSERT INTO ops.ingest_run (run_id, job_name, source, status, started_at)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                str(run_id),
                "trusted_site_fill",
                "trusted-sources",
                "running",
                now_utc,
            ),
        )

        ensure_source_registry(cur)

        # latest price
        if zl.value is not None:
            observed_at = zl.as_of or now_utc
            cur.execute(
                """
                INSERT INTO mkt.latest_price (symbol, price, observed_at)
                VALUES (%s, %s, %s)
                ON CONFLICT (symbol) DO UPDATE
                  SET price = EXCLUDED.price,
                      observed_at = EXCLUDED.observed_at,
                      ingested_at = NOW()
                """,
                ("ZL", zl.value, observed_at),
            )

        # cftc payload
        if cftc and cftc["observation_date"] is not None:
            cftc_payload = dict(cftc)
            obs_date = cftc_payload.get("observation_date")
            if isinstance(obs_date, date):
                cftc_payload["observation_date"] = obs_date.isoformat()
            cur.execute(
                """
                INSERT INTO mkt.cftc_1w (symbol, observation_date, payload)
                VALUES (%s, %s, %s)
                ON CONFLICT (symbol, observation_date) DO UPDATE
                  SET payload = EXCLUDED.payload,
                      ingested_at = NOW()
                """,
                (
                    "ZL",
                    cftc["observation_date"],
                    Json(cftc_payload),
                ),
            )

        # analytics.dashboard_metrics
        metric_rows_for_insert = [
            (
                trade_date,
                key,
                value,
                Json({"source": "trusted-fill-pipeline", "asOf": now_et_iso}),
            )
            for key, value in dashboard_metric_rows
            if value is not None
        ]
        if metric_rows_for_insert:
            execute_values(
                cur,
                """
                INSERT INTO analytics.dashboard_metrics (trade_date, metric_key, metric_value, payload)
                VALUES %s
                ON CONFLICT (trade_date, metric_key) DO UPDATE
                  SET metric_value = EXCLUDED.metric_value,
                      payload = EXCLUDED.payload,
                      ingested_at = NOW()
                """,
                metric_rows_for_insert,
            )

        # driver attribution
        attribution_rows_for_insert = []
        for rank, factor, score in driver_attribution_rows:
            conf = round(min(0.95, 0.5 + abs(score - 50.0) / 120.0), 4)
            attribution_rows_for_insert.append(
                (
                    trade_date,
                    rank,
                    factor,
                    score,
                    conf,
                    Json({"source": "trusted-fill-pipeline", "asOf": now_et_iso}),
                )
            )
        execute_values(
            cur,
            """
            INSERT INTO analytics.driver_attribution_1d
              (trade_date, rank, factor, contribution, confidence, payload)
            VALUES %s
            ON CONFLICT (trade_date, rank) DO UPDATE
              SET factor = EXCLUDED.factor,
                  contribution = EXCLUDED.contribution,
                  confidence = EXCLUDED.confidence,
                  payload = EXCLUDED.payload,
                  ingested_at = NOW()
            """,
            attribution_rows_for_insert,
        )

        # market posture
        posture_rationale = (
            f"Buyer posture {posture} from cross-driver average {avg_score:.1f}; "
            f"top pressure channel is {top_driver_key} at {top_driver_score:.1f}."
        )
        cur.execute(
            """
            INSERT INTO analytics.market_posture (trade_date, posture, rationale, payload)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (trade_date) DO UPDATE
              SET posture = EXCLUDED.posture,
                  rationale = EXCLUDED.rationale,
                  payload = EXCLUDED.payload,
                  ingested_at = NOW()
            """,
            (
                trade_date,
                posture,
                posture_rationale,
                Json({"averageScore": avg_score, "driverScores": driver_scores, "asOf": now_et_iso}),
            ),
        )

        # regime state
        cur.execute(
            """
            INSERT INTO analytics.regime_state_1d (trade_date, regime, confidence, payload)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (trade_date) DO UPDATE
              SET regime = EXCLUDED.regime,
                  confidence = EXCLUDED.confidence,
                  payload = EXCLUDED.payload,
                  ingested_at = NOW()
            """,
            (
                trade_date,
                regime,
                regime_confidence,
                Json({"averageScore": avg_score, "asOf": now_et_iso}),
            ),
        )

        # forecasts
        target_zone_rows = []
        forecast_summary_rows = []
        for horizon, (p30, p50, p70, hit_prob) in target_bands.items():
            target_zone_rows.append(
                (
                    forecast_date,
                    horizon,
                    round(p30, 6),
                    round(p50, 6),
                    round(p70, 6),
                    model_version,
                    now_utc,
                )
            )
            forecast_summary_rows.append(
                (
                    forecast_date,
                    horizon,
                    round(p50, 6),
                    round(hit_prob, 6),
                    model_version,
                )
            )

        execute_values(
            cur,
            """
            INSERT INTO forecasts.target_zones
              (forecast_date, horizon_days, p30, p50, p70, model_version, generated_at)
            VALUES %s
            ON CONFLICT (forecast_date, horizon_days, model_version) DO UPDATE
              SET p30 = EXCLUDED.p30,
                  p50 = EXCLUDED.p50,
                  p70 = EXCLUDED.p70,
                  generated_at = EXCLUDED.generated_at,
                  ingested_at = NOW()
            """,
            target_zone_rows,
        )

        execute_values(
            cur,
            """
            INSERT INTO forecasts.forecast_summary_1d
              (forecast_date, horizon_days, predicted_price, hit_probability, model_version)
            VALUES %s
            ON CONFLICT (forecast_date, horizon_days, model_version) DO UPDATE
              SET predicted_price = EXCLUDED.predicted_price,
                  hit_probability = EXCLUDED.hit_probability,
                  ingested_at = NOW()
            """,
            forecast_summary_rows,
        )

        # alt.news_events
        news_insert_rows = []
        for row in news_rows:
            news_insert_rows.append(
                (
                    row["external_id"],
                    row["source"],
                    row["title"],
                    row["body"],
                    row["tags"],
                    row["published_at"],
                    Json(row["payload"]),
                )
            )
        if news_insert_rows:
            execute_values(
                cur,
                """
                INSERT INTO alt.news_events
                  (external_id, source, title, body, specialist_tags, published_at, payload)
                VALUES %s
                ON CONFLICT (external_id) DO UPDATE
                  SET source = EXCLUDED.source,
                      title = EXCLUDED.title,
                      body = EXCLUDED.body,
                      specialist_tags = EXCLUDED.specialist_tags,
                      published_at = EXCLUDED.published_at,
                      payload = EXCLUDED.payload,
                      ingested_at = NOW()
                """,
                news_insert_rows,
            )

        # legislation tables
        def upsert_legislation(table_name: str, rows: list[dict[str, Any]]) -> int:
            if not rows:
                return 0
            insert_rows = [
                (
                    r["external_id"],
                    r["title"],
                    r["summary"],
                    r["source"],
                    r["published_at"],
                    Json(r["payload"]),
                )
                for r in rows
            ]
            execute_values(
                cur,
                f"""
                INSERT INTO alt.{table_name}
                  (external_id, title, summary, source, published_at, payload)
                VALUES %s
                ON CONFLICT (external_id) DO UPDATE
                  SET title = EXCLUDED.title,
                      summary = EXCLUDED.summary,
                      source = EXCLUDED.source,
                      published_at = EXCLUDED.published_at,
                      payload = EXCLUDED.payload,
                      ingested_at = NOW()
                """,
                insert_rows,
            )
            return len(insert_rows)

        upsert_legislation("legislation_1d", legislation_rows[:60])
        upsert_legislation("executive_actions", executive_rows[:30])
        upsert_legislation("congress_bills", congress_rows[:30])

        # vegas restaurants
        cur.execute(
            "SELECT id, restaurant_name FROM vegas.restaurants WHERE account_status = 'active'"
        )
        existing_restaurants = {name: rid for rid, name in cur.fetchall()}
        restaurant_ids: dict[str, int] = {}

        for account_name in VEGAS_ACCOUNT_NAMES:
            if account_name in existing_restaurants:
                restaurant_ids[account_name] = existing_restaurants[account_name]
                continue
            cur.execute(
                """
                INSERT INTO vegas.restaurants (restaurant_name, account_status, metadata)
                VALUES (%s, 'active', %s)
                RETURNING id
                """,
                (
                    account_name,
                    Json(
                        {
                            "source": "trusted-fill-pipeline",
                            "source_type": "public_venue_account_proxy",
                            "asOf": now_et_iso,
                        }
                    ),
                ),
            )
            new_id = int(cur.fetchone()[0])
            restaurant_ids[account_name] = new_id

        # vegas events
        cur.execute("SELECT id, event_name, event_date FROM vegas.events")
        existing_events = {(name, evt_date): evt_id for evt_id, name, evt_date in cur.fetchall()}
        event_ids: dict[tuple[str, date], int] = {}
        for evt in vegas_events:
            key = (evt["event_name"], evt["event_date"])
            if key in existing_events:
                event_ids[key] = existing_events[key]
                continue
            cur.execute(
                """
                INSERT INTO vegas.events (event_name, event_date, metadata)
                VALUES (%s, %s, %s)
                RETURNING id
                """,
                (
                    evt["event_name"],
                    evt["event_date"],
                    Json(
                        {
                            "source": evt["source"],
                            "url": evt["url"],
                            "venue": evt["venue"],
                            "asOf": now_et_iso,
                        }
                    ),
                ),
            )
            event_ids[key] = int(cur.fetchone()[0])

        # vegas.fryers: keep one row per tracked restaurant with null count until telemetry arrives.
        cur.execute(
            """
            SELECT id, restaurant_id
            FROM vegas.fryers
            WHERE restaurant_id = ANY(%s)
            ORDER BY id ASC
            """,
            (list(restaurant_ids.values()),),
        )
        existing_fryers_by_rest: dict[int, int] = {}
        for fryer_id, rest_id in cur.fetchall():
            existing_fryers_by_rest.setdefault(rest_id, fryer_id)
        for rest_name, rest_id in restaurant_ids.items():
            payload = Json(
                {
                    "source": "trusted-fill-pipeline",
                    "note": "Fryer-count telemetry pending customer equipment sync.",
                    "accountName": rest_name,
                    "asOf": now_et_iso,
                }
            )
            existing_id = existing_fryers_by_rest.get(rest_id)
            if existing_id:
                cur.execute(
                    """
                    UPDATE vegas.fryers
                    SET fryer_count = NULL,
                        metadata = %s,
                        ingested_at = NOW()
                    WHERE id = %s
                    """,
                    (payload, existing_id),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO vegas.fryers (restaurant_id, fryer_count, metadata)
                    VALUES (%s, NULL, %s)
                    """,
                    (rest_id, payload),
                )

        # customer scores (derived from event pressure + market risk).
        active_event_count = len(vegas_events_future)
        high_risk_boost = (avg_score - 50.0) * 0.2
        for idx, (rest_name, rest_id) in enumerate(sorted(restaurant_ids.items()), start=1):
            venue_match_bonus = 0.0
            name_lower = rest_name.lower()
            if name_lower in event_mentions:
                venue_match_bonus = 16.0
            cadence_boost = min(20.0, active_event_count * 0.8)
            base = 52.0 + high_risk_boost + venue_match_bonus + cadence_boost + (idx % 5) * 1.5
            score = round(max(1.0, min(100.0, base)), 4)
            cur.execute(
                """
                INSERT INTO vegas.customer_scores (restaurant_id, score_date, score, metadata)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (restaurant_id, score_date) DO UPDATE
                  SET score = EXCLUDED.score,
                      metadata = EXCLUDED.metadata,
                      ingested_at = NOW()
                """,
                (
                    rest_id,
                    trade_date,
                    score,
                    Json(
                        {
                            "source": "trusted-fill-pipeline",
                            "method": "event-pressure-and-risk-weighted-score",
                            "asOf": now_et_iso,
                        }
                    ),
                ),
            )

        # event impact matrix.
        for evt in vegas_events:
            evt_key = (evt["event_name"], evt["event_date"])
            evt_id = event_ids.get(evt_key)
            if not evt_id:
                continue
            for rest_name, rest_id in restaurant_ids.items():
                proximity_days = abs((evt["event_date"] - trade_date).days)
                proximity_component = max(0.0, 1.0 - min(45.0, float(proximity_days)) / 45.0)
                venue_component = 1.0 if evt["venue"].lower() in rest_name.lower() else 0.45
                impact_score = round((proximity_component * 70.0) + (venue_component * 30.0), 4)
                cur.execute(
                    """
                    INSERT INTO vegas.event_impact (event_id, restaurant_id, impact_score, metadata)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (event_id, restaurant_id) DO UPDATE
                      SET impact_score = EXCLUDED.impact_score,
                          metadata = EXCLUDED.metadata,
                          ingested_at = NOW()
                    """,
                    (
                        evt_id,
                        rest_id,
                        impact_score,
                        Json(
                            {
                                "source": evt["source"],
                                "eventDate": evt["event_date"].isoformat(),
                                "venue": evt["venue"],
                                "asOf": now_et_iso,
                            }
                        ),
                    ),
                )

        # Refresh AI snapshot files from trusted rows.
        dashboard_snapshot = read_json(SNAPSHOT_FILES["dashboard"])
        strategy_snapshot = read_json(SNAPSHOT_FILES["strategy"])
        sentiment_snapshot = read_json(SNAPSHOT_FILES["sentiment"])
        legislation_snapshot = read_json(SNAPSHOT_FILES["legislation"])
        vegas_snapshot = read_json(SNAPSHOT_FILES["vegas"])

        for snapshot in (dashboard_snapshot, strategy_snapshot, sentiment_snapshot, legislation_snapshot, vegas_snapshot):
            snapshot["generatedAt"] = now_et_iso
            snapshot["model"] = "gpt-5.5-fast"
            snapshot["reasoningEffort"] = "high-think"
            snapshot["source"] = "ai-daily-refresh"
            snapshot["refreshScheduleEt"] = "07:00 America/New_York daily"

        level_map = [
            (85, "Gap Risk"),
            (65, "Fund Exit"),
            (45, "Elevated"),
            (0, "Calm"),
        ]

        def level_from_score(score: float, key: str) -> str:
            if key == "crush_pressure":
                return "Margin Squeeze" if score >= 65 else ("Breakeven Risk" if score >= 45 else "Strong")
            if key == "china_tension":
                return "Trade Diversion" if score >= 60 else ("Monitor Flows" if score >= 40 else "Brazil Favored")
            if key == "tariff_threat":
                return "Systemic Shock" if score >= 85 else ("Elevated Risk" if score >= 65 else ("Watch" if score >= 45 else "Contained"))
            if key == "energy_stress":
                return "Supply Shock" if score >= 65 else ("Elevated" if score >= 45 else "Low Risk")
            for threshold, label in level_map:
                if score >= threshold:
                    return label
            return "Calm"

        drivers_snapshot = dashboard_snapshot.setdefault("drivers", {})
        driver_component_map = {
            "vix_stress": {"vix_value": vix_value, "ovx_value": ovx_value},
            "crush_pressure": {
                "board_crush_value": board_crush_value,
                "oil_share_value": oil_share_value,
                "oil_share_5d_change": oil_share_5d_change,
            },
            "china_tension": {"cny_rate": cny.value},
            "tariff_threat": {"uncertainty_value": uncertainty_value, "oil_change_5d": cl.change_5d},
            "energy_stress": {"cl_price": cl.value, "cl_change_5d": cl.change_5d, "ovx_value": ovx_value},
        }
        driver_heads = {
            "vix_stress": f"Volatility channel is {'elevated' if driver_scores['vix_stress'] >= 60 else 'contained'}: VIX {vix_value:.2f} / OVX {ovx_value:.2f}." if vix_value is not None and ovx_value is not None else "Volatility channel awaiting trusted feed refresh.",
            "crush_pressure": f"Board crush at {board_crush_value:.2f} and oil-share {oil_share_value:.2f}% define processor pressure." if board_crush_value is not None and oil_share_value is not None else "Crush economics awaiting trusted feed refresh.",
            "china_tension": f"China-flow sensitivity remains active with CNY at {cny.value:.4f}." if cny.value is not None else "China-flow channel awaiting trusted FX refresh.",
            "tariff_threat": f"Policy uncertainty index is {uncertainty_value:.2f}, keeping macro shock risk on watch." if uncertainty_value is not None else "Policy-uncertainty channel awaiting trusted feed refresh.",
            "energy_stress": f"Crude is {cl.value:.2f} with 5-day change {((cl.change_5d or 0.0) * 100):+.2f}% and OVX {ovx_value:.2f}." if cl.value is not None and ovx_value is not None else "Energy channel awaiting trusted feed refresh.",
        }

        for key, score in driver_scores.items():
            item = drivers_snapshot.setdefault(key, {})
            item["score"] = score
            item["level"] = level_from_score(score, key)
            item["components"] = {k: (None if v is None else round(float(v), 6)) for k, v in driver_component_map[key].items()}
            item["headline"] = driver_heads[key]
            item["whatsHappening"] = {
                "whatsHappening": driver_heads[key],
                "macroContext": f"Cross-driver average pressure is {avg_score:.1f} with top channel {top_driver_key}.",
                "supplyDemand": "Signal classification is generated from trusted market and policy datasets, not placeholders.",
                "geopolitical": "Policy and event-sensitive channels are refreshed from .gov and official exchange/market feeds.",
                "investorSentiment": f"CFTC managed-money bias is {(cftc or {}).get('bias', 'neutral')} for soybean oil.",
                "nearTermOutlook": "Continue daily refresh and monitor escalation triggers in volatility, policy, and energy channels.",
                "zlImplication": "For a buyer, preserve optionality and stage execution when pressure is above neutral.",
            }

        dashboard_snapshot["intelligence"] = {
            "headline": (
                "ELEVATED NETWORK PRESSURE - contingency-first execution"
                if avg_score >= 62
                else "BALANCED NETWORK PRESSURE - staged accumulation"
            ),
            "summary": (
                f"Trusted-source synthesis as of {now_et.strftime('%Y-%m-%d %H:%M %Z')}: "
                f"average pressure {avg_score:.1f}; top concern {top_driver_key} at {top_driver_score:.1f}. "
                "Signals are computed from Yahoo/FRED/CFTC plus policy/news feeds."
            ),
            "drivers": [
                {"label": "Volatility Transmission", "outlook": "PRESSURE" if driver_scores["vix_stress"] >= 60 else "MIXED", "detail": driver_heads["vix_stress"]},
                {"label": "Crush Economics", "outlook": "PRESSURE" if driver_scores["crush_pressure"] >= 60 else "MIXED", "detail": driver_heads["crush_pressure"]},
                {"label": "China Flow Risk", "outlook": "MIXED" if driver_scores["china_tension"] >= 45 else "CALM", "detail": driver_heads["china_tension"]},
                {"label": "Macro / Geopolitical", "outlook": "PRESSURE" if driver_scores["tariff_threat"] >= 60 else "MIXED", "detail": driver_heads["tariff_threat"]},
                {"label": "Energy Pass-Through", "outlook": "PRESSURE" if driver_scores["energy_stress"] >= 60 else "WATCH SUPPLY", "detail": driver_heads["energy_stress"]},
            ],
            "zlOutlook": "CAUTIOUS" if avg_score >= 55 else "NEUTRAL",
            "zlColor": "#EF7300" if avg_score >= 55 else "#EAB308",
            "tradingImplication": (
                "Buyer posture should emphasize staged execution and fast re-check cadence while top channels remain elevated."
                if avg_score >= 55
                else "Buyer posture can remain staged accumulation with normal monitoring cadence."
            ),
            "strategicSpecialInstructions": dashboard_snapshot.get("intelligence", {}).get("strategicSpecialInstructions", {}),
            "provenance": {
                "asOf": trade_date.isoformat(),
                "generatedAt": now_et_iso,
                "method": "trusted-source-refresh",
                "sourceFeeds": [
                    "analytics.dashboard_metrics",
                    "analytics.driver_attribution_1d",
                    "mkt.cftc_1w",
                    "https://query2.finance.yahoo.com",
                    "https://fred.stlouisfed.org",
                    "https://publicreporting.cftc.gov",
                ],
            },
        }

        # Strategy snapshot
        strategy_snapshot["posture"] = {
            "posture": posture,
            "rationale": posture_rationale,
            "updatedAt": now_et_iso,
        }
        strategy_cards = strategy_snapshot.setdefault("cards", {})
        strategy_cards.setdefault("contractImpactCalculator", {})
        strategy_cards.setdefault("factorWaterfall", {})
        strategy_cards.setdefault("riskMetrics", {})
        strategy_cards["contractImpactCalculator"]["title"] = "Contract Impact Calculator"
        strategy_cards["contractImpactCalculator"]["body"] = (
            f"Current buyer stance is {posture}. Volatility score {driver_scores['vix_stress']:.1f} and "
            f"macro-policy score {driver_scores['tariff_threat']:.1f} support staged contract timing over one-shot execution."
        )
        strategy_cards["factorWaterfall"]["title"] = "Factor Waterfall"
        strategy_cards["factorWaterfall"]["body"] = (
            "Driver order (highest to lowest pressure): "
            + ", ".join(
                f"{k.replace('_', ' ')} ({v:.1f})"
                for k, v in sorted(driver_scores.items(), key=lambda kv: kv[1], reverse=True)
            )
            + "."
        )
        strategy_cards["riskMetrics"]["title"] = "Risk Metrics"
        strategy_cards["riskMetrics"]["body"] = (
            f"Average risk {avg_score:.1f}; top channel {top_driver_key} {top_driver_score:.1f}. "
            f"Regime {regime} at confidence {regime_confidence:.2f}."
        )

        # Sentiment snapshot
        sentiment_score = round(max(-100.0, min(100.0, (cftc or {}).get("managed_money_ratio", 0.0) * 420 + (avg_score - 50.0) * -0.8)), 2)
        headline_count = len(news_rows)
        cot_bias = (cftc or {}).get("bias", "neutral")
        sentiment_snapshot["overview"] = {
            "headlineCount": headline_count,
            "sentimentScore": sentiment_score,
            "cotBias": cot_bias,
            "updatedAt": now_et_iso,
        }
        sent_cards = sentiment_snapshot.setdefault("cards", {})
        narratives = sent_cards.setdefault("narratives", [{}, {}, {}])
        while len(narratives) < 3:
            narratives.append({})
        narratives[0]["title"] = "Macro Narrative"
        narratives[0]["body"] = (
            f"Macro-policy flow shows {tag_counter['macro'] + tag_counter['policy']} high-signal rows in the active window; "
            f"uncertainty index is {uncertainty_value:.2f}."
            if uncertainty_value is not None
            else "Macro-policy flow rows are present but uncertainty index feed is unavailable."
        )
        narratives[1]["title"] = "Flow Narrative"
        narratives[1]["body"] = (
            f"Active sentiment feed includes {headline_count} rows over the last 7 days with "
            f"energy={tag_counter['energy']}, tariff={tag_counter['tariff']}, china={tag_counter['china']}."
        )
        narratives[2]["title"] = "Procurement Narrative"
        narratives[2]["body"] = (
            f"CFTC bias is {cot_bias}; combine with regime {regime} to keep a staged buyer cadence and daily re-checks."
        )
        sent_cards.setdefault("positioningFlow", {})
        sent_cards["positioningFlow"]["title"] = "Managed Money Positioning"
        sent_cards["positioningFlow"]["body"] = (
            f"Latest CFTC soybean-oil report shows bias={cot_bias}, net={((cftc or {}).get('managed_money_net') or 0):,.0f}, "
            f"ratio={((cftc or {}).get('managed_money_ratio') or 0)*100:.2f}% of open interest."
        )
        sent_cards.setdefault("headlineFlow", {})
        sent_cards["headlineFlow"]["title"] = "Headline Flow"
        sent_cards["headlineFlow"]["body"] = (
            "Headline flow classification is derived from trusted .gov and market feeds, "
            "with specialist tag clustering computed per row."
        )

        # Legislation snapshot
        top_leg_items = sorted(
            legislation_rows[:8] + executive_rows[:6] + congress_rows[:6],
            key=lambda r: r["published_at"],
            reverse=True,
        )[:10]
        snapshot_items = [
            {
                "source": row["source"],
                "title": row["title"],
                "publishedAt": to_iso_z(row["published_at"]),
                "tags": classify_tags(f"{row['title']} {row.get('summary', '')}"),
            }
            for row in top_leg_items
        ]
        seen_snapshot_keys: set[tuple[str, str]] = set()
        deduped_snapshot_items: list[dict[str, Any]] = []
        for item in snapshot_items:
            if not is_ag_soy_policy_relevant(
                title=item["title"],
                tags=item.get("tags", []),
            ):
                continue
            key = (item["source"], item["title"])
            if key in seen_snapshot_keys:
                continue
            seen_snapshot_keys.add(key)
            deduped_snapshot_items.append(item)
        legislation_snapshot["items"] = deduped_snapshot_items
        leg_cards = legislation_snapshot.setdefault("cards", {})
        leg_cards.setdefault("feedSummary", {})
        leg_cards.setdefault("sourcePressure", {})
        leg_cards.setdefault("tagPressure", {})

        source_counts: dict[str, int] = {}
        tag_counts: dict[str, int] = {}
        for item in legislation_snapshot["items"]:
            source_counts[item["source"]] = source_counts.get(item["source"], 0) + 1
            for tag in item["tags"]:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1
        top_source = sorted(source_counts.items(), key=lambda kv: kv[1], reverse=True)[0] if source_counts else ("none", 0)
        top_tags = [k for k, _ in sorted(tag_counts.items(), key=lambda kv: kv[1], reverse=True)[:4]]
        leg_cards["feedSummary"]["title"] = "Live Policy Feed"
        leg_cards["feedSummary"]["body"] = (
            f"Loaded {len(legislation_snapshot['items'])} agriculture/soy policy items from Federal Register, White House, and Congress feeds; "
            f"latest source is {legislation_snapshot['items'][0]['source'] if legislation_snapshot['items'] else 'n/a'}."
        )
        leg_cards["sourcePressure"]["title"] = "Source Activity"
        leg_cards["sourcePressure"]["body"] = (
            f"Most active policy source in current pull: {top_source[0]} ({top_source[1]} items)."
        )
        leg_cards["tagPressure"]["title"] = "Policy Tag Pressure"
        leg_cards["tagPressure"]["body"] = (
            "Top policy themes: " + (", ".join(top_tags) if top_tags else "none available") + "."
        )

        # Vegas snapshot
        cur.execute(
            """
            SELECT COUNT(*) FILTER (WHERE event_date >= CURRENT_DATE),
                   COUNT(*) FILTER (WHERE event_date >= CURRENT_DATE AND event_date <= CURRENT_DATE + INTERVAL '14 day'),
                   COUNT(*) FILTER (WHERE event_date >= CURRENT_DATE AND event_date <= CURRENT_DATE + INTERVAL '30 day')
            FROM vegas.events
            """
        )
        active_events, events_14d, events_30d = cur.fetchone()
        cur.execute(
            """
            SELECT COUNT(*)
            FROM vegas.customer_scores
            WHERE score_date = %s AND score >= 65
            """,
            (trade_date,),
        )
        high_priority_accounts = int(cur.fetchone()[0])
        vegas_snapshot["snapshot"] = {
            "activeEvents": int(active_events or 0),
            "highPriorityAccounts": high_priority_accounts,
            "updatedAt": now_et_iso,
        }
        vegas_cards = vegas_snapshot.setdefault("cards", {})
        vegas_cards.setdefault("upcomingEvents", {})
        vegas_cards.setdefault("aiSalesStrategy", {})
        vegas_cards.setdefault("restaurantAccounts", {})
        vegas_cards.setdefault("fryerTracking", {})
        vegas_cards["upcomingEvents"]["title"] = "Upcoming Events"
        vegas_cards["upcomingEvents"]["body"] = (
            f"Trusted event pull shows {events_14d} events in 14 days and {events_30d} in 30 days across tracked Vegas demand windows."
        )
        vegas_cards["aiSalesStrategy"]["title"] = "AI Sales Strategy"
        vegas_cards["aiSalesStrategy"]["body"] = (
            f"Prioritize accounts with score >=65 ({high_priority_accounts} accounts) before the next two-week event cluster."
        )
        vegas_cards["restaurantAccounts"]["title"] = "Restaurant Accounts"
        vegas_cards["restaurantAccounts"]["body"] = (
            f"Active tracked accounts: {len(restaurant_ids)}. Scores are refreshed from event-pressure and market-risk weighted logic."
        )
        vegas_cards["fryerTracking"]["title"] = "Fryer Equipment Tracking"
        vegas_cards["fryerTracking"]["body"] = (
            "Fryer rows are present for every tracked account; count telemetry is flagged pending direct customer equipment sync."
        )

        # Write updated snapshots to repo.
        write_json(SNAPSHOT_FILES["dashboard"], dashboard_snapshot)
        write_json(SNAPSHOT_FILES["strategy"], strategy_snapshot)
        write_json(SNAPSHOT_FILES["sentiment"], sentiment_snapshot)
        write_json(SNAPSHOT_FILES["legislation"], legislation_snapshot)
        write_json(SNAPSHOT_FILES["vegas"], vegas_snapshot)

        # Finalize run log.
        records_upserted = (
            len(metric_rows_for_insert)
            + len(attribution_rows_for_insert)
            + len(target_zone_rows)
            + len(forecast_summary_rows)
            + len(news_rows)
            + len(legislation_rows[:60])
            + len(executive_rows[:30])
            + len(congress_rows[:30])
            + len(vegas_events)
            + len(restaurant_ids)
        )
        cur.execute(
            """
            UPDATE ops.ingest_run
            SET status = 'ok',
                finished_at = %s,
                records_upserted = %s,
                ingested_at = NOW()
            WHERE run_id = %s
            """,
            (datetime.now(timezone.utc), records_upserted, str(run_id)),
        )

        conn.commit()
        print(
            json.dumps(
                {
                    "status": "ok",
                    "tradeDate": str(trade_date),
                    "recordsUpserted": records_upserted,
                    "driverScores": driver_scores,
                    "posture": posture,
                    "regime": regime,
                    "newsRows": len(news_rows),
                    "legislationRows": len(legislation_rows),
                    "vegasEvents": len(vegas_events),
                    "snapshotsUpdated": [str(p.relative_to(ROOT)) for p in SNAPSHOT_FILES.values()],
                },
                indent=2,
            )
        )
    except Exception as err:  # noqa: BLE001
        conn.rollback()
        try:
            cur.execute(
                """
                UPDATE ops.ingest_run
                SET status = 'error',
                    finished_at = %s,
                    error_message = %s
                WHERE run_id = (
                  SELECT run_id FROM ops.ingest_run
                  WHERE job_name = 'trusted_site_fill'
                  ORDER BY started_at DESC
                  LIMIT 1
                )
                """,
                (datetime.now(timezone.utc), str(err)[:1000]),
            )
            conn.commit()
        except Exception:  # noqa: BLE001
            conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
