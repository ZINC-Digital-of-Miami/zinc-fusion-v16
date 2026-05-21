#!/usr/bin/env python3
"""Fail-closed guard runner for ZINC Fusion V16.

The guard writes an audit log on every run and reports one final status:
PASS only when every required check passes; INCOMPLETE when any check fails,
is unavailable, times out, or is not run.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOG_ROOT = ROOT / "logs" / "fusion-guard"

PASS = "PASS"
FAIL = "FAIL"
NOT_RUN = "NOT RUN"

AUTHORITY_DOCS = (
    "AGENTS.md",
    "docs/INDEX.md",
    "docs/MASTER_PLAN.md",
    "docs/agent-safety-gates.md",
    "docs/runbooks/session-startup.md",
    "docs/plans/2026-03-17-v16-migration-plan.md",
)

PRODUCT_PREFIXES = (
    "app/",
    "components/",
    "lib/",
    "python/",
    "scripts/",
    "supabase/",
    "package.json",
    "package-lock.json",
    "eslint.config.mjs",
)

DOC_PREFIXES = (
    "AGENTS.md",
    "docs/",
    ".github/",
    ".kilo/",
)

RUNTIME_SCAN_ROOTS = (
    "package.json",
    "eslint.config.mjs",
    "scripts",
    "app",
    "components",
    "lib",
    "python",
    "supabase",
)

AI_PROVIDER_RUNTIME_ROOTS = (
    "package.json",
    "package-lock.json",
    "app",
    "components",
    "lib",
    "scripts",
    "supabase",
)

AI_GATEWAY_BLOCKED_DEPENDENCIES = (
    "ai",
    "@ai-sdk/gateway",
    "@vercel/oidc",
)


@dataclass
class Check:
    name: str
    status: str
    detail: str

    def line(self) -> str:
        return f"{self.status}: {self.name} - {self.detail}"


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def merged_env(extra_env: dict[str, str] | None) -> dict[str, str] | None:
    if not extra_env:
        return None

    env = os.environ.copy()
    for key, value in extra_env.items():
        if key == "PYTHONPATH" and env.get(key):
            env[key] = value + os.pathsep + env[key]
        else:
            env[key] = value
    return env


def run_cmd(
    argv: list[str],
    *,
    timeout: int,
    extra_env: dict[str, str] | None = None,
) -> tuple[int | None, str]:
    try:
        result = subprocess.run(
            argv,
            cwd=ROOT,
            env=merged_env(extra_env),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError as exc:
        return None, str(exc)
    except subprocess.TimeoutExpired as exc:
        output = exc.stdout or ""
        if isinstance(output, bytes):
            output = output.decode(errors="replace")
        return -124, f"timeout after {timeout}s\n{output}"
    return result.returncode, result.stdout


def git_lines(args: list[str]) -> list[str]:
    code, output = run_cmd(["git", *args], timeout=30)
    if code != 0:
        return []
    return [line.strip() for line in output.splitlines() if line.strip()]


def untracked_files() -> list[str]:
    return git_lines(["ls-files", "--others", "--exclude-standard"])


def changed_files(mode: str) -> tuple[list[str], Check | None]:
    if mode == "pre-commit":
        files = git_lines(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])
        return files, None

    if mode == "pre-push":
        upstream = git_lines(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])
        if not upstream:
            return [], Check("upstream range", NOT_RUN, "no upstream configured; cannot check full push range")
        files = git_lines(["diff", "--name-only", "--diff-filter=ACMR", f"{upstream[0]}...HEAD"])
        return files, Check("upstream range", PASS, upstream[0])

    files = git_lines(["diff", "--name-only", "--diff-filter=ACMR"])
    files.extend(untracked_files())
    return sorted(set(files)), None


def has_prefix(path: str, prefixes: tuple[str, ...]) -> bool:
    return path in prefixes or any(path.startswith(prefix) for prefix in prefixes)


def check_authority_docs() -> list[Check]:
    checks: list[Check] = []
    missing = [path for path in AUTHORITY_DOCS if not (ROOT / path).is_file()]
    if missing:
        checks.append(Check("authority docs", FAIL, "missing: " + ", ".join(missing)))
    else:
        checks.append(Check("authority docs", PASS, ", ".join(AUTHORITY_DOCS)))
    return checks


def check_changed_file_contract(files: list[str]) -> list[Check]:
    checks: list[Check] = []
    if not files:
        checks.append(Check("changed-file scope", PASS, "no changed files in selected scope"))
        return checks

    product = [path for path in files if has_prefix(path, PRODUCT_PREFIXES)]
    docs = [path for path in files if has_prefix(path, DOC_PREFIXES)]

    checks.append(Check("changed-file scope", PASS, f"{len(files)} file(s) inspected"))

    if product and not docs:
        checks.append(
            Check(
                "contract-sync rule",
                FAIL,
                "product/config/tooling changes require docs/contracts in the same change",
            )
        )
    else:
        checks.append(Check("contract-sync rule", PASS, f"product={len(product)}, docs={len(docs)}"))

    return checks


def forbidden_terms() -> list[str]:
    # Keep these assembled so the repository does not itself contain the banned tokens.
    base = "dock" + "er"
    return [base, base + "file", base + " compose", base + "-compose"]


def check_forbidden_runtime_terms() -> Check:
    matches: list[str] = []
    candidates: list[Path] = []
    for item in RUNTIME_SCAN_ROOTS:
        root = ROOT / item
        if root.is_file():
            candidates.append(root)
        elif root.is_dir():
            candidates.extend(path for path in root.rglob("*") if path.is_file())

    ignored_dirs = {"node_modules", ".next", "Data", "data", "models", "logs", "__pycache__"}
    for path in candidates:
        if not path.is_file():
            continue
        parts = set(path.relative_to(ROOT).parts)
        if parts & ignored_dirs:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        lowered = text.lower()
        for term in forbidden_terms():
            if term in lowered:
                matches.append(rel(path))
                break
    if matches:
        return Check("runtime-vocabulary scan", FAIL, "matches: " + ", ".join(sorted(set(matches))[:20]))
    return Check("runtime-vocabulary scan", PASS, "no forbidden runtime-stack terms found")


def blocked_ai_gateway_markers() -> tuple[str, ...]:
    return (
        "@ai-sdk/" + "gateway",
        "AI_" + "GATEWAY_API_KEY",
        "VERCEL_" + "OIDC_TOKEN",
        "@vercel/" + "oidc",
        "getVercel" + "OidcToken",
        "gateway" + "(",
        'from "ai"',
        "from 'ai'",
    )


def iter_runtime_files(roots: tuple[str, ...]) -> list[Path]:
    candidates: list[Path] = []
    for item in roots:
        root = ROOT / item
        if root.is_file():
            candidates.append(root)
        elif root.is_dir():
            candidates.extend(path for path in root.rglob("*") if path.is_file())
    return candidates


def package_dependency_offenders(path: Path) -> list[str]:
    if not path.is_file():
        return []
    try:
        package = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return []

    offenders: list[str] = []
    for group in ("dependencies", "devDependencies", "optionalDependencies"):
        dependencies = package.get(group)
        if not isinstance(dependencies, dict):
            continue
        for dependency in AI_GATEWAY_BLOCKED_DEPENDENCIES:
            if dependency in dependencies:
                offenders.append(f"{group}:{dependency}")
    return offenders


def check_no_vercel_ai_gateway_runtime() -> Check:
    offenders: list[str] = []
    package_offenders = package_dependency_offenders(ROOT / "package.json")
    if package_offenders:
        offenders.extend(f"package.json ({offender})" for offender in package_offenders)

    ignored_parts = {"node_modules", ".next", "Data", "data", "models", "logs", "__pycache__"}
    ignored_paths = {"scripts/fusion_guard.py"}
    markers = blocked_ai_gateway_markers()

    for path in iter_runtime_files(AI_PROVIDER_RUNTIME_ROOTS):
        relative = rel(path)
        if relative in ignored_paths or relative.startswith("scripts/tests/"):
            continue
        if set(path.relative_to(ROOT).parts) & ignored_parts:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for marker in markers:
            if marker in text:
                offenders.append(f"{relative} ({marker})")
                break

    if offenders:
        return Check(
            "ai-provider route lock",
            FAIL,
            "Vercel AI Gateway/OIDC runtime path found: " + ", ".join(sorted(set(offenders))[:20]),
        )
    return Check(
        "ai-provider route lock",
        PASS,
        "no Vercel AI Gateway/OIDC runtime path found",
    )


def command_check(
    name: str,
    argv: list[str],
    timeout: int,
    *,
    extra_env: dict[str, str] | None = None,
) -> Check:
    code, output = run_cmd(argv, timeout=timeout, extra_env=extra_env)
    if code is None:
        return Check(name, NOT_RUN, output)
    if code == -124:
        return Check(name, FAIL, output.splitlines()[0])
    if code != 0:
        tail = "\n".join(output.splitlines()[-8:])
        return Check(name, FAIL, f"exit {code}; {tail}")
    return Check(name, PASS, f"exit {code}")


def python_check(timeout: int) -> list[Check]:
    checks: list[Check] = []
    version = command_check("pytest availability", ["python3", "-m", "pytest", "--version"], timeout)
    checks.append(version)
    if version.status != PASS:
        return checks
    checks.append(
        command_check(
            "pytest python contract tests",
            [
                "python3",
                "-m",
                "pytest",
                "python/tests/test_train_models_contract.py",
                "python/tests/test_training_readiness_gate_contract.py",
                "python/tests/test_zl_duckdb_pipeline.py",
            ],
            timeout,
            extra_env={"PYTHONPATH": "python"},
        )
    )
    checks.append(
        command_check(
            "chart overlay regression",
            ["python3", "scripts/tests/test_chart_forecast_overlay_removed.py"],
            timeout,
        )
    )
    checks.append(
        command_check(
            "fusion guard unit tests",
            [
                "python3",
                "-m",
                "unittest",
                "scripts.tests.test_fusion_guard",
                "scripts.tests.test_ai_provider_route_lock",
            ],
            timeout,
        )
    )
    return checks


def full_gate_checks(args: argparse.Namespace) -> list[Check]:
    checks = [
        command_check("npm lint", ["npm", "run", "lint"], args.command_timeout),
        command_check("npm build", ["npm", "run", "build"], args.build_timeout),
    ]
    checks.extend(python_check(args.command_timeout))
    return checks


def write_audit(mode: str, checks: list[Check], files: list[str]) -> Path:
    LOG_ROOT.mkdir(parents=True, exist_ok=True)
    path = LOG_ROOT / f"{utc_stamp()}-{mode}.log"
    status = final_status(checks)
    payload = {
        "timestamp": utc_stamp(),
        "mode": mode,
        "status": status,
        "changed_files": files,
        "checks": [check.__dict__ for check in checks],
    }
    lines = [
        f"mode: {mode}",
        f"status: {status}",
        f"changed_files: {len(files)}",
        "",
        *[check.line() for check in checks],
        "",
        json.dumps(payload, indent=2),
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def final_status(checks: list[Check]) -> str:
    if any(check.status != PASS for check in checks):
        return "INCOMPLETE"
    return PASS


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Run ZINC Fusion V16 fail-closed guards.")
    parser.add_argument("mode", choices=("pre-commit", "pre-push", "completion"))
    parser.add_argument("--command-timeout", type=int, default=180)
    parser.add_argument("--build-timeout", type=int, default=300)
    args = parser.parse_args(argv)

    files, range_check = changed_files(args.mode)
    checks: list[Check] = []
    if range_check is not None:
        checks.append(range_check)
    checks.extend(check_authority_docs())
    checks.extend(check_changed_file_contract(files))
    checks.append(check_forbidden_runtime_terms())
    checks.append(check_no_vercel_ai_gateway_runtime())

    if args.mode in {"pre-push", "completion"}:
        checks.extend(full_gate_checks(args))

    audit = write_audit(args.mode, checks, files)

    for check in checks:
        print(check.line())
    status = final_status(checks)
    print(f"STATUS: {status}")
    print(f"AUDIT_LOG: {rel(audit)}")
    return 0 if status == PASS else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
