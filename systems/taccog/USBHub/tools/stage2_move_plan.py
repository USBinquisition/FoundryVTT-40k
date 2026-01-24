#!/usr/bin/env python3
"""Stage 2 move-map generator (planning only)."""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[4]
OUTPUT_JSON = REPO_ROOT / "40k" / "USBHub" / "docs" / "stage2_move_plan.json"
OUTPUT_TXT = REPO_ROOT / "40k" / "USBHub" / "docs" / "stage2_move_plan.txt"

IMMUTABLE_PARTS = {"worlds", ".git", "node_modules", "releases"}
DEFAULT_EXCLUDES = {"reference", "imports"}


@dataclass
class MovePlan:
    source: str
    destination: str
    rule: str
    immutable: bool



def relpath(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def iter_files(root: Path) -> Iterable[Path]:
    for path in root.rglob("*"):
        if path.is_file():
            yield path


def is_excluded(rel: str, include_reference: bool, include_imports: bool) -> bool:
    if not include_reference and rel.startswith("reference/"):
        return True
    if not include_imports and rel.startswith("imports/"):
        return True
    return False


def is_immutable(rel: str) -> bool:
    parts = set(rel.split("/"))
    return bool(parts & IMMUTABLE_PARTS)


def map_destination(rel: str) -> tuple[str, str]:
    if rel.startswith("systems/taccog/USBHub/data/"):
        return rel.replace("systems/taccog/USBHub/data/", "40k/data/hub/"), "hub-data-to-40k-data"
    if rel.startswith("systems/taccog/USBHub/"):
        return rel.replace("systems/taccog/USBHub/", "40k/USBHub/"), "hub-programs-to-40k"
    if rel.startswith("40k/"):
        return rel, "already-in-40k"
    return f"40k/legacy/{rel}", "legacy-catchall"


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a Stage 2 move plan without executing it.")
    parser.add_argument("--root", type=Path, default=REPO_ROOT)
    parser.add_argument("--include-reference", action="store_true")
    parser.add_argument("--include-imports", action="store_true")
    args = parser.parse_args()

    root = args.root.resolve()
    include_reference = args.include_reference
    include_imports = args.include_imports

    plans: list[MovePlan] = []
    for file in iter_files(root):
        rel = relpath(file)
        if is_excluded(rel, include_reference=include_reference, include_imports=include_imports):
            continue
        dest, rule = map_destination(rel)
        plans.append(MovePlan(source=rel, destination=dest, rule=rule, immutable=is_immutable(rel)))

    timestamp = datetime.now(timezone.utc).isoformat()
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": timestamp,
        "root": relpath(root),
        "include_reference": include_reference,
        "include_imports": include_imports,
        "immutables": sorted(IMMUTABLE_PARTS),
        "plans": [plan.__dict__ for plan in plans],
        "notes": [
            "This file is planning-only. No moves are performed.",
            "Review immutable entries (worlds, releases, node_modules) before Stage 2.",
        ],
    }
    OUTPUT_JSON.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    by_rule: dict[str, int] = {}
    immutable_count = 0
    for plan in plans:
        by_rule[plan.rule] = by_rule.get(plan.rule, 0) + 1
        immutable_count += int(plan.immutable)

    lines = [
        "Stage 2 Move Plan (Planning Only)",
        "================================",
        f"Generated at: {timestamp}",
        f"Include /reference: {include_reference}",
        f"Include /imports: {include_imports}",
        "",
        "Counts by rule:",
    ]
    lines.extend(f"  - {rule}: {count}" for rule, count in sorted(by_rule.items()))
    lines.extend(
        [
            "",
            f"Immutable entries flagged: {immutable_count}",
            "",
            f"JSON output: {relpath(OUTPUT_JSON)}",
        ]
    )
    OUTPUT_TXT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"Wrote {relpath(OUTPUT_JSON)}")
    print(f"Wrote {relpath(OUTPUT_TXT)}")


if __name__ == "__main__":
    main()
