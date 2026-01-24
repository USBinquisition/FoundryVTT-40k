#!/usr/bin/env python3
"""Stage 1.5 library intake scanner.

Scans for text-like documents and PDFs, determines conservative usage, and emits
reports without moving anything.
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[5]
LIBRARY_ROOT = REPO_ROOT / "systems" / "taccog" / "USBHub" / "data" / "library"
REPORT_ROOT = LIBRARY_ROOT / "intake_reports"

TEXT_EXTENSIONS = {".txt", ".md", ".log", ".rtf"}
REFERENCE_EXTENSIONS = {
    ".html",
    ".htm",
    ".js",
    ".mjs",
    ".cjs",
    ".ts",
    ".jsx",
    ".tsx",
    ".json",
    ".css",
    ".less",
    ".py",
    ".yml",
    ".yaml",
}
PDF_EXTENSIONS = {".pdf"}

# Immutable and/or high-risk zones.
PROTECTED_PARTS = {
    ".git",
    "node_modules",
    "releases",
    "worlds",
    "build",
    "dist",
    "systems/taccog/USBHub/usbhub-library",
    "systems/taccog/USBHub/data/library",
}

DEFAULT_EXCLUDES = {"reference", "imports"}


def relpath(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def is_protected(path: Path) -> bool:
    rel = relpath(path)
    parts = set(rel.split("/"))
    if parts & {"worlds"}:
        return True
    for protected in PROTECTED_PARTS:
        if rel == protected or rel.startswith(f"{protected}/"):
            return True
    return False


def should_skip(path: Path, exclude_reference: bool, exclude_imports: bool) -> bool:
    rel = relpath(path)
    if exclude_reference and rel.startswith("reference/"):
        return True
    if exclude_imports and rel.startswith("imports/"):
        return True
    return False


def iter_files(root: Path) -> Iterable[Path]:
    for path in root.rglob("*"):
        if path.is_file():
            yield path


@dataclass
class Candidate:
    path: str
    ext: str
    size: int
    used_reference_hits: int
    used_reference_examples: list[str]
    protected: bool
    safe_to_move: bool
    reason: str



def build_reference_corpus(files: Iterable[Path]) -> list[tuple[str, str]]:
    corpus: list[tuple[str, str]] = []
    for file in files:
        if file.suffix.lower() not in REFERENCE_EXTENSIONS:
            continue
        try:
            corpus.append((relpath(file), file.read_text(encoding="utf-8", errors="ignore")))
        except OSError:
            continue
    return corpus



def find_usage_hits(candidate: Path, corpus: list[tuple[str, str]]) -> tuple[int, list[str]]:
    rel = relpath(candidate)
    name = candidate.name
    hits: list[str] = []
    for ref_path, content in corpus:
        if rel in content or name in content:
            hits.append(ref_path)
            if len(hits) >= 10:
                break
    return len(hits), hits[:5]



def main() -> None:
    parser = argparse.ArgumentParser(description="Scan for library intake candidates.")
    parser.add_argument("--root", type=Path, default=REPO_ROOT, help="Repository root to scan.")
    parser.add_argument(
        "--include-reference",
        action="store_true",
        help="Include /reference in the scan (ignored by default).",
    )
    parser.add_argument(
        "--include-imports",
        action="store_true",
        help="Include /imports in the scan (ignored by default).",
    )
    args = parser.parse_args()

    root = args.root.resolve()
    exclude_reference = not args.include_reference
    exclude_imports = not args.include_imports

    REPORT_ROOT.mkdir(parents=True, exist_ok=True)

    all_files = [
        path
        for path in iter_files(root)
        if not should_skip(path, exclude_reference=exclude_reference, exclude_imports=exclude_imports)
    ]

    corpus = build_reference_corpus(all_files)

    text_candidates: list[Candidate] = []
    pdf_candidates: list[Candidate] = []

    for file in all_files:
        ext = file.suffix.lower()
        if ext not in TEXT_EXTENSIONS | PDF_EXTENSIONS:
            continue

        protected = is_protected(file)
        hits, examples = find_usage_hits(file, corpus)

        if protected:
            safe_to_move = False
            reason = "protected-zone"
        elif hits > 0:
            safe_to_move = False
            reason = "referenced-by-program"
        else:
            safe_to_move = ext in TEXT_EXTENSIONS
            reason = "unreferenced-text" if safe_to_move else "pdf-reference-only"

        candidate = Candidate(
            path=relpath(file),
            ext=ext,
            size=file.stat().st_size,
            used_reference_hits=hits,
            used_reference_examples=examples,
            protected=protected,
            safe_to_move=safe_to_move,
            reason=reason,
        )

        if ext in TEXT_EXTENSIONS:
            text_candidates.append(candidate)
        else:
            pdf_candidates.append(candidate)

    timestamp = datetime.now(timezone.utc).isoformat()
    manifest_txt = root / "manifest.txt"

    report = {
        "version": "0.01a",
        "generated_at": timestamp,
        "scan_root": relpath(root),
        "defaults": {
            "exclude_reference": exclude_reference,
            "exclude_imports": exclude_imports,
        },
        "manifest_txt_present": manifest_txt.exists(),
        "text_candidates": [asdict(candidate) for candidate in sorted(text_candidates, key=lambda c: c.path)],
        "pdf_candidates": [asdict(candidate) for candidate in sorted(pdf_candidates, key=lambda c: c.path)],
        "summary": {
            "text_total": len(text_candidates),
            "text_safe_to_move": sum(1 for c in text_candidates if c.safe_to_move),
            "pdf_total": len(pdf_candidates),
            "pdf_reference_only": len(pdf_candidates),
        },
        "notes": [
            "This scan is conservative: any filename hit in code marks a file as referenced.",
            "PDFs are indexed only; binaries must not be committed.",
        ],
    }

    json_path = REPORT_ROOT / "intake_scan_report.json"
    txt_path = REPORT_ROOT / "intake_scan_report.txt"

    json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    safe_moves = [c for c in text_candidates if c.safe_to_move]
    blocked = [c for c in text_candidates if not c.safe_to_move]

    lines = [
        "USBL Library Intake Scan Report",
        "===============================",
        f"Generated at: {timestamp}",
        f"Scan root: {relpath(root)}",
        "",
        "Defaults:",
        f"  exclude /reference: {exclude_reference}",
        f"  exclude /imports: {exclude_imports}",
        f"  manifest.txt present: {manifest_txt.exists()}",
        "",
        "Summary:",
        f"  Text candidates: {len(text_candidates)}",
        f"  Safe-to-move text candidates: {len(safe_moves)}",
        f"  PDF candidates (reference-only): {len(pdf_candidates)}",
        "",
        "Safe-to-move text candidates:",
    ]

    if safe_moves:
        lines.extend(f"  - {c.path} ({c.reason})" for c in safe_moves[:200])
    else:
        lines.append("  (none detected)")

    lines.extend(["", "Blocked or referenced text candidates:"])
    if blocked:
        lines.extend(f"  - {c.path} ({c.reason})" for c in blocked[:200])
    else:
        lines.append("  (none)")

    lines.extend(["", "PDF references:"])
    if pdf_candidates:
        lines.extend(f"  - {c.path} ({c.reason})" for c in pdf_candidates[:200])
    else:
        lines.append("  (none detected)")

    txt_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"Wrote {json_path.relative_to(root)}")
    print(f"Wrote {txt_path.relative_to(root)}")


if __name__ == "__main__":
    main()
