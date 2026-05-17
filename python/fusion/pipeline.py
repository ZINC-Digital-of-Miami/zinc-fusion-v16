from __future__ import annotations

import argparse
from importlib import import_module
from typing import Callable

PhaseFn = Callable[..., dict[str, object]]


def lazy_phase(module_name: str) -> PhaseFn:
    def run(**kwargs: object) -> dict[str, object]:
        module = import_module(f".{module_name}", __package__)
        return module.run(**kwargs)

    return run


PHASE_MAP: dict[str, PhaseFn] = {
    "matrix": lazy_phase("build_matrix"),
    "specialists": lazy_phase("generate_specialist_features"),
    "signals": lazy_phase("generate_specialist_signals"),
    "train-readiness": lazy_phase("training_readiness_gate"),
    "train": lazy_phase("train_models"),
    "forecast": lazy_phase("generate_forward_forecasts"),
    "monte-carlo": lazy_phase("run_monte_carlo"),
    "garch": lazy_phase("run_garch"),
    "target-zones": lazy_phase("generate_target_zones"),
    "promote": lazy_phase("promote_to_cloud"),
}

PIPELINE_ORDER = [
    "matrix",
    "specialists",
    "signals",
    "train-readiness",
    "train",
    "forecast",
    "garch",
    "monte-carlo",
    "target-zones",
    "promote",
]


def run_phase(
    name: str,
    *,
    dry_run: bool,
    approve_training: bool,
    approve_promotion: bool,
) -> dict[str, object]:
    fn = PHASE_MAP[name]
    if name == "train":
        return fn(dry_run=dry_run, approved=approve_training)
    if name == "promote":
        return fn(dry_run=dry_run or not approve_promotion, approved=approve_promotion)
    return fn(dry_run=dry_run)


def main() -> None:
    parser = argparse.ArgumentParser(description="ZINC Fusion v16 pipeline runner")
    parser.add_argument("--all", action="store_true", help="Run all phases in pipeline order")
    parser.add_argument("--phase", choices=PIPELINE_ORDER, help="Run one phase")
    parser.add_argument("--dry-run", action="store_true", help="Show intent only, no writes")
    parser.add_argument(
        "--approve-training",
        action="store_true",
        help="Explicit training approval gate for non-dry-run train phase",
    )
    parser.add_argument(
        "--approve-promotion",
        action="store_true",
        help="Explicit cloud promotion approval gate for non-dry-run promote phase",
    )
    args = parser.parse_args()

    selected: list[str]
    if args.all:
        selected = PIPELINE_ORDER
    elif args.phase:
        selected = [args.phase]
    else:
        parser.error("Select --all or --phase")

    for phase in selected:
        result = run_phase(
            phase,
            dry_run=args.dry_run,
            approve_training=args.approve_training,
            approve_promotion=args.approve_promotion,
        )
        print(result)


if __name__ == "__main__":
    main()
