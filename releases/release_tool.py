#!/usr/bin/env python3
"""Interactive release helper for FoundryVTT-40k."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import textwrap
import webbrowser
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Iterable, Optional

ROOT = Path(__file__).resolve().parents[1]
RELEASES_DIR = ROOT / "releases"
BUILD_DIR = ROOT / "build"
SYSTEM_MANIFEST_VERSION = "0.4"
EXPECTED_SYSTEM_FILENAME = "system.json"

DEPENDENCY_URLS = {
    "git": "https://git-scm.com/download/win",
    "gh": "https://cli.github.com/",
    "node": "https://nodejs.org/",
    "npm": "https://nodejs.org/",
    "npx": "https://nodejs.org/",
    "python": "https://www.python.org/downloads/windows/",
}


@dataclass
class DependencyStatus:
    name: str
    found: bool
    location: Optional[str]


@dataclass
class GithubRelease:
    tag: str
    exists: bool
    assets: list[str]
    body: str


@dataclass
class BuildCandidate:
    tag: str
    version: str
    source: str
    release_json_path: Optional[Path]
    system_json_path: Optional[Path]
    zip_path: Optional[Path]
    manifest_url: Optional[str]
    download_url: Optional[str]
    notes: str


@dataclass
class CandidateStatus:
    candidate: BuildCandidate
    github: GithubRelease
    expected_manifest_url: str
    expected_download_url: str
    expected_assets: list[str]
    differences: list[str]


class ReleaseToolError(RuntimeError):
    """Raised when the release helper encounters a blocking issue."""


def run_command(
    args: Iterable[str],
    *,
    capture_output: bool = True,
    check: bool = True,
    cwd: Optional[Path] = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        list(args),
        cwd=str(cwd) if cwd else None,
        check=check,
        text=True,
        capture_output=capture_output,
    )


def get_repo_name() -> str:
    remote = run_command(["git", "remote", "get-url", "origin"], cwd=ROOT).stdout.strip()
    if remote.endswith(".git"):
        remote = remote[:-4]
    match = re.search(r"github\.com[:/](?P<repo>[^/]+/[^/]+)$", remote)
    if not match:
        raise ReleaseToolError(
            "Unable to determine GitHub repository from origin remote: " f"{remote}"
        )
    return match.group("repo")


def dependency_statuses() -> list[DependencyStatus]:
    statuses: list[DependencyStatus] = []
    for name in ["git", "gh", "node", "npm", "npx", "python"]:
        location = shutil.which(name)
        statuses.append(DependencyStatus(name=name, found=location is not None, location=location))
    return statuses


def ensure_dependencies() -> None:
    statuses = dependency_statuses()
    missing = [status for status in statuses if not status.found]

    print("\nDependency check:")
    for status in statuses:
        location = status.location if status.location else "<missing>"
        marker = "OK" if status.found else "MISSING"
        print(f"  - {status.name:<6} : {marker:<7} {location}")

    if not missing:
        return

    print("\nSome dependencies are missing.")
    open_urls = prompt_yes_no("Open download pages in your browser now?", default=False)
    if open_urls:
        for status in missing:
            url = DEPENDENCY_URLS.get(status.name)
            if url:
                webbrowser.open(url)
                print(f"  Opened {status.name}: {url}")

    raise ReleaseToolError("Missing required dependencies. Install them and re-run release.bat.")


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def discover_release_json_candidates() -> list[BuildCandidate]:
    candidates: list[BuildCandidate] = []
    if not RELEASES_DIR.exists():
        return candidates

    for release_json_path in sorted(RELEASES_DIR.glob("*/release.json")):
        data = load_json(release_json_path)
        tag = str(data.get("tag") or data.get("version") or release_json_path.parent.name)
        version = str(data.get("version") or tag)
        system_json_path = release_json_path.parent / EXPECTED_SYSTEM_FILENAME
        zip_path = release_json_path.parent / f"{tag}.zip"
        if not zip_path.exists():
            zip_path = None

        candidates.append(
            BuildCandidate(
                tag=tag,
                version=version,
                source=f"release.json ({release_json_path.parent.name})",
                release_json_path=release_json_path,
                system_json_path=system_json_path if system_json_path.exists() else None,
                zip_path=zip_path,
                manifest_url=data.get("manifest"),
                download_url=data.get("download"),
                notes=str(data.get("notes") or ""),
            )
        )

    return candidates


def infer_tag_from_zip(zip_path: Path) -> str:
    stem = zip_path.stem
    match = re.search(r"(\d+\.\w+)$", stem)
    return match.group(1) if match else stem


def discover_zip_candidates(existing_tags: set[str]) -> list[BuildCandidate]:
    candidates: list[BuildCandidate] = []
    if not BUILD_DIR.exists():
        return candidates

    for zip_path in sorted(BUILD_DIR.rglob("*.zip")):
        tag = infer_tag_from_zip(zip_path)
        if tag in existing_tags:
            continue
        candidates.append(
            BuildCandidate(
                tag=tag,
                version=tag,
                source=f"zip ({zip_path.relative_to(ROOT)})",
                release_json_path=None,
                system_json_path=None,
                zip_path=zip_path,
                manifest_url=None,
                download_url=None,
                notes="",
            )
        )
    return candidates


def discover_build_candidates() -> list[BuildCandidate]:
    release_candidates = discover_release_json_candidates()
    existing_tags = {candidate.tag for candidate in release_candidates}
    zip_candidates = discover_zip_candidates(existing_tags)
    combined = release_candidates + zip_candidates

    unique: dict[str, BuildCandidate] = {}
    for candidate in combined:
        unique.setdefault(candidate.tag, candidate)
    return [unique[tag] for tag in sorted(unique)]


def gh_release_json(repo: str, tag: str) -> GithubRelease:
    try:
        result = run_command(
            ["gh", "release", "view", tag, "--repo", repo, "--json", "tagName,assets,body"],
            cwd=ROOT,
        )
    except subprocess.CalledProcessError:
        return GithubRelease(tag=tag, exists=False, assets=[], body="")

    payload = json.loads(result.stdout)
    assets = [asset["name"] for asset in payload.get("assets", [])]
    body = payload.get("body") or ""
    return GithubRelease(tag=tag, exists=True, assets=assets, body=body)


def expected_urls(repo: str, tag: str) -> tuple[str, str]:
    base = f"https://github.com/{repo}/releases/download/{tag}"
    manifest_url = f"{base}/{EXPECTED_SYSTEM_FILENAME}"
    download_url = f"{base}/{tag}.zip"
    return manifest_url, download_url


def compute_status(repo: str, candidate: BuildCandidate) -> CandidateStatus:
    manifest_url, download_url = expected_urls(repo, candidate.tag)
    github = gh_release_json(repo, candidate.tag)

    expected_assets = [f"{candidate.tag}.zip", EXPECTED_SYSTEM_FILENAME]
    differences: list[str] = []

    if not github.exists:
        differences.append("GitHub release is missing.")
    else:
        missing_assets = [asset for asset in expected_assets if asset not in github.assets]
        if missing_assets:
            differences.append("Missing assets on GitHub: " + ", ".join(missing_assets))

    if candidate.manifest_url and candidate.manifest_url != manifest_url:
        differences.append("release.json manifest URL does not match expected GitHub URL.")

    if candidate.download_url and candidate.download_url != download_url:
        differences.append("release.json download URL does not match expected GitHub URL.")

    if not candidate.zip_path:
        differences.append("Local zip asset is missing.")

    if candidate.release_json_path and not candidate.system_json_path:
        differences.append("Local system.json is missing next to release.json.")

    return CandidateStatus(
        candidate=candidate,
        github=github,
        expected_manifest_url=manifest_url,
        expected_download_url=download_url,
        expected_assets=expected_assets,
        differences=differences,
    )


def prompt_choice(prompt: str, choices: list[str], default_index: int = 0) -> int:
    while True:
        for idx, label in enumerate(choices, start=1):
            marker = " (default)" if idx - 1 == default_index else ""
            print(f"  {idx}) {label}{marker}")
        try:
            raw = input(f"{prompt} [default {default_index + 1}]: ").strip()
        except EOFError:
            print("\nNo input available; using default option.")
            return default_index
        if not raw:
            return default_index
        if raw.isdigit():
            index = int(raw) - 1
            if 0 <= index < len(choices):
                return index
        print("Please choose a valid option number.")


def prompt_yes_no(prompt: str, *, default: bool) -> bool:
    suffix = "[Y/n]" if default else "[y/N]"
    while True:
        try:
            raw = input(f"{prompt} {suffix}: ").strip().lower()
        except EOFError:
            print("\nNo input available; using default response.")
            return default
        if not raw:
            return default
        if raw in {"y", "yes"}:
            return True
        if raw in {"n", "no"}:
            return False
        print("Please answer yes or no.")


def git_tag_exists(tag: str) -> bool:
    result = run_command(["git", "tag", "--list", tag], cwd=ROOT)
    return result.stdout.strip() == tag


def ensure_git_tag(tag: str, message: str) -> None:
    if git_tag_exists(tag):
        print(f"Git tag '{tag}' already exists.")
        return

    print(f"Creating annotated git tag '{tag}'.")
    run_command(["git", "tag", "-a", tag, "-m", message], cwd=ROOT)
    print(f"Pushing tag '{tag}' to origin.")
    run_command(["git", "push", "origin", tag], cwd=ROOT)


def update_release_json(status: CandidateStatus, repo: str) -> None:
    path = status.candidate.release_json_path
    if not path:
        return

    data = load_json(path)
    data["version"] = status.candidate.version
    data["tag"] = status.candidate.tag
    data["date"] = str(date.today())
    data["manifest"] = status.expected_manifest_url
    data["download"] = status.expected_download_url

    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"Updated release metadata: {path.relative_to(ROOT)}")


def find_asset_paths(status: CandidateStatus) -> list[Path]:
    asset_paths: list[Path] = []
    if status.candidate.zip_path and status.candidate.zip_path.exists():
        asset_paths.append(status.candidate.zip_path)

    if status.candidate.system_json_path and status.candidate.system_json_path.exists():
        asset_paths.append(status.candidate.system_json_path)

    return asset_paths


def gh_release_create_or_update(status: CandidateStatus, repo: str, notes: str) -> None:
    asset_paths = find_asset_paths(status)
    if not asset_paths:
        raise ReleaseToolError("No local assets found to upload.")

    assets = [str(path) for path in asset_paths]

    if status.github.exists:
        print(f"Updating existing GitHub release '{status.candidate.tag}'.")
        run_command(["gh", "release", "upload", status.candidate.tag, *assets, "--repo", repo, "--clobber"], cwd=ROOT)
        run_command(
            [
                "gh",
                "release",
                "edit",
                status.candidate.tag,
                "--repo",
                repo,
                "--title",
                status.candidate.tag,
                "--notes",
                notes,
            ],
            cwd=ROOT,
        )
    else:
        print(f"Creating GitHub release '{status.candidate.tag}'.")
        run_command(
            [
                "gh",
                "release",
                "create",
                status.candidate.tag,
                *assets,
                "--repo",
                repo,
                "--title",
                status.candidate.tag,
                "--notes",
                notes,
            ],
            cwd=ROOT,
        )


def open_target(status: CandidateStatus) -> None:
    candidate = status.candidate
    choices: list[tuple[str, str]] = []

    if candidate.zip_path:
        choices.append(("Open local zip", str(candidate.zip_path)))

    choices.append(("Open GitHub release page", f"https://github.com/{get_repo_name()}/releases/tag/{candidate.tag}"))
    choices.append(("Open expected manifest URL", status.expected_manifest_url))
    choices.append(("Open expected download URL", status.expected_download_url))

    labels = [label for label, _ in choices]
    index = prompt_choice("Choose what to open", labels, default_index=0)
    label, target = choices[index]
    print(f"Opening: {label} -> {target}")

    if Path(target).exists():
        if sys.platform.startswith("win"):
            os.startfile(target)  # type: ignore[attr-defined]
        else:
            print("Local opening is supported on Windows. Path:", target)
    else:
        webbrowser.open(target)


def render_status_line(status: CandidateStatus) -> str:
    if not status.github.exists:
        state = "missing-release"
    elif status.differences:
        state = "needs-update"
    else:
        state = "up-to-date"
    return f"{status.candidate.tag:<10} {state:<14} {status.candidate.source}"


def summarize_candidate(status: CandidateStatus) -> None:
    candidate = status.candidate
    repo = get_repo_name()
    release_url = f"https://github.com/{repo}/releases/tag/{candidate.tag}"

    print("\nRelease details:")
    print(f"  Tag/version        : {candidate.tag} / {candidate.version}")
    print(f"  Source             : {candidate.source}")
    print(f"  Manifest version   : {SYSTEM_MANIFEST_VERSION}")
    print(f"  Local release.json : {candidate.release_json_path.relative_to(ROOT) if candidate.release_json_path else '<none>'}")
    print(f"  Local system.json  : {candidate.system_json_path.relative_to(ROOT) if candidate.system_json_path else '<none>'}")
    print(f"  Local zip          : {candidate.zip_path.relative_to(ROOT) if candidate.zip_path else '<none>'}")
    print(f"  GitHub release     : {'exists' if status.github.exists else 'missing'}")
    print(f"  GitHub URL         : {release_url}")
    print(f"  Expected manifest  : {status.expected_manifest_url}")
    print(f"  Expected download  : {status.expected_download_url}")

    if status.differences:
        print("\nDifferences detected:")
        for item in status.differences:
            print(f"  - {item}")
    else:
        print("\nNo differences detected between local metadata and GitHub release.")


def choose_candidate(statuses: list[CandidateStatus]) -> CandidateStatus:
    if not statuses:
        raise ReleaseToolError("No build candidates were discovered in releases/ or build/.")

    print("Discovered build candidates:")
    for idx, status in enumerate(statuses, start=1):
        print(f"  {idx}) {render_status_line(status)}")

    while True:
        try:
            raw = input("\nSelect a build candidate by number: ").strip()
        except EOFError:
            print("\nNo input available; selecting the first candidate.")
            return statuses[0]
        if raw.isdigit():
            index = int(raw) - 1
            if 0 <= index < len(statuses):
                return statuses[index]
        print("Please choose a valid option number.")


def prompt_release_notes(existing_notes: str) -> str:
    print("\nRelease notes:")
    if existing_notes:
        print(textwrap.indent(existing_notes, prefix="  "))
        use_existing = prompt_yes_no("Use existing notes from release.json?", default=True)
        if use_existing:
            return existing_notes

    print("Enter release notes. Finish with a blank line:")
    lines: list[str] = []
    while True:
        try:
            line = input()
        except EOFError:
            print("\nNo input available; finishing notes entry.")
            break
        if not line:
            break
        lines.append(line)
    notes = "\n".join(lines).strip()
    if not notes:
        notes = f"Release {date.today()} for {SYSTEM_MANIFEST_VERSION} manifest compatibility."
    return notes


def ensure_release_folder_assets(status: CandidateStatus) -> None:
    candidate = status.candidate
    if not candidate.release_json_path:
        return

    release_dir = candidate.release_json_path.parent
    release_dir.mkdir(parents=True, exist_ok=True)

    if candidate.zip_path and candidate.zip_path.parent != release_dir:
        target_zip = release_dir / f"{candidate.tag}.zip"
        if not target_zip.exists():
            shutil.copy2(candidate.zip_path, target_zip)
            candidate.zip_path = target_zip
            print(f"Copied zip asset into release folder: {target_zip.relative_to(ROOT)}")


def confirm_and_execute(status: CandidateStatus, repo: str) -> None:
    summarize_candidate(status)

    action_index = prompt_choice(
        "Choose an action",
        [
            "Update/create GitHub release and tag",
            "Open/launch release artifacts",
            "Exit",
        ],
        default_index=0,
    )

    if action_index == 2:
        print("No action selected. Exiting.")
        return

    if action_index == 1:
        open_target(status)
        return

    notes = prompt_release_notes(status.candidate.notes)
    tag_message = f"Release {status.candidate.tag}: {notes.splitlines()[0]}"

    print("\nPlanned release operations:")
    print(f"  - Ensure git tag        : {status.candidate.tag}")
    print(f"  - Update release.json   : {status.candidate.release_json_path.relative_to(ROOT) if status.candidate.release_json_path else '<none>'}")
    print(f"  - Upload assets         : {', '.join(path.name for path in find_asset_paths(status)) or '<none>'}")
    print(f"  - GitHub repo           : {repo}")

    proceed = prompt_yes_no("Proceed with the release update?", default=False)
    if not proceed:
        print("Release update canceled.")
        return

    ensure_release_folder_assets(status)
    update_release_json(status, repo)
    ensure_git_tag(status.candidate.tag, tag_message)
    gh_release_create_or_update(status, repo, notes)
    print("\nRelease process completed successfully.")


def main() -> int:
    print("FoundryVTT-40k release helper")
    print(f"Repository root : {ROOT}")
    print(f"Manifest target : {SYSTEM_MANIFEST_VERSION}")

    ensure_dependencies()
    repo = get_repo_name()
    print(f"GitHub repo     : {repo}")

    candidates = discover_build_candidates()
    statuses = [compute_status(repo, candidate) for candidate in candidates]
    chosen = choose_candidate(statuses)
    confirm_and_execute(chosen, repo)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ReleaseToolError as exc:
        print(f"\nERROR: {exc}")
        raise SystemExit(1)
