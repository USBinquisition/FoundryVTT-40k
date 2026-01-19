# TacCog (Tactical Cognition)

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

## Extending

- Add new sheet tabs by editing `templates/actor-sheet.hbs`.
- Extend automation in `modules/combat.mjs`.
- Add new theme profiles in `styles/tac-cog.css` and register them in `tac-cog.mjs`.
