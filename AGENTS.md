# Agent Notes

## Release Focus

- The system manifest version is **0.4**.
- Version 0.4 development is centered on auto-attack tooling and minion automation scripting for NPC-focused combat workflows.
- Preserve the existing `mookAI-12-master` folder as a reference while building new Dark Heresy-specific automation features.

## AutoNPC Macro Suite (v0.4)
- Automation entrypoints live under `game.darkHeresy.macros.autoNpc` (also mirrored at `game.macro.autoNpc`).
- Key helpers:
  - `autoShoot({ targetMode, targetFilter, includeFriendlies })` — fires ranged weapons for NPCs and resolves hit + damage automatically.
  - `autoChargeMelee({ targetMode, includeFriendlies })` — moves into charge range and executes melee attacks when possible.
  - `autoTurn()` — reads `actor.system.personality`, executes the mapped behaviour script, and advances the combat turn.
  - `useReaction({ label })` / `resetReactions()` — tracks the new `system.reactions` resource for dodge/parry automation.
- Targeting modes accept `closest`, `random`, `weakest`, `strongest`, `npc-only`, and `acolyte-only`. Combine with `includeFriendlies: true` when daemonhosts or allied crossfire is desired.
- NPC sheets now expose a **Personality** tab with dropdown descriptions so mooks can be configured quickly; personalities feed directly into the `autoTurn` macro logic.
