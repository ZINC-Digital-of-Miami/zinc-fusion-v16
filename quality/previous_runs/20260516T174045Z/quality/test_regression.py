"""Phase 3 regression tests for code-review confirmed bugs.

These tests assert the desired behavior and are xfail-marked while bugs remain open.
"""

from __future__ import annotations

import pathlib
import re

import pytest


ROOT = pathlib.Path(__file__).resolve().parents[1]


def read_text(relpath: str) -> str:
    return (ROOT / relpath).read_text(encoding="utf-8")


@pytest.mark.xfail(
    strict=True,
    reason="BUG-001: normalize ingest_run lifecycle to a single run_id across writers; unskip after applying quality/patches/BUG-001-fix.patch",
)
def test_bug_001_intraday_writer_uses_run_id_lifecycle_contract() -> None:
    sql = read_text("supabase/migrations/20260414001_ingest_zl_intraday.sql")
    assert "INSERT INTO ops.ingest_run (run_id, job_name, source, status, started_at" in sql


@pytest.mark.xfail(
    strict=True,
    reason="BUG-002: normalize ingest_run status vocabulary across SQL and TypeScript writers; unskip after applying quality/patches/BUG-002-fix.patch",
)
def test_bug_002_ingest_status_vocabulary_is_canonical_across_writers() -> None:
    ts = read_text("lib/server/ingest-run.ts")
    sql_intraday = read_text("supabase/migrations/20260414001_ingest_zl_intraday.sql")
    sql_trusted = read_text("supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql")

    expected = {"running", "success", "failed"}

    ts_statuses = {
        status.lower()
        for status in re.findall(r'status:\s*"([A-Z_]+)"', ts)
    }
    sql_statuses = {
        status.lower()
        for status in re.findall(r"status\s*=\s*'([a-z_]+)'", sql_trusted)
    }
    sql_statuses.update(
        status.lower()
        for status in re.findall(r"VALUES \([^\)]*'([a-z_]+)'", sql_intraday)
        if status in {"ok", "failed"}
    )

    assert ts_statuses <= expected
    assert sql_statuses <= expected
    assert ts_statuses == sql_statuses


@pytest.mark.xfail(
    strict=True,
    reason="BUG-003: remove /api/cron auth bypass from proxy middleware; unskip after applying quality/patches/BUG-003-fix.patch",
)
def test_bug_003_proxy_has_no_api_cron_bypass_path() -> None:
    proxy = read_text("lib/supabase/proxy.ts")
    assert "isCronPath" not in proxy
    assert "/api/cron/" not in proxy


@pytest.mark.xfail(
    strict=True,
    reason="BUG-004: gate3 must validate pg_cron architecture without /api/cron route dependency; unskip after applying quality/patches/BUG-004-fix.patch",
)
def test_bug_004_gate3_does_not_require_api_cron_handler_files() -> None:
    gate3 = read_text("scripts/verify/gate3.sh")
    assert "app/api/cron" not in gate3
    assert "runCronHandler" not in gate3


@pytest.mark.xfail(
    strict=True,
    reason="BUG-005: intraday route must either implement 1m fallback or remove fallback claim; unskip after applying quality/patches/BUG-005-fix.patch",
)
def test_bug_005_intraday_fallback_claim_matches_implemented_query_path() -> None:
    route = read_text("app/api/zl/intraday/route.ts")
    has_fallback_claim = "fall back to 1-minute" in route.lower()
    has_1m_query = '.from("price_1m")' in route or ".from('price_1m')" in route
    assert (not has_fallback_claim) or has_1m_query


@pytest.mark.xfail(
    strict=True,
    reason="BUG-006: warning field optionality must align between contract and parity gate; unskip after applying quality/patches/BUG-006-fix.patch",
)
def test_bug_006_warning_optional_semantics_are_consistent_between_contract_and_gate() -> None:
    contract = read_text("lib/contracts/api.ts")
    gate6 = read_text("scripts/verify/gate6.sh")

    warning_optional = "warning?: string;" in contract
    gate_requires_warning = 'has("warning") and (.warning | type == "string")' in gate6

    assert not (warning_optional and gate_requires_warning)


@pytest.mark.xfail(
    strict=True,
    reason="BUG-007: forecast-targets envelope must be parity-governed or aligned to shared API envelope contract; unskip after applying quality/patches/BUG-007-fix.patch",
)
def test_bug_007_forecast_targets_envelope_is_covered_by_contract_or_parity_exception() -> None:
    forecast_targets = read_text("app/api/zl/forecast-targets/route.ts")
    gate6 = read_text("scripts/verify/gate6.sh")

    uses_shared_api_envelope = "ok:" in forecast_targets and "asOf:" in forecast_targets
    parity_covers_endpoint = "/api/zl/forecast-targets" in gate6

    assert uses_shared_api_envelope or parity_covers_endpoint


@pytest.mark.xfail(
    strict=True,
    reason="BUG-008: risk-factor API must not set canonical as_of_date to oldest component date; unskip after applying quality/patches/BUG-008-fix.patch",
)
def test_bug_008_risk_factors_do_not_use_oldest_component_as_canonical_as_of_date() -> None:
    risk_route = read_text("app/api/dashboard/risk-factors/route.ts")
    assert "const asOfDate = asOfDateMin;" not in risk_route


@pytest.mark.xfail(
    strict=True,
    reason="BUG-009: unknown horizon drops must be logged consistently across forecast surfaces; unskip after applying quality/patches/BUG-009-fix.patch",
)
def test_bug_009_unknown_horizons_are_not_silently_dropped() -> None:
    files = [
        "app/api/zl/forecast/route.ts",
        "app/api/zl/target-zones/route.ts",
        "app/api/zl/forecast-targets/route.ts",
    ]
    silent_drop = re.compile(r"if\s*\(!horizonDays\)\s*continue;")
    for relpath in files:
        text = read_text(relpath)
        assert silent_drop.search(text) is None, relpath


@pytest.mark.xfail(
    strict=True,
    reason="BUG-010: trusted-site-fill failure path must close the same run_id opened for that invocation; unskip after applying quality/patches/BUG-010-fix.patch",
)
def test_bug_010_trusted_site_fill_failure_updates_same_run_id() -> None:
    script = read_text("scripts/fill_site_with_trusted_data.py")

    # Contract: success and failure paths both key terminal updates to the active run_id.
    assert "WHERE run_id = (" not in script
