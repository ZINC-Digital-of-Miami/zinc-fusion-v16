# TDD Traceability

| Bug | Requirement | Regression test | Red log | Green log | Verdict |
| --- | --- | --- | --- | --- | --- |
| BUG-001 | REQ-001 | quality/tests/test_bug_001_intraday_fallback.py::test_bug_001_intraday_has_executable_1m_fallback | quality/results/BUG-001.red.log (RED) | quality/results/BUG-001.green.log (GREEN) | TDD verified |
| BUG-002 | REQ-002 | quality/tests/test_bug_002_forecast_targets_envelope.py::test_bug_002_forecast_targets_uses_api_envelope_keys | quality/results/BUG-002.red.log (RED) | quality/results/BUG-002.green.log (RED) | green failed |
| BUG-003 | REQ-003 | quality/tests/test_bug_003_ingest_status_vocabulary.py::test_bug_003_ingest_status_vocabulary_is_single_set | quality/results/BUG-003.red.log (RED) | quality/results/BUG-003.green.log (RED) | green failed |
| BUG-004 | REQ-006 | quality/tests/test_bug_004_readme_port_rule.py::test_bug_004_readme_must_not_hardcode_localhost_3000 | quality/results/BUG-004.red.log (RED) | quality/results/BUG-004.green.log (GREEN) | TDD verified |
| BUG-005 | REQ-002 | quality/tests/test_bug_005_chart_overlay_gate.py::test_bug_005_chart_overlay_gate_is_enabled_when_target_zones_exist | quality/results/BUG-005.red.log (RED) | quality/results/BUG-005.green.log (GREEN) | TDD verified |
| BUG-006 | REQ-002 | quality/tests/test_bug_006_probability_surface_contract_path.py::test_bug_006_probability_surface_uses_canonical_target_zones_contract | quality/results/BUG-006.red.log (RED) | quality/results/BUG-006.green.log (ERROR) | green failed |
