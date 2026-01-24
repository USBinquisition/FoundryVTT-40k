#!/usr/bin/env python3
"""Dark Heresy 2E release builder.

Single cross-platform release tool with CLI + CRT-themed GUI for:
- updating system.json version + manifest/download URLs
- optional npm/gulp builds
- git tag + push flows
- optional GitHub release creation/upload via gh CLI

Binary artifacts are never written into the repository's releases/ folder.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Iterable, Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
SYSTEM_JSON = REPO_ROOT / "system.json"
CHANGELOG_MD = REPO_ROOT / "CHANGELOG.md"
RELEASES_DIR = REPO_ROOT / "releases"
BUILD_DIR = REPO_ROOT / "build"
RELEASE_BUILD_DIR = BUILD_DIR / "release"

GITHUB_REPO = "FoundryVTT-40k/FoundryVTT-40k"
ZIP_SUFFIX = ".zip"
VERSION_PATTERN = re.compile(r"^\d+\.\d+(?:\.\d+)?[a-zA-Z]?$", re.ASCII)


def warn(msg: str) -> None:
    print(f"[release-builder] {msg}")


def run_command(cmd: Sequence[str], *, cwd: Path = REPO_ROOT) -> None:
    warn(f"$ {' '.join(cmd)}")
    proc = subprocess.run(list(cmd), cwd=str(cwd), check=False)
    if proc.returncode != 0:
        raise SystemExit(proc.returncode)


def run_capture(cmd: Sequence[str], *, cwd: Path = REPO_ROOT) -> str:
    proc = subprocess.run(
        list(cmd),
        cwd=str(cwd),
        check=False,
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        raise SystemExit(proc.returncode)
    return proc.stdout.strip()


def ensure_clean_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def read_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path: Path, data: dict) -> None:
    with path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
        fh.write("\n")


@dataclass
class ReleaseConfig:
    version: str
    release_type: str
    changelog_status: str
    notes: str = ""

    @property
    def is_test_build(self) -> bool:
        return self.release_type.lower() == "test"

    @property
    def tag_version(self) -> str:
        """GitHub tag / release segment."""
        if self.is_test_build:
            return f"test-{self.version}"
        return self.version

    @property
    def zip_name(self) -> str:
        base = f"{self.version}{ZIP_SUFFIX}"
        if self.is_test_build:
            return f"test-{base}"
        return base

    @property
    def release_dir(self) -> Path:
        return RELEASES_DIR / self.tag_version

    @property
    def manifest_url(self) -> str:
        return (
            f"https://github.com/{GITHUB_REPO}/releases/download/"
            f"{self.tag_version}/system.json"
        )

    @property
    def download_url(self) -> str:
        return (
            f"https://github.com/{GITHUB_REPO}/releases/download/"
            f"{self.tag_version}/{self.zip_name}"
        )

    @property
    def tag_name(self) -> str:
        return self.tag_version


def verify_version(version: str) -> None:
    if not VERSION_PATTERN.match(version):
        raise SystemExit(
            "Version must look like 0.6, 0.6.0, or 0.6a (digits.digits[.digits][letter])."
        )


def changelog_contains(version: str) -> bool:
    if not CHANGELOG_MD.exists():
        return False
    text = CHANGELOG_MD.read_text(encoding="utf-8")
    return f"[{version}]" in text


def validate_changelog(config: ReleaseConfig) -> None:
    present = changelog_contains(config.version)
    status = config.changelog_status.lower()
    if status == "strict" and not present:
        raise SystemExit(
            f"CHANGELOG.md does not contain an entry for [{config.version}]."
        )


def update_manifest(config: ReleaseConfig) -> dict:
    data = read_json(SYSTEM_JSON)
    data["version"] = config.version
    data["manifest"] = config.manifest_url
    data["download"] = config.download_url
    write_json(SYSTEM_JSON, data)
    return data


def npm_install() -> None:
    run_command(["npm", "ci"])


def gulp_build_all() -> None:
    run_command(["npx", "gulp", "buildAll"])


def stage_release_tree(target_dir: Path) -> None:
    """Stage a full release tree into build/release (not committed)."""
    ensure_clean_dir(target_dir)

    include_dirs = [
        "template",
        "logo",
        "lang",
        "asset",
        "script",
        "packs",
        "css",
        "example",
    ]
    for name in include_dirs:
        src = REPO_ROOT / name
        if src.exists():
            shutil.copytree(src, target_dir / name, dirs_exist_ok=True)

    include_files = [
        "template.json",
        "system.json",
        "README.md",
        "LICENSE",
        "CONTRIBUTING.md",
    ]
    for filename in include_files:
        src = REPO_ROOT / filename
        if src.exists():
            shutil.copy2(src, target_dir / filename)


def ensure_gh_available() -> None:
    try:
        run_capture(["gh", "--version"])
    except SystemExit as exc:  # pragma: no cover - depends on env
        raise SystemExit("GitHub CLI (gh) is required for --github-release flows.") from exc


def git_tag_exists(tag: str) -> bool:
    proc = subprocess.run(
        ["git", "rev-parse", "-q", "--verify", f"refs/tags/{tag}"],
        cwd=str(REPO_ROOT),
        check=False,
        capture_output=True,
        text=True,
    )
    return proc.returncode == 0


def git_create_tag(tag: str) -> None:
    if git_tag_exists(tag):
        warn(f"Tag {tag} already exists; leaving it in place.")
        return
    run_command(["git", "tag", tag])


def git_push(branch: str, tag: str, *, push_tag: bool) -> None:
    run_command(["git", "push", "origin", branch])
    if push_tag:
        run_command(["git", "push", "origin", tag])


def get_current_branch() -> str:
    return run_capture(["git", "rev-parse", "--abbrev-ref", "HEAD"]) or "work"


def github_release_upload(config: ReleaseConfig, *, zip_path: Path | None) -> None:
    ensure_gh_available()

    notes = config.notes.strip() or f"Release {config.tag_name}"
    run_command([
        "gh",
        "release",
        "create",
        config.tag_name,
        "--repo",
        GITHUB_REPO,
        "--title",
        config.tag_name,
        "--notes",
        notes,
        "--latest=false",
    ])

    assets: list[Path] = [SYSTEM_JSON]
    if zip_path is not None:
        assets.append(zip_path)

    for asset in assets:
        run_command([
            "gh",
            "release",
            "upload",
            config.tag_name,
            str(asset),
            "--repo",
            GITHUB_REPO,
            "--clobber",
        ])


def write_release_metadata(config: ReleaseConfig, manifest: dict, *, zip_path: Path | None) -> None:
    """Write lightweight metadata only (no binaries)."""
    config.release_dir.mkdir(parents=True, exist_ok=True)

    metadata = {
        "version": config.version,
        "tag": config.tag_name,
        "releaseType": config.release_type,
        "date": date.today().isoformat(),
        "manifest": manifest["manifest"],
        "download": manifest["download"],
        "zip": str(zip_path.relative_to(REPO_ROOT)) if zip_path else None,
        "notes": config.notes.strip(),
    }
    write_json(config.release_dir / "release.json", metadata)

    # Copy manifest for convenience when building from a repo snapshot.
    shutil.copy2(SYSTEM_JSON, config.release_dir / "system.json")


def create_zip(config: ReleaseConfig, target_dir: Path) -> Path:
    zip_base = target_dir / config.zip_name.replace(".zip", "")
    archive = shutil.make_archive(str(zip_base), "zip", root_dir=str(target_dir))
    return Path(archive)


def build_release(
    config: ReleaseConfig,
    *,
    run_install: bool,
    run_build: bool,
    stage_tree: bool,
    create_archive: bool,
) -> Path | None:
    verify_version(config.version)
    validate_changelog(config)

    manifest = update_manifest(config)

    if run_install:
        npm_install()
    if run_build:
        gulp_build_all()

    zip_path: Path | None = None
    if stage_tree:
        stage_release_tree(RELEASE_BUILD_DIR)
        if create_archive:
            zip_path = create_zip(config, RELEASE_BUILD_DIR)
            warn(f"Archive created at {zip_path.relative_to(REPO_ROOT)}")

    write_release_metadata(config, manifest, zip_path=zip_path)
    return zip_path


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Dark Heresy 2E release artifacts.")
    parser.add_argument("--version", help="Release version, e.g. 0.6a")
    parser.add_argument(
        "--release-type",
        choices=["release", "test"],
        default="release",
        help="Whether this is a formal release or a test build.",
    )
    parser.add_argument(
        "--changelog",
        choices=["strict", "warn", "off"],
        default="warn",
        help="Changelog validation mode.",
    )
    parser.add_argument("--notes", default="", help="Release notes used for metadata and GitHub releases.")
    parser.add_argument(
        "--skip-npm-ci",
        action="store_true",
        help="Skip npm ci (useful if dependencies already installed).",
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Skip gulp buildAll.",
    )
    parser.add_argument(
        "--stage-tree",
        action="store_true",
        help="Stage a full release tree under build/release.",
    )
    parser.add_argument(
        "--make-zip",
        action="store_true",
        help="Create a zip under build/release (never committed). Implies --stage-tree.",
    )
    parser.add_argument(
        "--git-tag",
        action="store_true",
        help="Create a git tag matching the computed release tag.",
    )
    parser.add_argument(
        "--git-push",
        action="store_true",
        help="Push the current branch to origin (and tags if --push-tag is set).",
    )
    parser.add_argument(
        "--push-tag",
        action="store_true",
        help="When used with --git-push, also push the created tag.",
    )
    parser.add_argument(
        "--github-release",
        action="store_true",
        help="Create/update a GitHub release and upload system.json (and zip if built).",
    )
    parser.add_argument(
        "--gui",
        action="store_true",
        help="Launch the CRT-themed tkinter GUI.",
    )
    return parser.parse_args(argv)


def run_cli(args: argparse.Namespace) -> int:
    if not args.version:
        warn("--version is required in CLI mode (use --gui for interactive UI).")
        return 2

    config = ReleaseConfig(
        version=args.version.strip(),
        release_type=args.release_type,
        changelog_status=args.changelog,
        notes=args.notes,
    )

    stage_tree = args.stage_tree or args.make_zip

    zip_path = build_release(
        config,
        run_install=not args.skip_npm_ci,
        run_build=not args.skip_build,
        stage_tree=stage_tree,
        create_archive=args.make_zip,
    )

    if args.changelog == "warn" and not changelog_contains(config.version):
        warn(f"WARNING: CHANGELOG.md has no [{config.version}] entry.")

    if args.git_tag:
        git_create_tag(config.tag_name)

    if args.git_push:
        branch = get_current_branch()
        git_push(branch, config.tag_name, push_tag=args.push_tag)

    if args.github_release:
        github_release_upload(config, zip_path=zip_path)

    warn(f"Manifest URL: {config.manifest_url}")
    warn(f"Download URL: {config.download_url}")
    if zip_path is None:
        warn("No zip created (expected). Use --make-zip for local packaging.")
    return 0


def launch_gui() -> int:
    try:
        import tkinter as tk
        from tkinter import messagebox
    except Exception as exc:  # pragma: no cover - tkinter availability depends on env
        warn(f"GUI unavailable: {exc}")
        return 3

    root = tk.Tk()
    root.title("Dark Heresy Release Builder")
    root.configure(bg="#001100")

    fg = "#39ff14"
    bg = "#001100"
    panel = "#000800"
    accent = "#00aa00"

    def style_option_menu(menu: tk.OptionMenu) -> None:
        menu.configure(
            fg=fg,
            bg=panel,
            activeforeground=bg,
            activebackground=fg,
            highlightthickness=1,
            highlightbackground=accent,
            relief=tk.FLAT,
            font=("Courier New", 11, "bold"),
        )
        menu["menu"].configure(
            fg=fg,
            bg=panel,
            activeforeground=bg,
            activebackground=fg,
            font=("Courier New", 11),
        )

    def crt_label(master: tk.Misc, text: str, **kwargs: object) -> tk.Label:
        return tk.Label(
            master,
            text=text,
            fg=fg,
            bg=bg,
            font=("Courier New", 11, "bold"),
            **kwargs,
        )

    def crt_entry(master: tk.Misc, textvariable: tk.StringVar, **kwargs: object) -> tk.Entry:
        return tk.Entry(
            master,
            textvariable=textvariable,
            fg=fg,
            bg=panel,
            insertbackground=fg,
            highlightthickness=1,
            highlightbackground=accent,
            highlightcolor=fg,
            relief=tk.FLAT,
            font=("Courier New", 11),
            **kwargs,
        )

    def crt_button(master: tk.Misc, text: str, command) -> tk.Button:
        return tk.Button(
            master,
            text=text,
            command=command,
            fg=fg,
            bg="#002200",
            activeforeground=bg,
            activebackground=fg,
            relief=tk.FLAT,
            highlightthickness=1,
            highlightbackground=accent,
            font=("Courier New", 11, "bold"),
            padx=10,
            pady=6,
        )

    frame = tk.Frame(root, bg=bg, padx=16, pady=16)
    frame.pack(fill=tk.BOTH, expand=True)

    version_var = tk.StringVar(value="0.6a")
    notes_var = tk.StringVar(value="Clean start release.")
    release_type_var = tk.StringVar(value="release")
    changelog_var = tk.StringVar(value="warn")

    npm_ci_var = tk.BooleanVar(value=True)
    build_var = tk.BooleanVar(value=True)
    stage_var = tk.BooleanVar(value=True)
    zip_var = tk.BooleanVar(value=False)

    git_tag_var = tk.BooleanVar(value=False)
    git_push_var = tk.BooleanVar(value=False)
    push_tag_var = tk.BooleanVar(value=False)
    gh_release_var = tk.BooleanVar(value=False)

    crt_label(frame, "+++ DARK HERESY RELEASE BUILDER +++").grid(row=0, column=0, columnspan=2, sticky="w")

    crt_label(frame, "Version").grid(row=1, column=0, sticky="w", pady=(12, 4))
    crt_entry(frame, version_var, width=20).grid(row=1, column=1, sticky="we", pady=(12, 4))

    crt_label(frame, "Release Type").grid(row=2, column=0, sticky="w", pady=4)
    release_type_menu = tk.OptionMenu(frame, release_type_var, "release", "test")
    release_type_menu.grid(row=2, column=1, sticky="we", pady=4)
    style_option_menu(release_type_menu)

    crt_label(frame, "Changelog Check").grid(row=3, column=0, sticky="w", pady=4)
    changelog_menu = tk.OptionMenu(frame, changelog_var, "strict", "warn", "off")
    changelog_menu.grid(row=3, column=1, sticky="we", pady=4)
    style_option_menu(changelog_menu)

    crt_label(frame, "Notes").grid(row=4, column=0, sticky="nw", pady=4)
    crt_entry(frame, notes_var, width=40).grid(row=4, column=1, sticky="we", pady=4)

    checks = tk.Frame(frame, bg=bg)
    checks.grid(row=5, column=0, columnspan=2, sticky="we", pady=(8, 12))

    def crt_check(text: str, var: tk.BooleanVar) -> tk.Checkbutton:
        return tk.Checkbutton(
            checks,
            text=text,
            variable=var,
            fg=fg,
            bg=bg,
            activeforeground=fg,
            activebackground=bg,
            selectcolor=panel,
            font=("Courier New", 10),
            anchor="w",
        )

    crt_check("Run npm ci", npm_ci_var).pack(anchor="w")
    crt_check("Run gulp buildAll", build_var).pack(anchor="w")
    crt_check("Stage build/release tree", stage_var).pack(anchor="w")
    crt_check("Create local zip (not committed)", zip_var).pack(anchor="w")
    crt_check("Create git tag", git_tag_var).pack(anchor="w")
    crt_check("Push current branch", git_push_var).pack(anchor="w")
    crt_check("Push tag (requires push)", push_tag_var).pack(anchor="w")
    crt_check("Create/upload GitHub release (gh)", gh_release_var).pack(anchor="w")

    output_var = tk.StringVar(value="Ready.")
    crt_label(frame, textvariable=output_var, wraplength=560, justify="left").grid(row=6, column=0, columnspan=2, sticky="w")

    frame.columnconfigure(1, weight=1)

    def do_build() -> None:
        config = ReleaseConfig(
            version=version_var.get().strip(),
            release_type=release_type_var.get(),
            changelog_status=changelog_var.get(),
            notes=notes_var.get(),
        )

        try:
            zip_path = build_release(
                config,
                run_install=npm_ci_var.get(),
                run_build=build_var.get(),
                stage_tree=stage_var.get() or zip_var.get(),
                create_archive=zip_var.get(),
            )

            if changelog_var.get() == "warn" and not changelog_contains(config.version):
                messagebox.showwarning(
                    "Changelog missing",
                    f"CHANGELOG.md has no [{config.version}] entry.",
                )

            if git_tag_var.get():
                git_create_tag(config.tag_name)

            if git_push_var.get():
                branch = get_current_branch()
                git_push(branch, config.tag_name, push_tag=push_tag_var.get())

            if gh_release_var.get():
                github_release_upload(config, zip_path=zip_path)

        except SystemExit as exc:
            messagebox.showerror("Release build failed", str(exc))
            output_var.set(f"FAILED: {exc}")
            return

        output_var.set(
            "Built manifest + metadata. "
            + (f"Zip: {zip_path.relative_to(REPO_ROOT)}" if zip_path else "No zip created.")
        )
        messagebox.showinfo("Release build complete", "Manifest and release metadata updated.")

    crt_button(frame, "BUILD RELEASE", do_build).grid(row=7, column=0, columnspan=2, sticky="we")

    root.mainloop()
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    args = parse_args(argv)

    RELEASES_DIR.mkdir(parents=True, exist_ok=True)

    if args.gui:
        return launch_gui()
    return run_cli(args)


if __name__ == "__main__":
    raise SystemExit(main())
