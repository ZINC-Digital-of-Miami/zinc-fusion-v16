#!/usr/bin/env bash
set -euo pipefail

# Probe 1 (confirmation probe, expected FAIL assertion):
# Claim under test (REQ-001): trusted-site fill failure path should update the same run_id.
# Evidence lines: scripts/fill_site_with_trusted_data.py lines 1848-1853 currently use a
# subquery by job_name instead of run_id.
python3 - <<'PY'
from pathlib import Path

text = Path("scripts/fill_site_with_trusted_data.py").read_text(encoding="utf-8")
start = text.rindex("except Exception as err")
end = text.index("finally:", start)
except_block = text[start:end]

# Expected-failing assertion confirms BUG-010 on current source.
try:
    assert "WHERE run_id = %s" in except_block, (
        "line 1848 currently is not `WHERE run_id = %s`; failure-path update is not keyed to local run_id"
    )
except AssertionError as exc:
    print(f"PROBE-REQ001-FAILPATH: EXPECTED_FAIL confirmed -> {exc}")
else:
    raise SystemExit("PROBE-REQ001-FAILPATH unexpectedly passed; re-triage BUG-010")
PY

# Probe 2 (rejection proof, passing assertion):
# Claim under test (auditor singleton): risk-factors API gives no fallback observability cues.
# Evidence lines: app/api/dashboard/risk-factors/route.ts lines 860-867 include explicit ai.enabled/source/meta.
python3 - <<'PY'
from pathlib import Path

text = Path("app/api/dashboard/risk-factors/route.ts").read_text(encoding="utf-8")
assert "enabled: Boolean(aiSnapshot)" in text, "line 861 missing ai.enabled indicator"
assert "source: aiSnapshot?.source ?? \"weekly-db-plus-ai-snapshot\"" in text, (
    "line 862 missing fallback source marker"
)
assert "generatedAt: aiSnapshot?.generatedAt ?? responseGeneratedAt" in text, (
    "line 865 missing generatedAt fallback marker"
)
print("PROBE-REQ004-AI-META: PASS (fallback observability markers are present in API envelope)")
PY

# Probe 3 (rejection proof, passing assertion):
# Claim under test (auditor singleton): strategy surface has no fallback visibility path.
# Evidence lines: app/api/strategy/posture/route.ts lines 293-297 include ai envelope metadata.
python3 - <<'PY'
from pathlib import Path

text = Path("app/api/strategy/posture/route.ts").read_text(encoding="utf-8")
assert "ai: toAiEnvelopeMeta(aiSnapshot)" in text, "line 296 missing strategy ai envelope metadata"
print("PROBE-REQ004-STRATEGY-AI-META: PASS (strategy API emits ai metadata for client-side fallback handling)")
PY
