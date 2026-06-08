#!/usr/bin/env python3
"""Sync live Vegas Glide operational data into cloud Supabase.

Glide is read-only. This script fetches the eight Vegas operational tables,
lands the five missing raw tables, and rebuilds the serving-side
`vegas.restaurants`, `vegas.casinos`, and `vegas.fryers` rows from verified
Glide data only.
"""

from __future__ import annotations

import json
import os
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg2
import requests
from psycopg2.extras import Json, execute_values

GLIDE_API_ENDPOINT = "https://api.glideapp.io/api/function/queryTables"
GLIDE_APP_ID = "6262JQJdNjhra79M25e4"

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ENV_PATH = REPO_ROOT / ".env.local"
V15_TOKEN_FALLBACK = Path("/Volumes/Satechi Hub/ZINC-FUSION-V15/frontend/.env.production")


@dataclass(frozen=True)
class GlideTableConfig:
    name: str
    table_id: str
    raw_target: str | None = None


GLIDE_TABLES: tuple[GlideTableConfig, ...] = (
    GlideTableConfig("restaurants", "native-table-ojIjQjDcDAEOpdtZG5Ao"),
    GlideTableConfig("casinos", "native-table-Gy2xHsC7urEttrz80hS7"),
    GlideTableConfig("fryers", "native-table-r2BIqSLhezVbOKGeRJj8"),
    GlideTableConfig("export_list", "native-table-PLujVF4tbbiIi9fzrWg8", "export_list"),
    GlideTableConfig("scheduled_reports", "native-table-pF4uWe5mpzoeGZbDQhPK", "scheduled_reports"),
    GlideTableConfig("shifts", "native-table-K53E3SQsgOUB4wdCJdAN", "shifts"),
    GlideTableConfig("shift_casinos", "native-table-G7cMiuqRgWPhS0ICRRyy", "shift_casinos"),
    GlideTableConfig("shift_restaurants", "native-table-QgzI2S9pWL584rkOhWBA", "shift_restaurants"),
)


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


def resolve_db_url() -> str:
    file_env = read_env_file(DEFAULT_ENV_PATH)
    for key in ("POSTGRES_URL_NON_POOLING", "DATABASE_URL", "SUPABASE_DB_URL"):
        value = os.getenv(key) or file_env.get(key)
        if value:
            return value
    raise RuntimeError(
        "Missing database URL in POSTGRES_URL_NON_POOLING, DATABASE_URL, or SUPABASE_DB_URL."
    )


def resolve_glide_token() -> str:
    if os.getenv("GLIDE_BEARER_TOKEN"):
        return os.environ["GLIDE_BEARER_TOKEN"]
    file_env = read_env_file(DEFAULT_ENV_PATH)
    if file_env.get("GLIDE_BEARER_TOKEN"):
        return file_env["GLIDE_BEARER_TOKEN"]
    fallback_env = read_env_file(V15_TOKEN_FALLBACK)
    if fallback_env.get("GLIDE_BEARER_TOKEN"):
        return fallback_env["GLIDE_BEARER_TOKEN"]
    raise RuntimeError("Missing GLIDE_BEARER_TOKEN in environment and fallback env files.")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


WORD_NUMBER_MAP: dict[str, float] = {
    "one": 1,
    "once": 1,
    "two": 2,
    "twice": 2,
    "three": 3,
    "thrice": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
}

DAY_TOKENS: tuple[str, ...] = (
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "mon",
    "tue",
    "tues",
    "wed",
    "thu",
    "thur",
    "thurs",
    "fri",
    "sat",
    "sun",
)


def service_changes_per_week(frequency: Any, days: Any) -> float | None:
    """Deterministic Glide-only oil-change cadence model.

    Mirrors lib/vegas/normalizeVegasIntel.ts so the stored derived value matches
    the value the API recomputes. Returns None when the schedule is not
    populated; callers must not guess.
    """
    freq = str(frequency).strip().lower() if isinstance(frequency, str) else ""
    day_text = str(days).strip().lower() if isinstance(days, str) else ""

    if day_text:
        day_count = sum(
            len(re.findall(rf"(?<![a-z]){token}(?![a-z])", day_text)) for token in DAY_TOKENS
        )
        if day_count > 0:
            return min(7.0, float(day_count))

    if not freq:
        return None
    if "daily" in freq or "every day" in freq:
        return 7.0
    if "weekly" in freq or "once" in freq:
        return 1.0
    if "biweekly" in freq or "bi-weekly" in freq or "every other week" in freq:
        return 0.5
    if "monthly" in freq:
        return 0.25

    for word, value in WORD_NUMBER_MAP.items():
        if re.search(rf"(?<![a-z]){word}(?![a-z])", freq):
            return min(7.0, float(value))

    numeric_match = re.search(r"(\d+(?:\.\d+)?)", freq)
    if numeric_match:
        parsed = float(numeric_match.group(1))
        if parsed > 0:
            return min(7.0, parsed)

    return None


