#!/usr/bin/env python3
"""Stage 1.5 library intake mover.

Moves only approved safe text candidates into the library root, always creating
backups first and updating metadata.json.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[5]
LIBRARY_ROOT = REPO_ROOT / "systems" / "taccog" / "USBHub" / "data" / "library"
REPORT_ROOT = LIBRARY_ROOT / "intake_reports"
METADATA_PATH = LIBRARY_ROOT / "metadata.json"

PROTECTED_PREFIXES = (
    Path("worlds"),
    Path("releases"),
    Path("systems/taccog/USBHub/usbhub-library"),
    Path("systems/taccog/USBHub/data/library"),
)

CATEGORY_DEFAULT = "other"
CATEGORY_BY_EXT = {
    ".log": "reports",
    ".md": "reports",
    ".txt": "reports",
    ".rtf": "transcriptions",
}


@dataclass
class MoveResult:
    source: str
    backup: str
    destination: str
    category: str
    hash_b64: str



def relpath(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def sha256_b64(path: Path) -> str:
    digest = hashlib.sha256(path.read_bytes()).digest()
    return digest.hex()


def load_allowlist(path: Path) -> list[Path]:
    entries: list[Path] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        entries.append((REPO_ROOT / line).resolve())
    return entries


def load_scan_report() -> dict:
    report_path = REPORT_ROOT / "intake_scan_report.json"
    if not report_path.exists():
        raise SystemExit(
            "Missing intake scan report. Run library_intake_scan.py before moving files."
        )
    return json.loads(report_path.read_text(encoding="utf-8"))


def safe_candidates_from_report(report: dict) -> set[str]:
    return {
        candidate["path"]
        for candidate in report.get("text_candidates", [])
        if candidate.get("safe_to_move")
    }


def is_protected(path: Path) -> bool:
    rel = path.relative_to(REPO_ROOT)
    for prefix in PROTECTED_PREFIXES:
        if rel == prefix or str(rel).startswith(f"{prefix.as_posix()}/"):
            return True
    return False


def ensure_metadata() -> dict:
    if METADATA_PATH.exists():
        return json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    return {"version": "0.01a", "categories": [], "items": []}


def pick_category(path: Path) -> str:
    return CATEGORY_BY_EXT.get(path.suffix.lower(), CATEGORY_DEFAULT)


def unique_destination(dest_dir: Path, filename: str) -> Path:
    candidate = dest_dir / filename
    if not candidate.exists():
        return candidate
    stem = candidate.stem
    suffix = candidate.suffix
    counter = 2
    while True:
        candidate = dest_dir / f"{stem}-{counter}{suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


def backup_root() -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    root = LIBRARY_ROOT / "_backups" / timestamp
    root.mkdir(parents=True, exist_ok=True)
    return root


def update_metadata(metadata: dict, result: MoveResult) -> None:
    now = datetime.now(timezone.utc).isoformat()
    metadata.setdefault("items", [])
    metadata.setdefault("categories", [])
    if result.category not in metadata["categories"]:
        metadata["categories"].append(result.category)

    metadata["items"].insert(
        0,
        {
            "id": f"txt-{Path(result.destination).stem}",
            "title": Path(result.destination).name,
            "type": "txt",
            "category": result.category,
            "path": f"/{result.destination}",
            "tags": ["intake", "auto-moved"],
            "created_at": now,
            "updated_at": now,
            "source": "intake-script",
            "notes": f"Moved from /{result.source} with backup /{result.backup}.",
            "hash": result.hash_b64,
            "status": "active",
        },
    )


def write_reports(results: Iterable[MoveResult]) -> None:
    results = list(results)
    REPORT_ROOT.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).isoformat()
    json_path = REPORT_ROOT / "intake_move_report.json"
    txt_path = REPORT_ROOT / "intake_move_report.txt"

    payload = {
        "version": "0.01a",
        "generated_at": timestamp,
        "moves": [result.__dict__ for result in results],
        "count": len(results),
    }
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    lines = [
        "USBL Library Intake Move Report",
        "===============================",
        f"Generated at: {timestamp}",
        f"Moves: {len(results)}",
        "",
    ]
    if results:
        lines.extend(
            f"- /{result.source} -> /{result.destination} (backup: /{result.backup})" for result in results
        )
    else:
        lines.append("(no files moved)")

    txt_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"Wrote {json_path.relative_to(REPO_ROOT)}")
    print(f"Wrote {txt_path.relative_to(REPO_ROOT)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Move approved library intake candidates.")
    parser.add_argument(
        "--allowlist",
        type=Path,
        required=True,
        help="Path to allowlist file (one repo-relative path per line).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would happen without moving files.",
    )
    args = parser.parse_args()

    report = load_scan_report()
    safe_candidates = safe_candidates_from_report(report)

    allowlist_path = args.allowlist.resolve()
    if not allowlist_path.exists():
        raise SystemExit(f"Allowlist not found: {allowlist_path}")

    allowlisted = load_allowlist(allowlist_path)
    metadata = ensure_metadata()
    backup_dir = backup_root()

    results: list[MoveResult] = []

    for source in allowlisted:
        if not source.exists():
            print(f"Skipping missing file: {source}")
            continue
        rel_source = relpath(source)
        if rel_source not in safe_candidates:
            print(f"Skipping non-safe candidate (per scan report): {rel_source}")
            continue
        if is_protected(source):
            print(f"Skipping protected path: {rel_source}")
            continue

        category = pick_category(source)
        dest_dir = LIBRARY_ROOT / category
        dest_dir.mkdir(parents=True, exist_ok=True)
        destination = unique_destination(dest_dir, source.name)

        backup_target = backup_dir / rel_source.replace("/", "__")
        backup_target.parent.mkdir(parents=True, exist_ok=True)

        if args.dry_run:
            print(f"DRY RUN: would backup {rel_source} -> {relpath(backup_target)}")
            print(f"DRY RUN: would move {rel_source} -> {relpath(destination)}")
            continue

        shutil.copy2(source, backup_target)
        shutil.move(source, destination)
        file_hash = sha256_b64(destination)

        result = MoveResult(
            source=rel_source,
            backup=relpath(backup_target),
            destination=relpath(destination),
            category=category,
            hash_b64=file_hash,
        )
        results.append(result)
        update_metadata(metadata, result)

    if not args.dry_run:
        METADATA_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        write_reports(results)
    else:
        print("Dry run complete; no files moved.")


if __name__ == "__main__":
    main()
