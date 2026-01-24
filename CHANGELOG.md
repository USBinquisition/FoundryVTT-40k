# Changelog

This project keeps a human-readable changelog focused on the 0.4 release line described in `AGENTS.md`.

## [0.6a] - 2026-01-24

### Changed
- Replaced the legacy PowerShell and batch release packaging flow with a single Python release builder that supports both CLI and GUI usage.
- Standardized release outputs into a repo-local `releases/` folder with per-version metadata and a copy of the release manifest.
- Updated `system.json` to point at the new `0.6a` release manifest and download URLs.

### Notes
- The `0.5.x` line is considered scrapped; `0.6a` is the new clean starting point for future releases.
- Changelog enforcement can be run in `strict`, `warn`, or `off` mode via the new release builder.
