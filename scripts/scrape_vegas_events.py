#!/usr/bin/env python3
"""AI-backed Las Vegas event extractor for vegas.events.

Provides the approved replacement path for the older regex-based
VEGAS_EVENT_SOURCES fill-script event refresh. Fetches public Las Vegas event
listing pages, asks an OpenRouter model to extract structured events, and
(only with --commit) upserts them into cloud Supabase vegas.events.

Safety:
- Read-only by default. Without --commit the script fetches, extracts, and
  prints the structured events as JSON; it performs no database writes.
- Cloud writes (--commit) and OpenRouter calls cost money / mutate state, so run
  them only with explicit approval.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import psycopg2
import requests
from psycopg2.extras import Json

OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_OPENROUTER_EVENTS_MODEL = "nvidia/nemotron-3-super-120b-a12b:free"

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ENV_PATH = REPO_ROOT / ".env.local"

# Public Las Vegas event listing pages. Override with --sources or
# VEGAS_EVENT_SOURCE_URLS (comma-separated).
DEFAULT_SOURCE_URLS: tuple[str, ...] = (
    "https://www.visitlasvegas.com/events/",
    "https://www.vegas.com/shows/",
)

# Categories the page understands (lib/vegas/normalizeVegasIntel.ts normalizes
# anything else into a safe default).
ALLOWED_CATEGORIES = (
    "convention",
    "conference",
    "sports",
    "entertainment",
    "festival",
    "food",
    "holiday",
    "community",
)

MAX_PAGE_CHARS = 12000


def read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def env_value(key: str, file_env: dict[str, str]) -> str | None:
    return os.getenv(key) or file_env.get(key)


def resolve_db_url(file_env: dict[str, str]) -> str:
    for key in ("POSTGRES_URL_NON_POOLING", "DATABASE_URL", "SUPABASE_DB_URL"):
        value = env_value(key, file_env)
        if value:
            return value
    raise RuntimeError(
        "Missing database URL in POSTGRES_URL_NON_POOLING, DATABASE_URL, or SUPABASE_DB_URL."
    )


def resolve_openrouter_key(file_env: dict[str, str]) -> str:
    key = env_value("OPENROUTER_API_KEY", file_env)
    if not key:
        raise RuntimeError("Missing OPENROUTER_API_KEY in environment and .env.local.")
    return key


def resolve_model(file_env: dict[str, str], cli_model: str | None) -> str:
    if cli_model:
        return cli_model
    return env_value("OPENROUTER_EVENTS_MODEL", file_env) or DEFAULT_OPENROUTER_EVENTS_MODEL


def resolve_source_urls(file_env: dict[str, str], cli_sources: list[str] | None) -> list[str]:
    if cli_sources:
        return cli_sources
    raw = env_value("VEGAS_EVENT_SOURCE_URLS", file_env)
    if raw:
        return [u.strip() for u in raw.split(",") if u.strip()]
    return list(DEFAULT_SOURCE_URLS)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def fetch_page_text(session: requests.Session, url: str) -> str:
    response = session.get(url, timeout=30, headers={"User-Agent": "ZINC-Fusion-V16 event scraper"})
    response.raise_for_status()
    html = response.text
    html = re.sub(r"<script\b[^>]*>.*?</script>", " ", html, flags=re.IGNORECASE | re.DOTALL)
    html = re.sub(r"<style\b[^>]*>.*?</style>", " ", html, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:MAX_PAGE_CHARS]


def openrouter_headers(api_key: str, file_env: dict[str, str]) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    referer = env_value("OPENROUTER_APP_REFERER", file_env) or env_value(
        "NEXT_PUBLIC_SITE_URL", file_env
    )
    if referer:
        headers["HTTP-Referer"] = referer
    headers["X-Title"] = env_value("OPENROUTER_APP_TITLE", file_env) or "ZINC Fusion V16 Vegas Events"
    return headers


def strip_code_fence(value: str) -> str:
    trimmed = value.strip()
    if not trimmed.startswith("```"):
        return trimmed
    trimmed = re.sub(r"^```(?:json)?\s*", "", trimmed, flags=re.IGNORECASE)
    trimmed = re.sub(r"\s*```$", "", trimmed)
    return trimmed.strip()


def parse_events_array(text: str) -> list[dict[str, Any]]:
    unfenced = strip_code_fence(text)
    candidates = [unfenced]
    start = unfenced.find("[")
    end = unfenced.rfind("]")
    if start >= 0 and end > start:
        candidates.append(unfenced[start : end + 1])
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and isinstance(parsed.get("events"), list):
            return [e for e in parsed["events"] if isinstance(e, dict)]
        if isinstance(parsed, list):
            return [e for e in parsed if isinstance(e, dict)]
    return []


def extract_events_for_source(
    session: requests.Session,
    api_key: str,
    model: str,
    file_env: dict[str, str],
    url: str,
    page_text: str,
) -> list[dict[str, Any]]:
    system_prompt = (
        "You extract upcoming Las Vegas events from public event listing text for a soybean-oil "
        "procurement sales tool. Use only facts present in the supplied text. Do not invent events, "
        "dates, venues, or attendance. Return JSON only: an array under key \"events\". Each event: "
        "{\"event_name\": string, \"start_date\": \"YYYY-MM-DD\", \"end_date\": \"YYYY-MM-DD\"|null, "
        "\"venue\": string|null, \"category\": one of "
        + json.dumps(list(ALLOWED_CATEGORIES))
        + ", \"attendance_estimate\": integer|null, \"location\": string|null}. "
        "Only include events with a resolvable start date. If none, return an empty array."
    )
    body = {
        "model": model,
        "temperature": 0.1,
        "max_tokens": 1800,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": json.dumps({"source_url": url, "listing_text": page_text}),
            },
        ],
    }
    response = session.post(
        OPENROUTER_CHAT_COMPLETIONS_URL,
        headers=openrouter_headers(api_key, file_env),
        json=body,
        timeout=60,
    )
    response.raise_for_status()
    payload = response.json()
    choices = payload.get("choices") if isinstance(payload, dict) else None
    if not isinstance(choices, list) or not choices:
        return []
    content = choices[0].get("message", {}).get("content", "")
    if isinstance(content, list):
        content = " ".join(
            part.get("text", "") for part in content if isinstance(part, dict)
        )
    if not isinstance(content, str):
        return []
    return parse_events_array(content)


def parse_iso_date(value: Any) -> date | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.strptime(value.strip()[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def normalize_event(raw: dict[str, Any], url: str, synced_at: str, model: str) -> dict[str, Any] | None:
    name = raw.get("event_name")
    start = parse_iso_date(raw.get("start_date"))
    if not isinstance(name, str) or not name.strip() or start is None:
        return None
    end = parse_iso_date(raw.get("end_date"))
    category = raw.get("category")
    if category not in ALLOWED_CATEGORIES:
        category = "community"
    attendance = raw.get("attendance_estimate")
    attendance = int(attendance) if isinstance(attendance, (int, float)) else None
    venue = raw.get("venue") if isinstance(raw.get("venue"), str) else None
    location = raw.get("location") if isinstance(raw.get("location"), str) else None
    return {
        "event_name": name.strip(),
        "event_date": start,
        "metadata": {
            "source": "openrouter-event-scrape",
            "method": "openrouter-event-scrape",
            "model": model,
            "url": url,
            "venue": venue,
            "location": location,
            "event_type": category,
            "category": category,
            "end_date": end.isoformat() if end else None,
            "predicted_attendance": attendance,
            "is_active": True,
            "asOf": synced_at,
        },
    }


def upsert_events(db_url: str, events: list[dict[str, Any]]) -> dict[str, int]:
    inserted = 0
    updated = 0
    with psycopg2.connect(
        db_url, connect_timeout=10, application_name="scrape_vegas_events"
    ) as conn:
        with conn.cursor() as cur:
            for evt in events:
                cur.execute(
                    "SELECT id FROM vegas.events WHERE event_name = %s AND event_date = %s",
                    (evt["event_name"], evt["event_date"]),
                )
                existing = cur.fetchone()
                if existing:
                    cur.execute(
                        "UPDATE vegas.events SET metadata = %s, ingested_at = NOW() WHERE id = %s",
                        (Json(evt["metadata"]), existing[0]),
                    )
                    updated += 1
                else:
                    cur.execute(
                        """
                        INSERT INTO vegas.events (event_name, event_date, metadata)
                        VALUES (%s, %s, %s)
                        """,
                        (evt["event_name"], evt["event_date"], Json(evt["metadata"])),
                    )
                    inserted += 1
        conn.commit()
    return {"inserted": inserted, "updated": updated}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commit", action="store_true", help="Write extracted events to vegas.events.")
    parser.add_argument("--model", help="OpenRouter model id override.")
    parser.add_argument("--sources", nargs="*", help="Override source listing URLs.")
    args = parser.parse_args()

    file_env = read_env_file(DEFAULT_ENV_PATH)
    api_key = resolve_openrouter_key(file_env)
    model = resolve_model(file_env, args.model)
    source_urls = resolve_source_urls(file_env, args.sources)
    synced_at = now_iso()

    session = requests.Session()
    extracted: dict[tuple[str, date], dict[str, Any]] = {}
    source_summaries: list[dict[str, Any]] = []
    for url in source_urls:
        try:
            page_text = fetch_page_text(session, url)
            raw_events = extract_events_for_source(
                session, api_key, model, file_env, url, page_text
            )
        except Exception as err:  # noqa: BLE001
            source_summaries.append({"url": url, "error": str(err)})
            continue
        kept = 0
        for raw in raw_events:
            normalized = normalize_event(raw, url, synced_at, model)
            if normalized is None:
                continue
            extracted[(normalized["event_name"], normalized["event_date"])] = normalized
            kept += 1
        source_summaries.append({"url": url, "extracted": len(raw_events), "kept": kept})

    events = sorted(extracted.values(), key=lambda e: e["event_date"])
    printable = [
        {**e, "event_date": e["event_date"].isoformat()} for e in events
    ]

    result: dict[str, Any] = {
        "syncedAt": synced_at,
        "model": model,
        "sources": source_summaries,
        "eventCount": len(events),
        "committed": False,
        "events": printable,
    }

    if args.commit:
        if not events:
            result["note"] = "No events extracted; nothing written."
        else:
            db_url = resolve_db_url(file_env)
            write_result = upsert_events(db_url, events)
            result["committed"] = True
            result["writeResult"] = write_result

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
