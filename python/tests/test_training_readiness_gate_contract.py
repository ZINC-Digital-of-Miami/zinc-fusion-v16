from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from fusion import training_readiness_gate


class TrainingReadinessGateContractTest(unittest.TestCase):
    def test_default_contract_uses_dynamic_local_source_scope(self) -> None:
        env_keys = [
            "TRAINING_REQUIRED_SYMBOLS",
            "TRAINING_REQUIRED_FRED_SERIES",
            "TRAINING_MIN_MATRIX_ROWS",
            "TRAINING_ENFORCE_CLOUD_LOCAL_PARITY",
            "TRAINING_REQUIRE_OPTIONS",
        ]
        saved = {key: os.environ.pop(key, None) for key in env_keys}
        try:
            contract = training_readiness_gate._load_contract()
        finally:
            for key, value in saved.items():
                if value is not None:
                    os.environ[key] = value

        self.assertEqual(contract.required_symbols, ())
        self.assertEqual(contract.required_fred_series, ())
        self.assertEqual(contract.min_matrix_rows, 500000)
        self.assertFalse(contract.enforce_cloud_local_parity)
        self.assertFalse(contract.require_options_data)

    def test_dry_run_evaluates_gate_and_can_block(self) -> None:
        with patch.object(
            training_readiness_gate,
            "_check_local_matrix_artifact",
            return_value=(False, "local matrix artifact failed -> rows=6439 (<500000)"),
        ), patch.object(
            training_readiness_gate.psycopg2,
            "connect",
            side_effect=RuntimeError("local db unavailable"),
        ):
            result = training_readiness_gate.run(dry_run=True)

        self.assertFalse(result["ready"])
        self.assertEqual(result["status"], "blocked")
        self.assertIn("local matrix artifact failed -> rows=6439 (<500000)", result["blockers"])
        self.assertTrue(
            any(str(item).startswith("readiness query failure: local db unavailable") for item in result["blockers"])
        )


if __name__ == "__main__":
    unittest.main()
