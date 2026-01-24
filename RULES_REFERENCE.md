# Rules Reference (Inferred from Automation Code)

This document records system behavior as it is currently implemented in the codebase, especially around attack rolls, multi-hit logic, and damage application.

> Source of truth: the implementation in `script/common/roll.js`, `script/common/dialog.js`, `script/common/chat.js`, `script/common/actor.js`, and `script/macro/auto-npc.js`.

## 1) Target Numbers and Modifiers

### Modifier cap
- Total modifiers are capped at **+60 / -60** before being applied to the base target.
- The final target is `baseTarget + clamp(targetMods, -60, +60)`.

### Combat target formula
The combat target combines:
- Manual modifier from the dialog (`rollData.target.modifier`).
- Aim modifier (`rollData.aim.val`).
- Range modifier (`rollData.rangeMod`).
- Twin-linked bonus (**+20**).
- Attack type modifier (based on RoF/mode).
- Psychic modifier: `(psy.rating - psy.value) * 10`, with push handling.

## 2) Attack Type / Rate of Fire Rules

Attack type drives three key values:
- `modifier`: to-hit modifier.
- `hitMargin`: degrees-of-success step per additional hit.
- `maxHits`: ceiling on the number of hits before other traits (e.g., Storm).

### Implemented attack types
- **Standard**: `+10`, margin `1`, max hits `1`.
- **Semi-auto / Swift / Barrage**: `0`, margin `2`, max hits = burst RoF.
- **Full-auto / Lightning**: `-10`, margin `1`, max hits = full RoF.
- **Called shot**: `-20`, margin `1`, max hits `1`.
- **Charge**: `+20`, margin `1`, max hits `1`.
- **All-out**: `+30`, margin `1`, max hits `1`.
- **Bolt / Blast**: `0`, margin `1`, max hits `1`.

## 3) Degrees of Success / Failure

### Success test
- A roll succeeds if `d100 <= target.final`.
- On success:
  - `dos = 1 + (floor(target.final / 10) - floor(result / 10))`.
  - `dof = 0`.
- On failure:
  - `dos = 0`.
  - `dof = 1 + (floor(result / 10) - floor(target.final / 10))`.

## 4) Multi-hit Resolution

The number of hits starts from degrees of success and attack type, then is adjusted by traits and constraints.

### Core hit formula
- Base hits are computed as:
  - `hits = (1 + floor((attackDos - 1) / hitMargin)) * stormMod`
  - where `stormMod = 2` if the weapon has **Storm**, else `1`.

### Twin-linked adjustments
If **Twin-linked** and the attack has at least 2 DoS:
- `maxHits += 1`
- `attackDos += hitMargin`
- `shotsFired += 1` (when available)

### Constraints and reductions
- Hits are capped to `maxHits` (and to `shotsFired` if ammo ran short).
- Evasion DoS subtracts directly from hits.
- Hits never go below zero.

## 5) Hit Locations

### First hit location (reversed roll)
- The d100 result is reversed (e.g., `05 -> 50`) to determine location.
- Location mapping:
  - `01-10`: Head
  - `11-20`: Right Arm
  - `21-30`: Left Arm
  - `31-70`: Body
  - `71-85`: Right Leg
  - `86-100`: Left Leg

### Additional hit locations
- Additional hits follow a fixed lookup table based on the first hit location.
- Once the sequence runs out, it repeats the last entry.

## 6) Damage Formula Construction

### Step-by-step construction
When a weapon has a damage formula:
1. Start with `weapon.damageFormula`.
2. Apply special traits:
   - **Tearing**: add one die and drop the lowest.
   - **Proven (X)**: add `minX` to the damage dice term.
   - **Primitive (X)**: add `maxX` to the damage dice term.
3. Append flat bonus: `+ weapon.damageBonus`.
4. Extract display modifiers (e.g., `+SB`, `+5`) for the chat card.
5. Replace symbols using actor bonuses and `PR` (psy rating).

