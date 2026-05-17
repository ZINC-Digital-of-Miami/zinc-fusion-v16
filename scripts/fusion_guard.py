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
import re
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

QUALITY_PREFIX = "quality/"

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
    quality = [path for path in files if path.startswith(QUALITY_PREFIX)]

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

    if product and not quality:
        checks.append(
            Check(
                "quality-artifact sync",
                FAIL,
                "product/config/tooling changes require regenerated quality artifacts or explicit incomplete status",
            )
        )
    else:
        checks.append(Check("quality-artifact sync", PASS, f"product={len(product)}, quality={len(quality)}"))

    if product and quality:
        product_mtime = max((ROOT / path).stat().st_mtime for path in product if (ROOT / path).exists())
        quality_mtime = max((ROOT / path).stat().st_mtime for path in quality if (ROOT / path).exists())
        if product_mtime > quality_mtime:
            checks.append(
                Check(
                    "quality-artifact freshness",
                    FAIL,
                    "source/config/tooling edits are newer than generated quality artifacts",
                )
            )
        else:
            checks.append(Check("quality-artifact freshness", PASS, "generated artifacts are not older than source edits"))

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


def check_quality_finalizer() -> Check:
    progress = ROOT / "quality" / "PROGRESS.md"
    if not progress.is_file():
        return Check("quality finalizer status", NOT_RUN, "quality/PROGRESS.md missing")
    text = progress.read_text(encoding="utf-8")
    for phase in range(1, 7):
        marker = f"- [x] Phase {phase}"
        if marker not in text:
            return Check("quality finalizer status", FAIL, f"missing {marker}")
    if "Gate status: ABORTED" in text:
        return Check("quality finalizer status", FAIL, "latest workbook finalizer is ABORTED")
    if "NOT_RUN" in text or "NOT RUN" in text:
        return Check("quality finalizer status", FAIL, "workbook contains NOT RUN evidence")
    return Check("quality finalizer status", PASS, "all phases marked and no aborted/not-run markers")


def clean_quality_gate_status(output: str) -> tuple[bool, str]:
    match = re.search(r"Total:\s*(\d+)\s+FAIL,\s*(\d+)\s+WARN", output)
    if not match:
        return False, "quality gate summary missing"

    fail_count = int(match.group(1))
    warn_count = int(match.group(2))
    if fail_count or warn_count:
        return False, f"quality gate reported {fail_count} FAIL, {warn_count} WARN"
    return True, "quality gate reported 0 FAIL, 0 WARN"


def command_check(
    name: str,
    argv: list[str],
    timeout: int,
    *,
    clean_gate: bool = False,
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
    if clean_gate:
        clean, detail = clean_quality_gate_status(output)
        if not clean:
            return Check(name, FAIL, detail)
    return Check(name, PASS, f"exit {code}")


def pytest_check(timeout: int) -> list[Check]:
    checks: list[Check] = []
    version = command_check("pytest availability", ["python3", "-m", "pytest", "--version"], timeout)
    checks.append(version)
    if version.status != PASS:
        return checks
    checks.append(
        command_check(
            "pytest quality tests",
            ["python3", "-m", "pytest", "quality/test_functional.py", "quality/test_regression.py"],
            timeout,
            extra_env={"PYTHONPATH": "python"},
        )
    )
    return checks


def full_gate_checks(args: argparse.Namespace) -> list[Check]:
    checks = [
        command_check("npm lint", ["npm", "run", "lint"], args.command_timeout),
        command_check("npm build", ["npm", "run", "build"], args.build_timeout),
        command_check("qplaybook doctor", ["python3", "scripts/qplaybook.py", "doctor"], args.command_timeout),
        command_check(
            "qplaybook smoke no-llm",
            ["python3", "scripts/qplaybook.py", "smoke", "--profile", "code", "--no-llm"],
            args.command_timeout,
        ),
    ]

    mechanical = ROOT / "quality" / "mechanical" / "verify.sh"
    if mechanical.is_file():
        checks.append(command_check("quality mechanical verify", ["bash", str(mechanical)], args.command_timeout))
    else:
        checks.append(Check("quality mechanical verify", NOT_RUN, "quality/mechanical/verify.sh missing"))

    gate = ROOT / ".claude" / "skills" / "quality-playbook" / "quality_gate.py"
    if gate.is_file():
        checks.append(command_check("quality gate clean", ["python3", str(gate), "."], args.command_timeout, clean_gate=True))
    else:
        checks.append(Check("quality gate clean", NOT_RUN, "installed quality_gate.py missing"))

    checks.extend(pytest_check(args.command_timeout))
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

    if args.mode in {"pre-push", "completion"}:
        checks.append(check_quality_finalizer())
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
