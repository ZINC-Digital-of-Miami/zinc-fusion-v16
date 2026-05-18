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

    def test_python_contract_tests_include_local_python_package_path(self):
        fusion_guard = load_fusion_guard_module()
        calls = []

        def fake_command_check(name, argv, timeout, *, extra_env=None):
            calls.append({"name": name, "extra_env": extra_env})
            return fusion_guard.Check(name, fusion_guard.PASS, "stub")

        old_command_check = fusion_guard.command_check
        try:
            fusion_guard.command_check = fake_command_check
            fusion_guard.python_check(10)
        finally:
            fusion_guard.command_check = old_command_check

        self.assertEqual(calls[1]["name"], "pytest python contract tests")
        self.assertEqual(calls[1]["extra_env"], {"PYTHONPATH": "python"})

    def test_python_contract_tests_include_zl_duckdb_pipeline_regression(self):
        fusion_guard = load_fusion_guard_module()
        calls = []

        def fake_command_check(name, argv, timeout, *, extra_env=None):
            calls.append({"name": name, "argv": argv})
            return fusion_guard.Check(name, fusion_guard.PASS, "stub")

        old_command_check = fusion_guard.command_check
        try:
            fusion_guard.command_check = fake_command_check
            fusion_guard.python_check(10)
        finally:
            fusion_guard.command_check = old_command_check

        pytest_call = next(call for call in calls if call["name"] == "pytest python contract tests")
        self.assertIn("python/tests/test_zl_duckdb_pipeline.py", pytest_call["argv"])

    def test_package_lint_scope_is_source_bounded(self):
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        lint = package["scripts"]["lint"]

        self.assertNotEqual(lint, "eslint .")
        self.assertIn("app", lint)
        self.assertIn("components", lint)
        self.assertIn("lib", lint)

    def test_next_scripts_use_local_wrapper_to_avoid_native_macos_swc_prompt(self):
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        wrapper = (ROOT / "scripts/next-local.js").read_text(encoding="utf-8")

        self.assertEqual(package["dependencies"]["next"], "16.2.6")
        self.assertIn("node scripts/next-local.js build --webpack", package["scripts"]["build"])
        self.assertIn("node scripts/next-local.js dev --webpack", package["scripts"]["dev"])
        self.assertIn("NEXT_TEST_WASM", wrapper)
        self.assertIn("NEXT_NATIVE_SWC_ALLOWED", wrapper)

    def test_eslint_ignores_generated_and_tooling_trees(self):
        config = (ROOT / "eslint.config.mjs").read_text(encoding="utf-8")

        for ignored in (".claude/**", ".github/skills/**", ".kilo/**", "logs/**"):
            with self.subTest(ignored=ignored):
                self.assertIn(ignored, config)

    def test_tsconfig_excludes_generated_and_tooling_trees(self):
        config = json.loads((ROOT / "tsconfig.json").read_text(encoding="utf-8"))
        excludes = set(config["exclude"])

        for ignored in (".claude", ".github", ".kilo", "logs", "reference_docs"):
            with self.subTest(ignored=ignored):
                self.assertIn(ignored, excludes)


if __name__ == "__main__":
    unittest.main()
