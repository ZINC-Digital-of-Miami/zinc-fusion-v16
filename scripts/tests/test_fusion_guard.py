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
    def test_zl_daily_route_uses_canonical_hourly_before_legacy_intraday_tables(self):
        source = (ROOT / "app/api/zl/price-1d/route.ts").read_text(encoding="utf-8")

        hourly = source.index('{ table: "price_1h"')
        fifteen_minute = source.index('{ table: "price_15m"')
        one_minute = source.index('{ table: "price_1m"')

        self.assertLess(hourly, fifteen_minute)
        self.assertLess(hourly, one_minute)

    def test_zl_intraday_route_falls_back_to_hourly_latest_window(self):
        source = (ROOT / "app/api/zl/intraday/route.ts").read_text(encoding="utf-8")

        self.assertIn('"price_15m" | "price_1m" | "price_1h"', source)
        self.assertIn('await fetchBars("price_1h")', source)
        self.assertIn('.order("bucket_ts", { ascending: false })', source)
        self.assertIn('.limit(', source)

    def test_zl_price_1h_route_reads_latest_limited_window(self):
        source = (ROOT / "app/api/zl/price-1h/route.ts").read_text(encoding="utf-8")

        self.assertIn('.order("bucket_ts", { ascending: false })', source)
        self.assertIn('.limit(', source)

    def test_read_only_api_routes_do_not_use_service_role_admin_client(self):
        routes = sorted(
            path
            for path in (ROOT / "app/api").rglob("route.ts")
            if path.relative_to(ROOT).as_posix() != "app/api/health/route.ts"
        )
        offenders = [
            str(path.relative_to(ROOT))
            for path in routes
            if "createSupabaseAdminClient" in path.read_text(encoding="utf-8")
        ]

        self.assertEqual(offenders, [])

    def test_proxy_and_contracts_do_not_preserve_vercel_cron_secret_path(self):
        files = [
            ROOT / "lib/supabase/proxy.ts",
            ROOT / "docs/contracts/security-model.md",
            ROOT / "docs/contracts/engineering-principles.md",
        ]
        offenders = []
        for path in files:
            source = path.read_text(encoding="utf-8")
            if "/api/cron" in source or "CRON_SECRET" in source:
                offenders.append(str(path.relative_to(ROOT)))

        self.assertEqual(offenders, [])

    def test_zl_databento_pg_cron_writer_disabled_by_followup_migration(self):
        migrations = "\n".join(
            path.read_text(encoding="utf-8")
            for path in sorted((ROOT / "supabase/migrations").glob("*.sql"))
            if path.name > "202605180002_accept_databento_206_intraday.sql"
        )

        self.assertIn("ALTER TABLE ops.ingest_run", migrations)
        self.assertIn("ALTER COLUMN run_id SET DEFAULT gen_random_uuid()", migrations)
        self.assertIn("cron.unschedule", migrations)
        self.assertIn("ingest_zl_intraday", migrations)
        self.assertIn("REVOKE EXECUTE ON FUNCTION", migrations)
        self.assertNotIn("INSERT INTO mkt.price_1h", migrations)

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

    def test_next_request_hook_uses_middleware_convention_for_local_build_trace(self):
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        tsconfig = json.loads((ROOT / "tsconfig.json").read_text(encoding="utf-8"))

        self.assertTrue((ROOT / "middleware.ts").is_file())
        self.assertFalse((ROOT / "proxy.ts").exists())
        self.assertIn("middleware.ts", package["scripts"]["lint"])
        self.assertNotIn("proxy.ts", package["scripts"]["lint"])
        self.assertIn("middleware.ts", tsconfig["include"])
        self.assertNotIn("proxy.ts", tsconfig["include"])

    def test_next_scripts_use_local_wrapper_to_avoid_native_macos_swc_prompt(self):
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        wrapper = (ROOT / "scripts/next-local.js").read_text(encoding="utf-8")
        layout = (ROOT / "app/layout.tsx").read_text(encoding="utf-8")
        next_config = (ROOT / "next.config.ts").read_text(encoding="utf-8")
        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        tsconfig = json.loads((ROOT / "tsconfig.json").read_text(encoding="utf-8"))

        self.assertEqual(package["dependencies"]["next"], "16.2.6")
        self.assertIn("node scripts/next-local.js build --webpack", package["scripts"]["build"])
        self.assertIn("node scripts/next-local.js dev --webpack", package["scripts"]["dev"])
        self.assertIn("NEXT_TEST_WASM", wrapper)
        self.assertIn("NEXT_NATIVE_SWC_ALLOWED", wrapper)
        self.assertIn("NEXT_LOCAL_DIST_DIR", wrapper)
        self.assertIn("NEXT_LOCAL_TSCONFIG", wrapper)
        self.assertIn("tsconfig.next-local.json", wrapper)
        self.assertIn('"@/*": ["../*"]', wrapper)
        self.assertIn(".next-local/build-", wrapper)
        self.assertIn("distDir: process.env.NEXT_LOCAL_DIST_DIR", next_config)
        self.assertIn("tsconfigPath: process.env.NEXT_LOCAL_TSCONFIG", next_config)
        self.assertIn("/.next-local/", gitignore)
        self.assertFalse(
            any(include.startswith(".next-local/") for include in tsconfig["include"]),
        )
        self.assertIn('The "middleware" file convention is deprecated', wrapper)
        self.assertIn("Serializing big strings", wrapper)
        self.assertNotIn("next/font", layout)

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
