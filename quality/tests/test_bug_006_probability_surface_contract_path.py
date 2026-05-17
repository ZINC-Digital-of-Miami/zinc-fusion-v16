from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.xfail(strict=True, reason="BUG-006: remove marker after applying quality/patches/BUG-006-fix.patch")
def test_bug_006_probability_surface_uses_canonical_target_zones_contract() -> None:
    source = (ROOT / "components/dashboard/ProbabilitySurface.tsx").read_text(encoding="utf-8")

    assert '/api/zl/target-zones' in source
    assert '/api/zl/forecast-targets' not in source
    assert 'json.data' in source
