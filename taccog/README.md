# TacCog (Tactical Cognition)

Version: **0.01a**

TacCog is a lightweight, no-build Foundry VTT V12 system skeleton for tactical 40k-style play. It focuses on fast automation hooks, clean UI themes, and CSV-driven content import.

## Goals

- **No build step**: everything runs as plain `.mjs`, `.json`, and `.css`.
- **Automation first**: quick attacks, nearest-target macros, and talent-driven modifiers.
- **Theme profiles**: swap global UI palettes from a settings dropdown.
- **Data-driven**: CSV importer for skills, talents, and character rosters.

## Contents

- `system.json`: system manifest for Foundry VTT.
- `template.json`: data schema for actor and item types.
- `tac-cog.mjs`: system initialization and hook wiring.
- `modules/`: combat, effects, progression, importer, dice, factions.
- `styles/`: global theme profiles and sheet styling.
- `templates/`: starter sheet layouts.
- `RULES.md`: base rules reference for the TacCog framework.

## Usage

1. Copy the `taccog` folder into your Foundry `systems/` directory.
2. Enable the system and select the **TacCog Theme** in system settings.
3. Use the CSV importer helpers (see `modules/importer.mjs`) to seed skills and talents.
4. Open a TacCog actor sheet, edit characteristics, and click **Roll** to roll a test from that stat.

## Foundry Manifest Placeholders (Update These Before Release)

The system manifest lives at `taccog/system.json`. The following fields are currently placeholders and should be updated to match your real module identity and hosting:

- `id` (system id)
- `title`
- `description`
- `authors[].name` / `authors[].email`
- `url`
- `manifest`
- `download`
- `license`

These fields are required or referenced by Foundry for listing, updates, and licensing. Edit them directly in `taccog/system.json` before publishing.

## Versioning & Changelog Workflow

1. Update the version in `taccog/system.json` for every release.
2. Add a new section at the top of `taccog/CHANGELOG.md` with the same version number and date.
3. Keep the version format consistent with the current release tag (this release is **0.01a**).
4. Note user-facing changes in the changelog first, then update docs if needed.

## Extending

- Add new sheet tabs by editing `templates/actor-sheet.hbs`.
- Extend automation in `modules/combat.mjs`.
- Add new theme profiles in `styles/tac-cog.css` and register them in `tac-cog.mjs`.