## 7) Weapon Trait Behavior

### Tearing
- Implemented by increasing the number of dice by 1 and adding `dl` (drop lowest).
- It only applies if the formula does not already include `dl` or `kh`.

### Proven (X)
- Adds `minX` to the damage dice term.
- Dice results below X are raised up to X by the dice engine.

### Primitive (X)
- Adds `maxX` to the damage dice term.
- Dice results above X are reduced down to X by the dice engine.

### Accurate (when aiming)
- If aiming and the weapon is Accurate:
  - Additional damage dice are added based on DoS beyond the first.
  - Extra dice count is `floor((dos - 1) / 2)`, capped at 2 dice.

### Inaccurate
- Inaccurate weapons set aim bonus to 0.

### Storm
- Storm doubles both computed hits and max hits via `stormMod = 2`.

### Twin-linked
- Twin-linked provides:
  - A flat **+20** to hit.
  - Extra multi-hit handling when DoS >= 2.
  - Ammo consumption doubled (shared with Storm logic).

### Razor Sharp
- If DoS >= 3 and the weapon has Razor Sharp, penetration is doubled.
- Legacy support: a penetration value in parentheses like `6(12)` will switch to the parenthetical value when DoS >= 3.

### Vengeful / Righteous Fury face
- Righteous Fury triggers when a die meets or exceeds `rfFace`.
- If `rfFace` is not present, the die's full face value is used.
- Righteous Fury adds an extra `1d5` value that is tracked separately.

## 8) Penetration Rules

- Penetration uses `weapon.penetrationFormula` if present, otherwise 0.
- The formula supports attribute symbols and `PR` replacement.
- Razor Sharp (or legacy parenthetical syntax) may double penetration at 3+ DoS.

## 9) Righteous Fury Handling

- Each qualifying damage die can trigger a `1d5` Righteous Fury roll.
- When damage would be fully soaked but Righteous Fury is present, at least **1 wound** is applied.
- When damage penetrates and Righteous Fury is present, a "Critical Effect (RF)" entry is recorded for chat output.

## 10) Ammo Consumption

Ammo reduction occurs for ranged attacks when the weapon has a clip.

- Standard / called shot: consume 1 shot.
- Semi-auto: consume `burst * mod` shots.
- Full-auto: consume `full * mod` shots.
- `mod = 2` if the weapon is Storm or Twin-linked, otherwise 1.
- If there is insufficient ammo, `shotsFired` is set to the remaining clip, and the clip drops to 0.

## 11) Damage Application to Actors

### Soak and wounds
When applying damage to an actor:
1. Armour is fetched by hit location.
2. Penetration reduces armour, but never below 0.
3. Damage is reduced by Toughness Bonus first.
4. Remaining damage is reduced by armour.
5. Overflow beyond max wounds becomes critical wounds.

### Important implementation mismatch
- `DarkHeresyActor.applyDamage` expects each damage entry to include `damage.amount`.
- Damage rolls currently produce `damage.total`.
- This mismatch can produce `NaN` results when damage is applied programmatically from roll data instead of from the chat-card parser.

## 12) Auto-NPC Targeting and Range Bands

### Target selection modes
The auto-NPC macro supports:
- closest, targeted, random, weakest, strongest

### Actor-type filters
- any, npc, acolyte

### Range bands and modifiers
Range modifiers are derived from measured token distance and weapon range:
- ≤ 3m: +30 (Point Blank)
- ≤ 1/2 range: +10 (Short)
- ≤ range: +0 (Standard)
- ≤ 2x range: -10 (Long)
- ≤ 3x range: -30 (Extreme)
- Beyond 3x range: no valid modifier returned

## 13) File References

Primary references for the rules above:
- `script/common/roll.js`
- `script/common/dialog.js`
- `script/common/chat.js`
- `script/common/actor.js`
- `script/macro/auto-npc.js`
- `template/chat/damage.hbs`
