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


class AiProviderRouteLockTest(unittest.TestCase):
    def test_provider_route_lock_allows_direct_openrouter_or_openai_keys(self):
        fusion_guard = load_fusion_guard_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            (temp_root / "app/api/report").mkdir(parents=True)
            (temp_root / "package.json").write_text(
                json.dumps({"dependencies": {"openai": "^1.0.0"}}),
                encoding="utf-8",
            )
            (temp_root / "app/api/report/route.ts").write_text(
                "const key = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY;\n",
                encoding="utf-8",
            )

            old_root = fusion_guard.ROOT
            try:
                fusion_guard.ROOT = temp_root
                result = fusion_guard.check_no_vercel_ai_gateway_runtime()
            finally:
                fusion_guard.ROOT = old_root

        self.assertEqual(result.status, fusion_guard.PASS)

    def test_provider_route_lock_rejects_vercel_gateway_paths(self):
        fusion_guard = load_fusion_guard_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            (temp_root / "app/api/report").mkdir(parents=True)
            (temp_root / "package.json").write_text(
                json.dumps({"dependencies": {"@ai-sdk/gateway": "^3.0.0"}}),
                encoding="utf-8",
            )
            (temp_root / "app/api/report/route.ts").write_text(
                "const token = process.env.VERCEL_OIDC_TOKEN;\n",
                encoding="utf-8",
            )

            old_root = fusion_guard.ROOT
            try:
                fusion_guard.ROOT = temp_root
                result = fusion_guard.check_no_vercel_ai_gateway_runtime()
            finally:
                fusion_guard.ROOT = old_root

        self.assertEqual(result.status, fusion_guard.FAIL)
        self.assertIn("Vercel AI Gateway/OIDC runtime path found", result.detail)


if __name__ == "__main__":
    unittest.main()
