"""Compatibility aggregation for Phase 5 patch gate.

Per-bug executable regression tests live in quality/tests/test_bug_*.py.
This file anchors the canonical test_regression.* artifact requirement.
"""

from quality.tests.test_bug_001_intraday_fallback import (  # noqa: F401
    test_bug_001_intraday_has_executable_1m_fallback,
)
from quality.tests.test_bug_002_forecast_targets_envelope import (  # noqa: F401
    test_bug_002_forecast_targets_uses_api_envelope_keys,
)
from quality.tests.test_bug_003_ingest_status_vocabulary import (  # noqa: F401
    test_bug_003_ingest_status_vocabulary_is_single_set,
)
from quality.tests.test_bug_004_readme_port_rule import (  # noqa: F401
    test_bug_004_readme_must_not_hardcode_localhost_3000,
)
from quality.tests.test_bug_005_chart_overlay_gate import (  # noqa: F401
    test_bug_005_chart_overlay_gate_is_enabled_when_target_zones_exist,
)
from quality.tests.test_bug_006_probability_surface_contract_path import (  # noqa: F401
    test_bug_006_probability_surface_uses_canonical_target_zones_contract,
)
