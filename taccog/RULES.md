# TacCog Base Rules

TacCog is a streamlined percentile-based tactical ruleset inspired by 40k-era RPGs.

## Core Mechanic

- **Tests** are resolved by rolling **1d100**.
- A test succeeds if the roll is **equal to or under** the target number.
- **Degrees of Success (DoS)** are calculated as `floor((Target - Roll) / 10)`.

## Characteristics

Characters use nine core characteristics:

- Weapon Skill (WS)
- Ballistic Skill (BS)
- Strength (S)
- Toughness (T)
- Agility (Ag)
- Intelligence (Int)
- Perception (Per)
- Willpower (WP)
- Fellowship (Fel)

Most human characters roll **2d10 + 20** for each characteristic. The default in the template is **30** to keep initialization consistent.

## Skills

- Skills are linked to a characteristic.
- Skill **Rank** represents training (0 = Known, 1 = Trained, 2 = Experienced, 3 = Veteran).
- Specialist skills (Lore/Trade) may require a specialization.

## Talents & Traits

- Talents represent learned techniques or supernatural gifts.
- Traits represent intrinsic abilities or biological features.

Talents can carry Active Effects (ex: "Crack Shot" adding +2 to BS damage bonus).

## Combat Overview

- Attacks are resolved using WS (melee) or BS (ranged).
- **Range Bands** apply modifiers: point blank, short, standard, long, extreme.
- **Called Shots** impose a penalty but allow location targeting.
- **Auto Fire** grants extra hits based on Degrees of Success.

### Common Modifiers

- Aim (Half +10, Full +20)
- Target Prone/Stunned (+10 to hit)
- Attacker Blind (-30), Attacker Stunned (-20)
- All Out Attack (+20 WS, cannot Dodge)

## Movement

- **Run** defaults to 12m, with talent modifiers (e.g., Sprint).
- **Charge** defaults to 6m, with talent modifiers (e.g., Furious Charge).

## XP & Aptitudes

- XP cost is calculated based on matching **Aptitudes**.
- Matching aptitudes reduce XP cost for skills and talents.
- Talent tiers and skill ranks scale the cost.

## Automation Notes

TacCog ships with automation helpers:

- Auto-shoot the nearest enemy.
- Auto-melee nearest enemy when in reach.
- Auto-charge nearest enemy when in range.

These routines are designed to be extended for NPC minions and auto-attack scripting.
