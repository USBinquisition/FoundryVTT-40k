#!/usr/bin/env python3
"""Stage 2 dry-run verifier.

Validates the move plan, highlights immutable paths, and checks for collisions.
"""
from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
PLAN_PATH = REPO_ROOT / "40k" / "USBHub" / "docs" / "stage2_move_plan.json"
REPORT_PATH = REPO_ROOT / "40k" / "USBHub" / "docs" / "stage2_dry_run_report.txt"


def relpath(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def main() -> None:
    if not PLAN_PATH.exists():
        raise SystemExit(
            "Missing stage2_move_plan.json. Run systems/taccog/USBHub/tools/stage2_move_plan.py first."
        )

    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    entries = plan.get("plans", [])

    dest_counter = Counter(entry["destination"] for entry in entries)
    collisions = [dest for dest, count in dest_counter.items() if count > 1]

    immutable = [entry for entry in entries if entry.get("immutable")]
    hub_entries = [entry for entry in entries if entry["source"].startswith("systems/taccog/USBHub/")]

    timestamp = datetime.now(timezone.utc).isoformat()
    lines = [
        "Stage 2 Dry-Run Verification",
        "============================",
        f"Generated at: {timestamp}",
        f"Plan source: {relpath(PLAN_PATH)}",
        "",
        f"Total entries: {len(entries)}",
        f"Hub entries: {len(hub_entries)}",
        f"Immutable flagged: {len(immutable)}",
        f"Destination collisions: {len(collisions)}",
        "",
    ]

    if collisions:
        lines.append("Collisions (destinations with multiple sources):")
        lines.extend(f"  - {dest} ({dest_counter[dest]} sources)" for dest in collisions[:200])
        lines.append("")

    lines.append("Immutable examples:")
    if immutable:
        lines.extend(f"  - {entry['source']} -> {entry['destination']}" for entry in immutable[:50])
    else:
        lines.append("  (none flagged)")

    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {relpath(REPORT_PATH)}")


if __name__ == "__main__":
    main()
