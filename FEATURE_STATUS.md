# Feature Status

Status legend: **Working**, **Bugged**, **Not Implemented**.

## Combat and Automation

| Area | Status | Notes |
| --- | --- | --- |
| Combat roll target calculation (aim, range, RoF, caps at ±60) | Working | Implemented in `_computeCombatTarget` and `_getRollTarget`. |
| Multi-hit computation (semi/full auto, storm, twin-linked, evasion reduction) | Working | Implemented in `_computeNumberOfHits`. |
| Hit location resolution (reverse digits) and additional hit mapping | Working | Implemented in `_getLocation` and `_getAdditionalLocation`. |
| Damage trait handling (Tearing, Proven, Primitive, Accurate, Razor Sharp, Righteous Fury) | Working | Implemented during `_rollDamage`, `_appendTearing`, `_appendNumberedDiceModifier`, `_rollPenetration`, and `_computeDamage`. |
| Ammo consumption for ranged attacks (standard/semi/full auto, storm/twin-linked) | Working | Implemented in `_updateRangedAmmo`. |
| Chat-card fate rerolls | Working | Implemented in `rerollTest` and enabled via `rollData.canReroll`. |
| NPC auto-target selection modes and range modifier resolution | Working | Implemented in `selectHostileTarget`, `computeRangeModifier`, and `resolveRangeSelection`. |
| Programmatic damage application from roll data (`applyDamage(rollData)`) | Bugged | `rollData.damages` uses `damage.total` while `Actor.applyDamage` expects `damage.amount`. This mismatch can yield `NaN` wounds when applying damage directly from roll data. |

## Sheets, Data, and Derived Stats

| Area | Status | Notes |
| --- | --- | --- |
| Characteristic totals and bonuses (including cybernetics and fatigue halving) | Working | Implemented in `_computeCharacteristics`. |
| Skill totals and specialist handling | Working | Implemented in `_computeSkills`. |
| Experience auto-calculation option | Working | Implemented in `_computeExperience_auto` with fallback to `_computeExperience_normal`. |
| Armour aggregation by hit location and AP lookup during damage | Working | Implemented in `_computeArmour` and `_getArmour`. |
| Critical message prompting on overflow damage | Working | Implemented in `_showCritMessage`. |

## Documentation and Guidance

| Area | Status | Notes |
| --- | --- | --- |
| Changelog | Working | Added `CHANGELOG.md`. |
| Feature inventory with status flags | Working | This file (`FEATURE_STATUS.md`). |
| Rules reference derived from the automation code | Working | Added `RULES_REFERENCE.md`. |
| Root HTML guide viewer | Working | Added `system-guide.html` to link everything together. |
