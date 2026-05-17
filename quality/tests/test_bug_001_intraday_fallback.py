from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.xfail(strict=True, reason="BUG-001: remove marker after applying quality/patches/BUG-001-fix.patch")
def test_bug_001_intraday_has_executable_1m_fallback() -> None:
    source = (ROOT / "app/api/zl/intraday/route.ts").read_text(encoding="utf-8")
    assert '.from("price_1m")' in source
