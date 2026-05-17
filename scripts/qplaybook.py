#!/usr/bin/env python3
"""ZINC Fusion V16 Quality Playbook wrapper.

This wrapper keeps the upstream Quality Playbook checkout as the source of
truth, verifies the repo-local installed bundles, and avoids the quarantined
Codex.app binary path by resolving `codex` from PATH.
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATHS = (
    ROOT / "docs" / "runbooks" / "qplaybook_config.json",
    ROOT / "quality" / "qplaybook_config.json",
)
BLOCKED_CODEX_PATH = Path("/Applications/Codex.app/Contents/Resources/codex")

REQUIRED_BUNDLE_PATHS = (
    "SKILL.md",
    "quality_gate.py",
    "references/constitution.md",
    "references/phase1_exploration_guide.md",
    "references/phase2_generation_guide.md",
    "references/phase6_verify_guide.md",
    "references/role_map_queries.md",
    "references/runners_and_models.md",
    "phase_prompts/phase1.md",
    "phase_prompts/phase6.md",
    "agents/quality-playbook.agent.md",
    "bin/citation_verifier.py",
    "bin/reference_docs_ingest.py",
    "bin/benchmark_lib.py",
)


def load_config() -> dict[str, Any]:
    for config_path in CONFIG_PATHS:
        if config_path.is_file():
            return json.loads(config_path.read_text(encoding="utf-8"))
    searched = ", ".join(str(path.relative_to(ROOT)) for path in CONFIG_PATHS)
    raise SystemExit(f"missing config; searched: {searched}")


def run_cmd(
    argv: list[str],
    *,
    cwd: Path = ROOT,
    env: dict[str, str] | None = None,
    input_text: str | None = None,
    timeout: int = 120,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        argv,
        cwd=str(cwd),
        env=env,
        input=input_text,
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
    )


def print_result(label: str, ok: bool, detail: str = "") -> bool:
    status = "PASS" if ok else "FAIL"
    suffix = f" - {detail}" if detail else ""
    print(f"{status} {label}{suffix}")
    return ok


def normalized_origin(url: str) -> str:
    value = url.strip()
    if value.endswith(".git"):
        value = value[:-4]
    return value


def check_repo_root() -> bool:
    result = run_cmd(["git", "rev-parse", "--show-toplevel"])
    top = Path(result.stdout.strip()).resolve() if result.stdout.strip() else None
    return print_result("repo root", result.returncode == 0 and top == ROOT.resolve(), str(top or result.stderr.strip()))


def check_source(config: dict[str, Any]) -> bool:
    source = Path(config["source_repo"])
    expected_origin = normalized_origin(config["source_origin"])
    expected_commit = config["source_commit"]

    ok_exists = print_result("QPB source checkout", (source / ".git").is_dir(), str(source))

    origin = run_cmd(["git", "-C", str(source), "remote", "get-url", "origin"])
    actual_origin = normalized_origin(origin.stdout)
    ok_origin = print_result(
        "QPB source origin",
        origin.returncode == 0 and actual_origin == expected_origin,
        actual_origin or origin.stderr.strip(),
    )

    head = run_cmd(["git", "-C", str(source), "rev-parse", "HEAD"])
    actual_head = head.stdout.strip()
    ok_head = print_result(
        "QPB source commit",
        head.returncode == 0 and actual_head == expected_commit,
        actual_head or head.stderr.strip(),
    )

    status = run_cmd(["git", "-C", str(source), "status", "--short"])
    ok_clean = print_result(
        "QPB source clean",
        status.returncode == 0 and not status.stdout.strip(),
        status.stdout.strip() or "clean",
    )

    return ok_exists and ok_origin and ok_head and ok_clean


def resolve_codex_binary(config: dict[str, Any]) -> tuple[bool, str]:
    configured = config.get("codex_binary", "codex")
    if os.sep in configured:
        resolved = Path(configured)
    else:
        found = shutil.which(configured)
        if found is None:
            return False, f"{configured} not found on PATH"
        resolved = Path(found)

    real = resolved.resolve()
    blocked = real == BLOCKED_CODEX_PATH or str(real).startswith("/Applications/Codex.app/")
    if blocked:
        return False, f"blocked quarantined Codex.app path: {real}"

    version = run_cmd([str(real), "--version"])
    first_line = (version.stdout or version.stderr).strip().splitlines()
    detail = first_line[0] if first_line else str(real)
    ok_version = version.returncode == 0 and "codex-cli" in detail
    if not ok_version:
        return False, f"{real}: {detail}"
    return True, f"{real} ({detail})"


def check_codex(config: dict[str, Any]) -> bool:
    ok, detail = resolve_codex_binary(config)
    return print_result("codex binary", ok, detail)


def check_installed_bundle(root: Path, label: str) -> bool:
    missing = [item for item in REQUIRED_BUNDLE_PATHS if not (root / item).is_file()]
    ok_required = print_result(
        f"{label} installed bundle",
        not missing,
        str(root) if not missing else "missing: " + ", ".join(missing),
    )

    nested_git = [path for path in root.rglob(".git") if path.exists()]
    ok_no_git = print_result(
        f"{label} no nested git",
        not nested_git,
        "none" if not nested_git else ", ".join(str(path) for path in nested_git),
    )
    return ok_required and ok_no_git


def check_installs(config: dict[str, Any]) -> bool:
    ok_all = True
    for item in config["installed_skill_paths"]:
        ok_all = check_installed_bundle(ROOT / item["path"], item["name"]) and ok_all
    return ok_all


def doctor(config: dict[str, Any]) -> bool:
    checks = [
        check_repo_root(),
        check_source(config),
        check_codex(config),
        check_installs(config),
    ]
    return all(checks)


def codex_full_access_args(config: dict[str, Any]) -> list[str]:
    return list(config.get("codex_exec_args", []))


def profile_model(config: dict[str, Any], profile: str) -> str:
    try:
        return str(config["profiles"][profile]["model"])
    except KeyError as exc:
        choices = ", ".join(sorted(config["profiles"]))
        raise SystemExit(f"unknown profile {profile!r}; choose one of: {choices}") from exc


def smoke_llm(config: dict[str, Any], profile: str) -> bool:
    ok, detail = resolve_codex_binary(config)
    if not ok:
        return print_result(f"Codex smoke ({profile})", False, detail)

    codex_path = detail.split(" (", 1)[0]
    model = profile_model(config, profile)
    expected = f"zinc-fusion-v16-qpb-{profile}-ok"
    command = [
        codex_path,
        "exec",
        *codex_full_access_args(config),
        "-m",
        model,
        "-",
    ]
    result = run_cmd(
        command,
        input_text=f"Return exactly: {expected}\n",
        timeout=120,
    )
    output = result.stdout.strip()
    ok_smoke = result.returncode == 0 and expected in output
    if not ok_smoke and result.stderr:
        print(result.stderr[-2000:], file=sys.stderr)
    return print_result(
        f"Codex smoke ({profile})",
        ok_smoke,
        f"model={model}, returncode={result.returncode}, stdout={output[-120:]}",
    )


def cmd_doctor(_args: argparse.Namespace) -> int:
    return 0 if doctor(load_config()) else 1


def cmd_smoke(args: argparse.Namespace) -> int:
    config = load_config()
    checks = [doctor(config)]
    if args.no_llm:
        print_result(f"Codex smoke ({args.profile})", True, "skipped by --no-llm")
    else:
        checks.append(smoke_llm(config, args.profile))
    return 0 if all(checks) else 1


def write_codex_shim(config: dict[str, Any], shim_dir: Path) -> Path:
    ok, detail = resolve_codex_binary(config)
    if not ok:
        raise SystemExit(detail)
    real_codex = detail.split(" (", 1)[0]
    full_args = codex_full_access_args(config)
    shim_path = shim_dir / "codex"
    shim_path.write_text(
        "\n".join(
            [
                "#!/usr/bin/env python3",
                "import os",
                "import sys",
                f"REAL_CODEX = {real_codex!r}",
                f"FULL_ARGS = {full_args!r}",
                "args = sys.argv[1:]",
                "if args[:1] == ['exec']:",
                "    rest = [arg for arg in args[1:] if arg != '--full-auto']",
                "    os.execv(REAL_CODEX, [REAL_CODEX, 'exec', *FULL_ARGS, *rest])",
                "os.execv(REAL_CODEX, [REAL_CODEX, *args])",
                "",
            ]
        ),
        encoding="utf-8",
    )
    shim_path.chmod(0o755)
    return shim_path


def cmd_run(args: argparse.Namespace) -> int:
    if not args.allow_quality_artifacts:
        print(
            "Refusing to run Quality Playbook phases without --allow-quality-artifacts. "
            "This install is tooling-only by default.",
            file=sys.stderr,
        )
        return 64

    config = load_config()
    if not doctor(config):
        return 1

    source = Path(config["source_repo"])
    model = profile_model(config, args.profile)
    qpb_args = list(args.qpb_args)
    if qpb_args and qpb_args[0] == "--":
        qpb_args = qpb_args[1:]

    command = [
        sys.executable,
        "-m",
        "bin.run_playbook",
        "--codex",
        "--model",
        model,
        *qpb_args,
        str(ROOT),
    ]
    with tempfile.TemporaryDirectory(prefix="zinc-fusion-v16-qpb-codex-") as shim:
        shim_dir = Path(shim)
        write_codex_shim(config, shim_dir)
        env = os.environ.copy()
        env["PATH"] = f"{shim_dir}{os.pathsep}{env.get('PATH', '')}"
        result = subprocess.run(command, cwd=str(source), env=env, check=False)
        return result.returncode


def cmd_gate(_args: argparse.Namespace) -> int:
    config = load_config()
    timeout = int(config.get("quality_gate_timeout_seconds", 300))
    gate = ROOT / ".claude" / "skills" / "quality-playbook" / "quality_gate.py"
    if not gate.is_file():
        print(f"missing gate: {gate}", file=sys.stderr)
        return 1

    process = subprocess.Popen(
        [sys.executable, str(gate), "."],
        cwd=str(ROOT),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
    )
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        if exc.stdout:
            print(exc.stdout, end="")
        if exc.stderr:
            print(exc.stderr, end="", file=sys.stderr)
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        except OSError as kill_error:
            print(f"FAIL quality gate timeout cleanup failed for pid {process.pid}: {kill_error}", file=sys.stderr)
            return 124
        try:
            stdout, stderr = process.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            print(
                f"FAIL quality gate timed out after {timeout}s and did not terminate cleanly; pid={process.pid}",
                file=sys.stderr,
            )
            return 124
        if stdout:
            print(stdout, end="")
        if stderr:
            print(stderr, end="", file=sys.stderr)
        print(f"FAIL quality gate timed out after {timeout}s", file=sys.stderr)
        return 124

    if stdout:
        print(stdout, end="")
    if stderr:
        print(stderr, end="", file=sys.stderr)
    return int(process.returncode or 0)


def main(argv: list[str]) -> int:
    config = load_config()
    profiles = sorted(config["profiles"])

    parser = argparse.ArgumentParser(description="Run or validate the ZINC Fusion V16 Quality Playbook install.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    doctor_parser = subparsers.add_parser("doctor", help="Validate source, installed bundles, and Codex CLI wiring.")
    doctor_parser.set_defaults(func=cmd_doctor)

    smoke = subparsers.add_parser("smoke", help="Run install checks, optionally with a Codex LLM smoke call.")
    smoke.add_argument("--profile", choices=profiles, default="code")
    smoke.add_argument("--no-llm", action="store_true", help="Skip the Codex LLM call.")
    smoke.set_defaults(func=cmd_smoke)

    run = subparsers.add_parser("run", help="Run upstream Quality Playbook phases against this repo.")
    run.add_argument("--profile", choices=profiles, default="code")
    run.add_argument(
        "--allow-quality-artifacts",
        action="store_true",
        help="Allow this command to generate or update quality/ playbook artifacts.",
    )
    run.add_argument("qpb_args", nargs=argparse.REMAINDER)
    run.set_defaults(func=cmd_run)

    gate = subparsers.add_parser("gate", help="Run the installed upstream quality gate script.")
    gate.set_defaults(func=cmd_gate)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
