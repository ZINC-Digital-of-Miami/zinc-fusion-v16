from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.xfail(strict=True, reason="BUG-005: remove marker after applying quality/patches/BUG-005-fix.patch")
def test_bug_005_chart_overlay_gate_is_enabled_when_target_zones_exist() -> None:
    source = (ROOT / "components/chart/ZlCandlestickChart.tsx").read_text(encoding="utf-8")

    assert "SHOW_FORECAST_TARGET_OVERLAY = true" in source
