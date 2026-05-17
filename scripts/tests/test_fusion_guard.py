import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FUSION_GUARD_PATH = ROOT / "scripts" / "fusion_guard.py"


def load_fusion_guard_module():
    spec = importlib.util.spec_from_file_location("fusion_guard", FUSION_GUARD_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FusionGuardContractTest(unittest.TestCase):
    def test_clean_quality_gate_accepts_zero_warn_summary(self):
        fusion_guard = load_fusion_guard_module()

        def fake_run_cmd(argv, *, timeout, extra_env=None):
            return 0, "Total: 0 FAIL, 0 WARN\nRESULT: GATE PASSED\n"

        old_run_cmd = fusion_guard.run_cmd
        try:
            fusion_guard.run_cmd = fake_run_cmd
            result = fusion_guard.command_check(
                "quality gate clean",
                ["python3", "quality_gate.py"],
                10,
                clean_gate=True,
            )
        finally:
            fusion_guard.run_cmd = old_run_cmd

        self.assertEqual(result.status, fusion_guard.PASS)

    def test_runtime_scan_allows_docs_to_state_runtime_policy(self):
        fusion_guard = load_fusion_guard_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            (temp_root / "docs").mkdir()
            (temp_root / "app").mkdir()
            blocked_runtime_name = "Dock" + "er"
            (temp_root / "docs/policy.md").write_text(
                f"Runtime policy: no local Supabase and no {blocked_runtime_name} workflow.\n",
                encoding="utf-8",
            )

            old_root = fusion_guard.ROOT
            try:
                fusion_guard.ROOT = temp_root
                result = fusion_guard.check_forbidden_runtime_terms()
            finally:
                fusion_guard.ROOT = old_root

        self.assertEqual(result.status, fusion_guard.PASS)

    def test_pytest_quality_tests_include_local_python_package_path(self):
        fusion_guard = load_fusion_guard_module()
        calls = []

        def fake_command_check(name, argv, timeout, *, clean_gate=False, extra_env=None):
            calls.append({"name": name, "extra_env": extra_env})
            return fusion_guard.Check(name, fusion_guard.PASS, "stub")

        old_command_check = fusion_guard.command_check
        try:
            fusion_guard.command_check = fake_command_check
            fusion_guard.pytest_check(10)
        finally:
            fusion_guard.command_check = old_command_check

        self.assertEqual(calls[1]["name"], "pytest quality tests")
        self.assertEqual(calls[1]["extra_env"], {"PYTHONPATH": "python"})

    def test_package_lint_scope_is_source_bounded(self):
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        lint = package["scripts"]["lint"]

        self.assertNotEqual(lint, "eslint .")
        self.assertIn("app", lint)
        self.assertIn("components", lint)
        self.assertIn("lib", lint)

    def test_eslint_ignores_generated_and_tooling_trees(self):
        config = (ROOT / "eslint.config.mjs").read_text(encoding="utf-8")

        for ignored in ("quality/**", ".claude/**", ".github/skills/**", ".kilo/**", "logs/**"):
            with self.subTest(ignored=ignored):
                self.assertIn(ignored, config)

    def test_tsconfig_excludes_generated_and_tooling_trees(self):
        config = json.loads((ROOT / "tsconfig.json").read_text(encoding="utf-8"))
        excludes = set(config["exclude"])

        for ignored in ("quality", ".claude", ".github", ".kilo", "logs", "reference_docs"):
            with self.subTest(ignored=ignored):
                self.assertIn(ignored, excludes)


if __name__ == "__main__":
    unittest.main()
