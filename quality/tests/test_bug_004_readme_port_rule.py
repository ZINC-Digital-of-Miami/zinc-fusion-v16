from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.xfail(strict=True, reason="BUG-004: remove marker after applying quality/patches/BUG-004-fix.patch")
def test_bug_004_readme_must_not_hardcode_localhost_3000() -> None:
    readme = (ROOT / "README.md").read_text(encoding="utf-8").lower()
    assert "localhost:3000" not in readme
