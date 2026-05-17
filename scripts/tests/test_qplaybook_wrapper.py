import argparse
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
QPLAYBOOK_PATH = ROOT / "scripts" / "qplaybook.py"
EXPECTED_COMMIT = "ce3a90b14631ccea2c790945e4f6dc9717f6a444"
EXPECTED_VERSION = "v1.5.7"

CRITICAL_BUNDLE_FILES = {
    "SKILL.md",
    "quality_gate.py",
    "phase_prompts/phase1.md",
    "phase_prompts/phase6.md",
    "references/phase1_exploration_guide.md",
    "references/phase2_generation_guide.md",
    "references/phase6_verify_guide.md",
    "references/role_map_queries.md",
    "references/runners_and_models.md",
    "bin/citation_verifier.py",
    "bin/reference_docs_ingest.py",
    "bin/benchmark_lib.py",
}


def load_qplaybook_module():
    spec = importlib.util.spec_from_file_location("qplaybook", QPLAYBOOK_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class QPlaybookWrapperContractTest(unittest.TestCase):
    def test_config_pins_current_upstream_source(self):
        config = json.loads((ROOT / "docs/runbooks/qplaybook_config.json").read_text())

        self.assertEqual(config["source_version"], EXPECTED_VERSION)
        self.assertEqual(config["source_commit"], EXPECTED_COMMIT)
        self.assertIsInstance(config["quality_gate_timeout_seconds"], int)
        self.assertGreater(config["quality_gate_timeout_seconds"], 0)

    def test_wrapper_requires_v157_critical_bundle_files(self):
        qplaybook = load_qplaybook_module()

        self.assertTrue(CRITICAL_BUNDLE_FILES.issubset(set(qplaybook.REQUIRED_BUNDLE_PATHS)))

    def test_installed_bundles_contain_v157_critical_files(self):
        install_roots = [
            ROOT / ".claude/skills/quality-playbook",
            ROOT / ".github/skills/quality-playbook",
        ]

        for install_root in install_roots:
            with self.subTest(install_root=install_root):
                for relative_path in sorted(CRITICAL_BUNDLE_FILES):
                    self.assertTrue(
                        (install_root / relative_path).is_file(),
                        f"missing {relative_path} in {install_root}",
                    )

    def test_reference_docs_sentinel_tree_exists(self):
        self.assertTrue((ROOT / "reference_docs/.gitkeep").is_file())
        self.assertTrue((ROOT / "reference_docs/cite/.gitkeep").is_file())

    def test_yarn_sentinel_tree_exists_for_upstream_runner(self):
        for relative_path in (
            ".yarn/patches/.gitkeep",
            ".yarn/plugins/.gitkeep",
            ".yarn/releases/.gitkeep",
            ".yarn/versions/.gitkeep",
        ):
            with self.subTest(relative_path=relative_path):
                self.assertTrue((ROOT / relative_path).is_file())

    def test_yarn_gitignore_unignores_concrete_sentinel_files(self):
        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")

        for relative_path in (
            ".yarn/patches/.gitkeep",
            ".yarn/plugins/.gitkeep",
            ".yarn/releases/.gitkeep",
            ".yarn/versions/.gitkeep",
        ):
            with self.subTest(relative_path=relative_path):
                self.assertIn(f"!{relative_path}", gitignore)

    def test_gate_timeout_returns_failure(self):
        qplaybook = load_qplaybook_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            config_path = temp_root / "docs/runbooks/qplaybook_config.json"
            gate_path = temp_root / ".claude/skills/quality-playbook/quality_gate.py"
            config_path.parent.mkdir(parents=True)
            gate_path.parent.mkdir(parents=True)
            config_path.write_text('{"quality_gate_timeout_seconds": 1}', encoding="utf-8")
            gate_path.write_text(
                "import time\n"
                "time.sleep(30)\n",
                encoding="utf-8",
            )

            old_root = qplaybook.ROOT
            old_config_paths = qplaybook.CONFIG_PATHS
            try:
                qplaybook.ROOT = temp_root
                qplaybook.CONFIG_PATHS = (config_path,)
                result = qplaybook.cmd_gate(argparse.Namespace())
            finally:
                qplaybook.ROOT = old_root
                qplaybook.CONFIG_PATHS = old_config_paths

        self.assertEqual(result, 124)


if __name__ == "__main__":
    unittest.main()