def estimate_oil_lbs_per_week(
    total_capacity_lbs: float | None, changes_per_week: float | None
) -> int | None:
    """Estimated weekly soybean-oil volume from verified Glide fryer capacity and cadence."""
    if total_capacity_lbs is None or total_capacity_lbs <= 0:
        return None
    if changes_per_week is None or changes_per_week <= 0:
        return None
    return round(total_capacity_lbs * changes_per_week)


def fetch_glide_rows(session: requests.Session, table_id: str) -> list[dict[str, Any]]:
    response = session.post(
        GLIDE_API_ENDPOINT,
        json={"appID": GLIDE_APP_ID, "queries": [{"tableName": table_id, "utc": True}]},
        timeout=60,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list) or not payload or "rows" not in payload[0]:
        raise RuntimeError(f"Unexpected Glide response shape for table {table_id}.")
    rows = payload[0]["rows"]
    if not isinstance(rows, list):
        raise RuntimeError(f"Unexpected Glide rows payload for table {table_id}.")
    return rows


def load_glide_snapshot() -> dict[str, list[dict[str, Any]]]:
    token = resolve_glide_token()
    session = requests.Session()
    session.headers.update(
        {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
    )
    snapshot: dict[str, list[dict[str, Any]]] = {}
    for config in GLIDE_TABLES:
        snapshot[config.name] = fetch_glide_rows(session, config.table_id)
    return snapshot


def replace_raw_table(
    cur: psycopg2.extensions.cursor,
    target_table: str,
    source_table_id: str,
    rows: list[dict[str, Any]],
    synced_at: str,
) -> int:
    cur.execute(f"DELETE FROM vegas.{target_table}")
    records = [
        (
            row.get("$rowID"),
            source_table_id,
            Json(row),
            synced_at,
        )
        for row in rows
        if row.get("$rowID")
    ]
    if records:
        execute_values(
            cur,
            f"""
            INSERT INTO vegas.{target_table} (glide_row_id, source_table_id, data, synced_at)
            VALUES %s
            """,
            records,
            template="(%s, %s, %s, %s)",
            page_size=1000,
        )
    return len(records)


def group_export_counts(export_rows: list[dict[str, Any]]) -> tuple[dict[str, int], dict[str, bool]]:
    count_by_restaurant: dict[str, int] = defaultdict(int)
    listed_by_restaurant: dict[str, bool] = {}
    for row in export_rows:
        restaurant_row_id = row.get("5Ioj7")
        if not isinstance(restaurant_row_id, str) or not restaurant_row_id:
            continue
        count_by_restaurant[restaurant_row_id] += 1
        explicit = row.get("fNgQh")
        listed_by_restaurant[restaurant_row_id] = (
            str(explicit).strip().lower() == "yes" if explicit is not None else True
        )
    return dict(count_by_restaurant), listed_by_restaurant


def group_shift_counts(shift_restaurant_rows: list[dict[str, Any]]) -> dict[str, int]:
    count_by_restaurant: dict[str, int] = defaultdict(int)
    for row in shift_restaurant_rows:
        restaurant_row_id = row.get("ZgFC9")
        if not isinstance(restaurant_row_id, str) or not restaurant_row_id:
            continue
        count_by_restaurant[restaurant_row_id] += 1
    return dict(count_by_restaurant)


def group_fryer_metrics(
    fryer_rows: list[dict[str, Any]]
) -> tuple[dict[str, int], dict[str, float], dict[str, list[str]]]:
    count_by_restaurant: dict[str, int] = defaultdict(int)
    capacity_by_restaurant: dict[str, float] = defaultdict(float)
    labels_by_restaurant: dict[str, list[str]] = defaultdict(list)
    for row in fryer_rows:
        restaurant_row_id = row.get("2uBBn")
        if not isinstance(restaurant_row_id, str) or not restaurant_row_id:
            continue
        count_by_restaurant[restaurant_row_id] += 1
        capacity = row.get("xhrM0")
        if isinstance(capacity, (int, float)):
            capacity_by_restaurant[restaurant_row_id] += float(capacity)
        label = row.get("Name")
        if isinstance(label, str) and label:
            labels_by_restaurant[restaurant_row_id].append(label)
    return dict(count_by_restaurant), dict(capacity_by_restaurant), dict(labels_by_restaurant)


def sync_casinos(
    cur: psycopg2.extensions.cursor,
    casino_rows: list[dict[str, Any]],
    synced_at: str,
) -> int:
    cur.execute("DELETE FROM vegas.casinos")
    records = []
    for row in casino_rows:
        casino_name = row.get("Name")
        glide_row_id = row.get("$rowID")
        if not isinstance(casino_name, str) or not casino_name or not isinstance(glide_row_id, str):
            continue
        metadata = {
            "source": "glide",
            "synced_at": synced_at,
            "glide_row_id": glide_row_id,
            "glide_data": row,
            "address": row.get("L9K9x"),
        }
        records.append((casino_name, Json(metadata)))
    if records:
        execute_values(
            cur,
            """
            INSERT INTO vegas.casinos (casino_name, metadata)
            VALUES %s
            """,
            records,
            template="(%s, %s)",
            page_size=1000,
        )
    return len(records)


def sync_restaurants(
    cur: psycopg2.extensions.cursor,
    restaurant_rows: list[dict[str, Any]],
    export_count_by_restaurant: dict[str, int],
    listed_by_restaurant: dict[str, bool],
    shift_count_by_restaurant: dict[str, int],
    fryer_count_by_restaurant: dict[str, int],
    capacity_by_restaurant: dict[str, float],
    synced_at: str,
) -> dict[str, int]:
    cur.execute("DELETE FROM vegas.restaurants")
    records = []
    for row in restaurant_rows:
        glide_row_id = row.get("$rowID")
        restaurant_name = row.get("MHXYO") or row.get("Name")
        if not isinstance(glide_row_id, str) or not glide_row_id:
            continue
        if not isinstance(restaurant_name, str) or not restaurant_name:
            continue
        export_count = export_count_by_restaurant.get(glide_row_id, 0)
        shift_count = shift_count_by_restaurant.get(glide_row_id, 0)
        fryer_count = fryer_count_by_restaurant.get(glide_row_id)
        total_capacity = capacity_by_restaurant.get(glide_row_id)
        service_frequency = row.get("Po4Zg")
        service_days = row.get("lf0gF")
        changes_per_week = service_changes_per_week(service_frequency, service_days)
        estimated_oil_lbs_per_week = estimate_oil_lbs_per_week(total_capacity, changes_per_week)
        metadata = {
            "source": "glide",
            "synced_at": synced_at,
            "glide_row_id": glide_row_id,
            "glide_data": row,
            "casino_glide_row_id": row.get("2Ca0T"),
            "service_frequency": service_frequency,
            "service_days": service_days,
            "oil_type": row.get("U0Jf2"),
            "oil_form": row.get("0RcWz"),
            "contact_person": row.get("Ie35Z") or row.get("doeXs"),
            "contact_email": row.get("maCR5") or row.get("a3ffP"),
            "shift_count": shift_count,
            "assigned_shift_count": shift_count,
            "export_list_count": export_count,
            "exportListed": listed_by_restaurant.get(glide_row_id, bool(row.get("Ny3eQ")) or export_count > 0),
            "fryer_count": fryer_count,
            "total_capacity_lbs": total_capacity,
            "changes_per_week": changes_per_week,
            "estimated_oil_lbs_per_week": estimated_oil_lbs_per_week,
        }
        account_status = row.get("s8tNr") if isinstance(row.get("s8tNr"), str) else "Open"
        records.append((restaurant_name, account_status, Json(metadata)))
    inserted_ids: dict[str, int] = {}
    if records:
        execute_values(
            cur,
            """
            INSERT INTO vegas.restaurants (restaurant_name, account_status, metadata)
            VALUES %s
            """,
            records,
            template="(%s, %s, %s)",
            page_size=1000,
        )
        cur.execute("SELECT id, metadata->>'glide_row_id' FROM vegas.restaurants")
        inserted_ids = {glide_row_id: restaurant_id for restaurant_id, glide_row_id in cur.fetchall() if glide_row_id}
    return inserted_ids


def sync_fryers(
    cur: psycopg2.extensions.cursor,
    fryer_rows: list[dict[str, Any]],
    restaurant_ids_by_glide_row_id: dict[str, int],
    synced_at: str,
) -> int:
    cur.execute("DELETE FROM vegas.fryers")
    grouped: dict[str, dict[str, Any]] = {}
    for row in fryer_rows:
        glide_restaurant_row_id = row.get("2uBBn")
        if not isinstance(glide_restaurant_row_id, str) or glide_restaurant_row_id not in restaurant_ids_by_glide_row_id:
            continue
        bucket = grouped.setdefault(
            glide_restaurant_row_id,
            {
                "count": 0,
                "capacity": 0.0,
                "names": [],
                "glide_row_ids": [],
            },
        )
        bucket["count"] += 1
        capacity = row.get("xhrM0")
        if isinstance(capacity, (int, float)):
            bucket["capacity"] += float(capacity)
        label = row.get("Name")
        if isinstance(label, str) and label:
            bucket["names"].append(label)
        glide_row_id = row.get("$rowID")
        if isinstance(glide_row_id, str) and glide_row_id:
            bucket["glide_row_ids"].append(glide_row_id)

    records = []
    for glide_restaurant_row_id, bucket in grouped.items():
        metadata = {
            "source": "glide",
            "synced_at": synced_at,
            "glide_restaurant_row_id": glide_restaurant_row_id,
            "total_capacity_lbs": bucket["capacity"],
            "fryer_labels": bucket["names"],
            "glide_fryer_row_ids": bucket["glide_row_ids"],
        }
        records.append(
            (
                restaurant_ids_by_glide_row_id[glide_restaurant_row_id],
                bucket["count"],
                Json(metadata),
            )
        )
    if records:
        execute_values(
            cur,
            """
            INSERT INTO vegas.fryers (restaurant_id, fryer_count, metadata)
            VALUES %s
            """,
            records,
            template="(%s, %s, %s)",
            page_size=1000,
        )
    return len(records)


def main() -> None:
    synced_at = now_iso()
    snapshot = load_glide_snapshot()

    export_count_by_restaurant, listed_by_restaurant = group_export_counts(snapshot["export_list"])
    shift_count_by_restaurant = group_shift_counts(snapshot["shift_restaurants"])
    fryer_count_by_restaurant, capacity_by_restaurant, _ = group_fryer_metrics(snapshot["fryers"])

    db_url = resolve_db_url()
    with psycopg2.connect(db_url, connect_timeout=10, application_name="sync_vegas_glide_to_supabase") as conn:
        with conn.cursor() as cur:
            raw_counts: dict[str, int] = {}
            for config in GLIDE_TABLES:
                if config.raw_target is None:
                    continue
                raw_counts[config.raw_target] = replace_raw_table(
                    cur,
                    config.raw_target,
                    config.table_id,
                    snapshot[config.name],
                    synced_at,
                )

            casinos_count = sync_casinos(cur, snapshot["casinos"], synced_at)
            restaurant_ids = sync_restaurants(
                cur,
                snapshot["restaurants"],
                export_count_by_restaurant,
                listed_by_restaurant,
                shift_count_by_restaurant,
                fryer_count_by_restaurant,
                capacity_by_restaurant,
                synced_at,
            )
            fryers_count = sync_fryers(cur, snapshot["fryers"], restaurant_ids, synced_at)

        conn.commit()

    summary = {
        "syncedAt": synced_at,
        "restaurants": len(snapshot["restaurants"]),
        "casinos": casinos_count,
        "fryersRaw": len(snapshot["fryers"]),
        "fryersServing": fryers_count,
        "exportList": raw_counts.get("export_list", 0),
        "scheduledReports": raw_counts.get("scheduled_reports", 0),
        "shifts": raw_counts.get("shifts", 0),
        "shiftCasinos": raw_counts.get("shift_casinos", 0),
        "shiftRestaurants": raw_counts.get("shift_restaurants", 0),
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
