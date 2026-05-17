#!/usr/bin/env bash
set -euo pipefail

# PROBE-REQ002-OVERLAY (confirmation probe, expected FAIL assertion)
python3 - <<'PY'
from pathlib import Path

source = Path("components/chart/ZlCandlestickChart.tsx").read_text(encoding="utf-8")
try:
    assert "SHOW_FORECAST_TARGET_OVERLAY = true" in source, (
        "chart keeps SHOW_FORECAST_TARGET_OVERLAY disabled; target-zone primitive cannot render"
    )
except AssertionError as exc:
    print(f"PROBE-REQ002-OVERLAY: EXPECTED_FAIL confirmed -> {exc}")
else:
    raise SystemExit("PROBE-REQ002-OVERLAY unexpectedly passed; re-triage BUG-005")
PY

# PROBE-REQ002-SURFACE-CONTRACT (confirmation probe, expected FAIL assertion)
python3 - <<'PY'
from pathlib import Path

source = Path("components/dashboard/ProbabilitySurface.tsx").read_text(encoding="utf-8")
try:
    assert '/api/zl/target-zones' in source, (
        "probability surface is not bound to canonical /api/zl/target-zones path"
    )
    assert '/api/zl/forecast-targets' not in source, (
        "probability surface still depends on divergent /api/zl/forecast-targets contract"
    )
    assert "json.data" in source, (
        "probability surface does not parse canonical ApiEnvelope data field"
    )
except AssertionError as exc:
    print(f"PROBE-REQ002-SURFACE-CONTRACT: EXPECTED_FAIL confirmed -> {exc}")
else:
    raise SystemExit("PROBE-REQ002-SURFACE-CONTRACT unexpectedly passed; re-triage BUG-006")
PY

# PROBE-REQ005-AI-META (rejection proof, passing assertion)
python3 - <<'PY'
from pathlib import Path

strategy = Path("app/api/strategy/posture/route.ts").read_text(encoding="utf-8")
sentiment = Path("app/api/sentiment/overview/route.ts").read_text(encoding="utf-8")

assert "ai: toAiEnvelopeMeta(aiSnapshot)" in strategy, (
    "strategy route missing ai envelope metadata export"
)
assert "ai: toAiEnvelopeMeta(aiSnapshot)" in sentiment, (
    "sentiment route missing ai envelope metadata export"
)
print("PROBE-REQ005-AI-META: PASS (routes publish ai metadata; degraded-state claim downgraded)")
PY
