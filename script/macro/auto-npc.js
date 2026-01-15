import DarkHeresyUtil from "../common/util.js";
import { combatRoll, applyDamage, commonRoll, reportEmptyClip } from "../common/roll.js";
import { prepareCombatRoll } from "../common/dialog.js";

export const TARGETING_MODES = Object.freeze({
    CLOSEST: "closest",
    TARGETED: "targeted",
    RANDOM: "random",
    WEAKEST: "weakest",
    STRONGEST: "strongest",
    NPC_ONLY: "npc-only",
    ACOLYTE_ONLY: "acolyte-only"
});

export const TARGET_FILTERS = Object.freeze({
    ANY: "any",
    NPC_ONLY: "npc",
    ACOLYTE_ONLY: "acolyte"
});

export const PERSONALITY_ARCHETYPES = Object.freeze({
    BERSERKER_OF_KHORNE: "berserker-of-khorne",
    LASGUN_LINE_TROOPER: "lasgun-line-trooper",
    ORK_SHOOTA_BOY: "ork-shoota-boy",
    CHAOS_SORCERER: "chaos-sorcerer",
    HIVE_SCUM_COWARD: "hive-scum-coward",
    COMMISSAR: "commissar",
    TYRANID_GAUNT: "tyranid-gaunt",
    ELDAR_RANGER: "eldar-ranger",
    TECH_PRIEST_GONE_ROGUE: "tech-priest-gone-rogue",
    DAEMONHOST: "daemonhost"
});

export const TARGETING_DOCUMENTATION = `Targeting Modes:
- closest      - hostile nearest to the acting token.
- targeted     - currently targeted hostile (first entry if multiple).
- random       - random hostile within the scene.
- weakest      - hostile with the lowest wounds percentage.
- strongest    - hostile with the highest wounds percentage.
- npc-only     - restrict to hostile NPCs, chooses closest among them.
- acolyte-only - restrict to hostile Acolytes, chooses closest among them.

Filters:
- any      - allow any hostile disposition.
- npc      - hostile tokens with NPC actors only.
- acolyte  - hostile tokens with Acolyte actors only.
`;

const PERSONALITY_DEFINITIONS = Object.freeze({
    [PERSONALITY_ARCHETYPES.BERSERKER_OF_KHORNE]: {
        label: "Berserker of Khorne",
        description: "Charges the closest foe, sprinting forward if a charge is impossible.",
        execute: async () => {
            await autoChargeMelee({ targetMode: TARGETING_MODES.CLOSEST });
        }
    },
    [PERSONALITY_ARCHETYPES.LASGUN_LINE_TROOPER]: {
        label: "Lasgun Line Trooper",
        description: "Holds position to fire at the nearest target; if locked in melee it switches to close combat.",
        execute: async ({ token }) => {
            const target = selectHostileTarget(token, { mode: TARGETING_MODES.CLOSEST });
            if (!target) return warnAutoNpc("No valid targets found for line trooper actions.");
            const distance = measureDistance(token, target);
            if (Number.isFinite(distance) && distance <= 3) {
                await autoChargeMelee({ targetMode: TARGETING_MODES.CLOSEST });
            } else {
                await autoShoot({ targetMode: TARGETING_MODES.CLOSEST });
            }
        }
    },
    [PERSONALITY_ARCHETYPES.ORK_SHOOTA_BOY]: {
        label: "Ork Shoota Boy",
        description: "Randomly sprays bullets at enemies; if the gun goes click it bellows into a charge.",
        execute: async () => {
            const result = await autoShoot({ targetMode: TARGETING_MODES.RANDOM });
            if (result?.outcome === "no-ammo") {
                await autoChargeMelee({ targetMode: TARGETING_MODES.RANDOM });
            }
        }
    },
    [PERSONALITY_ARCHETYPES.CHAOS_SORCERER]: {
        label: "Chaos Sorcerer",
        description: "Prefers ranged witchfire; when pressed it tries to dodge before striking back in melee.",
        execute: async ({ actor, token }) => {
            const target = selectHostileTarget(token, { mode: TARGETING_MODES.CLOSEST });
            if (!target) return warnAutoNpc("No valid targets found for sorcerer actions.");
            const distance = measureDistance(token, target);
            if (Number.isFinite(distance) && distance <= 3) {
                await useReaction({ actor, label: "Dodge" });
                await autoChargeMelee({ targetMode: TARGETING_MODES.CLOSEST });
            } else {
                await autoShoot({ targetMode: TARGETING_MODES.CLOSEST });
            }
        }
    },
    [PERSONALITY_ARCHETYPES.HIVE_SCUM_COWARD]: {
        label: "Hive Scum Coward",
        description: "Scatters when wounded, otherwise takes pot-shots at any Acolyte in sight.",
        execute: async ({ actor, token }) => {
            const wounds = Number(actor.system?.wounds?.value ?? 0);
            const max = Number(actor.system?.wounds?.max ?? 1);
            const ratio = max > 0 ? wounds / max : 1;
            const closest = selectHostileTarget(token, { mode: TARGETING_MODES.CLOSEST });
            if (!closest) return warnAutoNpc("No valid targets found for coward actions.");
            if (ratio < 0.5) {
                const retreatDistance = Number(actor.system?.movement?.run ?? actor.system?.movement?.full ?? 0);
                await retreatFromTarget(token, closest, retreatDistance);
            } else {
                await autoShoot({
                    targetMode: TARGETING_MODES.RANDOM,
                    targetFilter: TARGET_FILTERS.ACOLYTE_ONLY
                });
            }
        }
    },
    [PERSONALITY_ARCHETYPES.COMMISSAR]: {
        label: "Commissar",
        description: "Executes the strongest Acolyte first and foremost.",
        execute: async () => {
            await autoShoot({
                targetMode: TARGETING_MODES.STRONGEST,
                targetFilter: TARGET_FILTERS.ACOLYTE_ONLY
            });
        }
    },
    [PERSONALITY_ARCHETYPES.TYRANID_GAUNT]: {
        label: "Tyranid Gaunt",
        description: "Swarms toward the nearest Acolyte and launches a frenzied charge.",
        execute: async () => {
            await autoChargeMelee({ targetMode: TARGETING_MODES.ACOLYTE_ONLY });
        }
    },
    [PERSONALITY_ARCHETYPES.ELDAR_RANGER]: {
        label: "Eldar Ranger",
        description: "Picks off the weakest foe from afar and slips out of melee when threatened.",
        execute: async ({ token, actor }) => {
            const target = selectHostileTarget(token, { mode: TARGETING_MODES.WEAKEST });
            if (!target) return warnAutoNpc("No valid targets found for ranger actions.");
            const distance = measureDistance(token, target);
            if (Number.isFinite(distance) && distance <= 3) {
                await retreatFromTarget(token, target, actor.system?.movement?.full ?? 0);
            }
            await autoShoot({ targetMode: TARGETING_MODES.WEAKEST });
        }
    },
    [PERSONALITY_ARCHETYPES.TECH_PRIEST_GONE_ROGUE]: {
        label: "Tech-Priest Gone Rogue",
        description: "Focuses Acolytes with ranged fire; if the weapon fails it resorts to blasphemous melee strikes.",
        execute: async () => {
            const result = await autoShoot({
                targetMode: TARGETING_MODES.CLOSEST,
                targetFilter: TARGET_FILTERS.ACOLYTE_ONLY
            });
            if (result?.outcome === "no-ammo") {
                await autoChargeMelee({ targetMode: TARGETING_MODES.ACOLYTE_ONLY });
            }
        }
    },
    [PERSONALITY_ARCHETYPES.DAEMONHOST]: {
        label: "Daemonhost",
        description: "Unleashes random carnage, choosing targets and attack styles on a whim (friendly fire included).",
        execute: async () => {
            const useMelee = Math.random() < 0.5;
            if (useMelee) {
                await autoChargeMelee({
                    targetMode: TARGETING_MODES.RANDOM,
                    includeFriendlies: true
                });
            } else {
                await autoShoot({
                    targetMode: TARGETING_MODES.RANDOM,
                    includeFriendlies: true
                });
            }
        }
    }
});

const PERSONALITY_OPTIONS = Object.freeze(
    Object.entries(PERSONALITY_DEFINITIONS)
        .map(([id, value]) => ({ id, label: value.label, description: value.description }))
        .sort((a, b) => a.label.localeCompare(b.label, game.i18n?.lang ?? "en"))
);

/**
 * Emit an AutoNPC warning message for the user.
 * @param {string} message
 * @returns {null}
 */
function warnAutoNpc(message) {
    const text = `[AutoNPC] ${message}`;
    ui?.notifications?.warn?.(text);
    console.warn(text);
    return null;
}

function formatDistance(distance) {
    if (!Number.isFinite(distance)) return "?";
    const rounded = Math.round(distance * 10) / 10;
    return rounded.toString();
}

function getWeaponLabel(weapon) {
    const weaponClass = weapon?.class ?? weapon?.system?.class;
    const clip = weapon?.system?.clip?.value ?? weapon?.clip?.value;
    if (weaponClass && Number.isFinite(clip)) {
        return `${weapon.name} (${weaponClass}, ${clip} ammo)`;
    }
    if (weaponClass) {
        return `${weapon.name} (${weaponClass})`;
    }
    return weapon?.name ?? "Weapon";
}

function getTargetOptions(actingToken, targets, { chargeRange } = {}) {
    const units = canvas?.scene?.gridUnits ?? "m";
    return targets.map(token => {
        const distance = measureDistance(actingToken, token);
        const distanceText = `${formatDistance(distance)}${units ? ` ${units}` : ""}`;
        const inCharge = Number.isFinite(chargeRange) && distance <= chargeRange;
        return {
            id: token.id,
            name: token.name ?? token.actor?.name ?? "Target",
            distance,
            distanceText,
            inCharge,
            label: `${token.name ?? token.actor?.name ?? "Target"} (${distanceText}${inCharge ? ", charge" : ""})`
        };
    });
}

function getWeaponOptions(actor, { meleeOnly = false, rangedOnly = false } = {}) {
    if (!actor) return [];
    const weapons = actor.items?.filter(item => item.type === "weapon") ?? [];
    const filtered = weapons.filter(item => {
        const weaponClass = item.class ?? item.system?.class;
        if (meleeOnly) return weaponClass === "melee";
        if (rangedOnly) return weaponClass && weaponClass !== "melee";
        return true;
    });
    const equipped = filtered.filter(item => item.system?.equipped || item.system?.isEquipped || item.system?.ready);
    const active = equipped.length ? equipped : filtered;
    return active
        .map(item => ({ id: item.id, label: getWeaponLabel(item) }))
        .sort((a, b) => a.label.localeCompare(b.label, game.i18n?.lang ?? "en"));
}

function getConfigLabel(configMap, key, fallback) {
    const value = configMap?.[key] ?? fallback ?? key;
    return game.i18n?.localize?.(value) ?? value;
}

function hasSkill(actor, skillKey) {
    return !!actor?.skills?.[skillKey];
}

function hasMeleeWeapon(actor) {
    return (actor?.items ?? []).some(item => item.type === "weapon" && (item.class ?? item.system?.class) === "melee");
}

function getActorFaction(actor) {
    const rawFaction = actor?.system?.faction ?? "neutral";
    return String(rawFaction).toLowerCase();
}

function getOpposingFaction(faction) {
    switch (faction) {
        case "friendly":
            return "enemy";
        case "enemy":
            return "friendly";
        default:
            return "enemy";
    }
}

function findNearestOpposingTarget(actingToken) {
    if (!actingToken) return null;
    const actorFaction = getActorFaction(actingToken.actor);
    const opposingFaction = getOpposingFaction(actorFaction);
    const tokens = canvas?.tokens?.placeables ?? [];
    const sceneId = getTokenSceneId(actingToken);
    const originId = actingToken.id ?? actingToken.document?.id;
    let candidates = tokens.filter(token => {
        if (!token?.actor) return false;
        if (sceneId && getTokenSceneId(token) !== sceneId) return false;
        const tokenId = token.id ?? token.document?.id;
        if (originId && tokenId === originId) return false;
        return getActorFaction(token.actor) === opposingFaction;
    });

    if (!candidates.length && actorFaction === "neutral") {
        candidates = tokens.filter(token => {
            if (!token?.actor) return false;
            if (sceneId && getTokenSceneId(token) !== sceneId) return false;
            const tokenId = token.id ?? token.document?.id;
            if (originId && tokenId === originId) return false;
            return getActorFaction(token.actor) !== "neutral";
        });
    }

    if (!candidates.length) return null;

    let closestToken = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const token of candidates) {
        const distance = measureDistance(actingToken, token);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestToken = token;
        }
    }
    return closestToken ?? candidates[0] ?? null;
}

function buildEvasionRollData(defender, attackRollData, evasionType) {
    const rollData = foundry.utils.duplicate(attackRollData);
    rollData.ownerId = defender?.id ?? rollData.ownerId;
    rollData.flags = rollData.flags ?? {};
    rollData.flags.isEvasion = true;
    rollData.flags.isAttack = false;
    rollData.flags.isCombatRoll = false;
    rollData.flags.isDamageRoll = false;
    rollData.target.modifier = 0;
    const evasions = { selected: evasionType };
    if (evasionType === "dodge") {
        evasions.dodge = DarkHeresyUtil.createSkillRollData(defender, "dodge");
    }
    if (evasionType === "parry") {
        evasions.parry = DarkHeresyUtil.createSkillRollData(defender, "parry");
    }
    if (evasionType === "deny") {
        evasions.deny = DarkHeresyUtil.createCharacteristicRollData(defender, "willpower");
    }
    rollData.evasions = evasions;
    rollData.name = rollData.evasions?.[evasionType]?.name
        ?? getConfigLabel(game.darkHeresy?.config?.evasions, evasionType, "DIALOG.EVASION");
    return rollData;
}

async function attemptNpcDefense(attackRollData, targetToken, { mode }) {
    const defender = targetToken?.actor;
    if (!defender) return { handled: false };
    const reactionState = getReactionState(defender);
    if (!reactionState.current) return { handled: false, reason: "no-reactions" };

    let evasionType = null;
    if (mode === "melee") {
        if (hasSkill(defender, "parry") && hasMeleeWeapon(defender)) {
            evasionType = "parry";
        } else if (hasSkill(defender, "dodge")) {
            evasionType = "dodge";
        }
    } else if (hasSkill(defender, "dodge")) {
        evasionType = "dodge";
    }

    if (!evasionType) return { handled: false, reason: "no-skill" };

    await useReaction({ actor: defender, label: `attempt to ${evasionType}` });

    const evasionRollData = buildEvasionRollData(defender, attackRollData, evasionType);
    await commonRoll(evasionRollData);

    if (Number.isFinite(evasionRollData.numberOfHits)) {
        attackRollData.numberOfHits = evasionRollData.numberOfHits;
    }

    const evaded = evasionRollData.flags?.isSuccess
        && (!Number.isFinite(evasionRollData.numberOfHits) || evasionRollData.numberOfHits <= 0);
    return {
        handled: true,
        evaded,
        remainingHits: evasionRollData.numberOfHits
    };
}

async function applyAttackDamage(rollData, targetToken, { autoResolve } = {}) {
    if (!rollData || !targetToken) return null;
    const shouldApplyDamage = rollData.flags?.isDamageRoll || rollData.flags?.isSuccess;
    if (!shouldApplyDamage) return null;
    if (Number.isFinite(rollData.numberOfHits) && rollData.numberOfHits <= 0) return null;

    if (autoResolve && targetToken.actor?.type === "npc" && rollData.flags?.isSuccess) {
        const mode = rollData.weapon?.isMelee ? "melee" : "ranged";
        const defense = await attemptNpcDefense(rollData, targetToken, { mode });
        if (defense?.evaded) {
            postAutoNpcSummary(
                `${describeTarget(targetToken)} evades the incoming attack.`,
                targetToken.actor,
                targetToken
            );
            return null;
        }
        if (Number.isFinite(defense?.remainingHits) && defense.remainingHits <= 0) {
            postAutoNpcSummary(
                `${describeTarget(targetToken)} evades the incoming attack.`,
                targetToken.actor,
                targetToken
            );
            return null;
        }
    }

    return applyDamage(rollData, [targetToken]);
}

/**
 * Emit an informational chat message summarising an automated step.
 * @param {string} content
 * @param {Actor} actor
 * @param {Token} token
 */
function postAutoNpcSummary(content, actor, token) {
    if (!content) return;
    const speaker = ChatMessage.getSpeaker({ actor, token: token?.document ?? token });
    ChatMessage.create({ content, speaker }).catch(error => {
        console.warn(`[AutoNPC] Failed to post chat summary: ${error?.message ?? error}`);
    });
}

/**
 * Resolve the scene identifier for a token.
 * @param {Token} token
 * @returns {string|null}
 */
function getTokenSceneId(token) {
    return token?.document?.parent?.id ?? token?.scene?.id ?? null;
}

/**
 * Obtain the geometric center point of a token.
 * @param {Token} token
 * @returns {{x:number, y:number}|null}
 */
function getTokenCenter(token) {
    if (!token) return null;
    if (token.center) return token.center;
    if (typeof token.getCenter === "function") return token.getCenter();
    if (token.object && token.object !== token) {
        if (token.object.center) return token.object.center;
        if (typeof token.object.getCenter === "function") return token.object.getCenter();
    }
    return null;
}
/**
 * Measure the grid distance between two tokens.
 * @param {Token} origin
 * @param {Token} target
 * @returns {number}
 */
function measureDistance(origin, target) {
    const grid = canvas?.grid;
    if (!grid) return Number.POSITIVE_INFINITY;
    const originCenter = getTokenCenter(origin);
    const targetCenter = getTokenCenter(target);
    if (!originCenter || !targetCenter) return Number.POSITIVE_INFINITY;
    const distance = grid.measureDistance(originCenter, targetCenter);
    return Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY;
}

/**
 * Convert a weapon range value into a numeric distance.
 * @param {number|string|object} rangeValue
 * @returns {number}
 */
function normalizeRange(rangeValue) {
    if (rangeValue === null || typeof rangeValue === "undefined") return NaN;
    if (typeof rangeValue === "number") return rangeValue;
    if (typeof rangeValue === "object") {
        const nested = rangeValue.value ?? rangeValue.max ?? rangeValue.min;
        if (typeof nested !== "undefined") {
            const numeric = Number(nested);
            if (!Number.isNaN(numeric)) return numeric;
        }
    }
    const numeric = Number(rangeValue);
    if (!Number.isNaN(numeric)) return numeric;
    const match = String(rangeValue).match(/[-+]?[0-9]*\.?[0-9]+/);
    return match ? Number(match[0]) : NaN;
}

/**
 * Determine the range modifier for a given distance and weapon profile.
 * @param {number} distance
 * @param {number} weaponRange
 * @returns {number|null}
 */
function computeRangeModifier(distance, weaponRange) {
    if (!Number.isFinite(distance) || !Number.isFinite(weaponRange) || weaponRange <= 0) return null;

    const pointBlankLimit = 3;
    const shortLimit = weaponRange / 2;
    const standardLimit = weaponRange;
    const longLimit = weaponRange * 2;
    const extremeLimit = weaponRange * 3;

    if (distance <= pointBlankLimit) return 30;
    if (distance <= shortLimit) return 10;
    if (distance <= standardLimit) return 0;
    if (distance <= longLimit) return -10;
    if (distance <= extremeLimit) return -30;
    return null;
}

/**
 * Compute the automatic range selection metadata for an attack.
 * @param {Token} origin
 * @param {Token} target
 * @param {number|string|object} weaponRange
 * @returns {{modifier:number, distance:number, label:string|undefined}|null}
 */
function resolveRangeSelection(origin, target, weaponRange) {
    const rangeValue = normalizeRange(weaponRange);
    if (!Number.isFinite(rangeValue) || rangeValue <= 0) return null;
    const distance = measureDistance(origin, target);
    if (!Number.isFinite(distance)) return null;
    const modifier = computeRangeModifier(distance, rangeValue);
    if (modifier === null) return null;

    const configRanges = game.darkHeresy?.config?.ranges ?? {};
    const label = configRanges[modifier];
    const localized = label ? game.i18n?.localize?.(label) ?? label : undefined;

    return { modifier, distance, label: localized };
}

/**
 * Determine the remaining wounds ratio for a token's actor.
 * @param {Token} token
 * @returns {number}
 */
function getHealthRatio(token) {
    const system = token?.actor?.system ?? {};
    const wounds = system.wounds ?? {};
    const current = Number(wounds.value ?? wounds.current ?? 0);
    const max = Number(wounds.max ?? wounds.maximum ?? 0);
    if (max > 0) return current / max;
    if (Number.isFinite(current)) return current;
    return Number.POSITIVE_INFINITY;
}

/**
 * Check whether a token passes an actor type filter.
 * @param {Token} token
 * @param {string} filter
 * @returns {boolean}
 */
function passesFilter(token, filter) {
    const actorType = token?.actor?.type;
    const normalized = (filter ?? TARGET_FILTERS.ANY).toString().toLowerCase();
    switch (normalized) {
        case TARGET_FILTERS.NPC_ONLY:
            return actorType === "npc";
        case TARGET_FILTERS.ACOLYTE_ONLY:
            return actorType === "acolyte";
        default:
            return true;
    }
}

/**
 * Convert grid units into pixel distance.
 * @param {number} units
 * @returns {number|null}
 */
function unitsToPixels(units) {
    if (!Number.isFinite(units)) return null;
    const gridSize = canvas?.grid?.size;
    const gridDistance = canvas?.scene?.gridDistance;
    if (!gridSize || !gridDistance) return null;
    return (units / gridDistance) * gridSize;
}

/**
 * Compute a movement destination towards or away from a target.
 * @param {Token} originToken
 * @param {Token} targetToken
 * @param {number} maxUnits
 * @param {object} [options]
 * @param {boolean} [options.stopAtContact]
 * @param {boolean} [options.retreat]
 * @returns {{x:number,y:number}|null}
 */
function computeMovementDestination(
    originToken,
    targetToken,
    maxUnits,
    { stopAtContact = false, retreat = false } = {}
) {
    const originCenter = getTokenCenter(originToken);
    const targetCenter = getTokenCenter(targetToken);
    if (!originCenter || !targetCenter) return null;

    const vectorX = targetCenter.x - originCenter.x;
    const vectorY = targetCenter.y - originCenter.y;
    const vectorLength = Math.hypot(vectorX, vectorY);
    if (!Number.isFinite(vectorLength) || vectorLength === 0) return null;

    const maxPixels = unitsToPixels(maxUnits);
    if (!Number.isFinite(maxPixels) || maxPixels <= 0) return null;

    const gridSize = canvas?.grid?.size ?? 1;
    const originRadius = ((originToken?.document?.width ?? 1) * gridSize) / 2;
    const targetRadius = ((targetToken?.document?.width ?? 1) * gridSize) / 2;
    const desiredPixels = retreat ? maxPixels : Math.min(maxPixels, vectorLength);

    let travelPixels = desiredPixels;
    if (!retreat && stopAtContact) {
        const contactDistance = Math.max(originRadius + targetRadius, 0);
        travelPixels = Math.min(travelPixels, Math.max(vectorLength - contactDistance, 0));
    }

    if (travelPixels <= 0) return null;

    const directionMultiplier = retreat ? -1 : 1;
    const ratio = travelPixels / vectorLength;
    const newCenterX = originCenter.x + (directionMultiplier * vectorX * ratio);
    const newCenterY = originCenter.y + (directionMultiplier * vectorY * ratio);

    const halfWidth = ((originToken?.document?.width ?? 1) * gridSize) / 2;
    const halfHeight = ((originToken?.document?.height ?? 1) * gridSize) / 2;
    const newX = newCenterX - halfWidth;
    const newY = newCenterY - halfHeight;

    if (!Number.isFinite(newX) || !Number.isFinite(newY)) return null;
    return { x: newX, y: newY };
}

/**
 * Move a token toward a destination object.
 * @param {Token} token
 * @param {{x:number,y:number}} destination
 * @returns {Promise<boolean>}
 */
async function moveTokenTo(token, destination) {
    if (!token || !destination) return false;
    try {
        await token.document?.update(destination);
        return true;
    } catch(error) {
        warnAutoNpc(`Failed to move ${token.name ?? token.actor?.name ?? "token"}: ${error?.message ?? error}`);
        return false;
    }
}

/**
 * Move a token away from a target token.
 * @param {Token} token
 * @param {Token} threat
 * @param {number} distanceUnits
 */
async function retreatFromTarget(token, threat, distanceUnits) {
    const destination = computeMovementDestination(token, threat, distanceUnits, { retreat: true });
    if (destination) {
        const moved = await moveTokenTo(token, destination);
        if (moved) {
            postAutoNpcSummary(`${token.name ?? token.actor?.name ?? "NPC"} retreats from ${describeTarget(threat)}.`, token.actor, token);
        }
    } else {
        warnAutoNpc("Unable to determine retreat path.");
    }
}
/**
 * Select a hostile token using the provided targeting mode and filters.
 * @param {Token} originToken
 * @param {object} [options]
 * @param {string} [options.mode]
 * @param {string} [options.filter]
 * @param {boolean} [options.includeFriendlies=false]
 * @param {boolean} [options.logWarnings=true]
 * @returns {Token|null}
 */
export function selectHostileTarget(originToken, {
    mode = TARGETING_MODES.CLOSEST,
    filter = TARGET_FILTERS.ANY,
    includeFriendlies = false,
    logWarnings = true
} = {}) {
    const canvasTokens = canvas?.tokens?.placeables ?? [];
    const sceneId = originToken ? getTokenSceneId(originToken) : null;
    const hostileDisposition = CONST?.TOKEN_DISPOSITIONS?.HOSTILE ?? -1;

    const normalizedMode = (mode ?? TARGETING_MODES.CLOSEST).toString().toLowerCase();
    let effectiveFilter = (filter ?? TARGET_FILTERS.ANY).toString().toLowerCase();

    if (normalizedMode === TARGETING_MODES.NPC_ONLY) {
        effectiveFilter = TARGET_FILTERS.NPC_ONLY;
    } else if (normalizedMode === TARGETING_MODES.ACOLYTE_ONLY) {
        effectiveFilter = TARGET_FILTERS.ACOLYTE_ONLY;
    }

    const available = canvasTokens.filter(token => {
        if (!token?.actor) return false;
        const tokenSceneId = getTokenSceneId(token);
        if (sceneId && tokenSceneId !== sceneId) return false;
        const tokenId = token.id ?? token.document?.id;
        const originId = originToken ? originToken.id ?? originToken.document?.id : null;
        if (originId && tokenId === originId) return false;
        if (!passesFilter(token, effectiveFilter)) return false;
        if (includeFriendlies) return true;
        return token.document?.disposition === hostileDisposition;
    });

    if (!available.length) {
        if (logWarnings) warnAutoNpc(`No valid ${mode} targets available.`);
        return null;
    }

    let selectionMode = normalizedMode;
    if (selectionMode === TARGETING_MODES.NPC_ONLY || selectionMode === TARGETING_MODES.ACOLYTE_ONLY) {
        selectionMode = TARGETING_MODES.CLOSEST;
    }

    switch (selectionMode) {
        case TARGETING_MODES.TARGETED: {
            const targets = Array.from(game.user?.targets ?? []);
            const availableIds = new Set(available.map(t => t.id ?? t.document?.id));
            const match = targets.find(t => availableIds.has(t.id ?? t.document?.id));
            if (!match && logWarnings) warnAutoNpc(`No valid ${mode} targets available.`);
            return match ?? null;
        }
        case TARGETING_MODES.RANDOM: {
            const index = Math.floor(Math.random() * available.length);
            return available[index] ?? null;
        }
        case TARGETING_MODES.WEAKEST: {
            return available.slice().sort((a, b) => getHealthRatio(a) - getHealthRatio(b))[0] ?? null;
        }
        case TARGETING_MODES.STRONGEST: {
            return available.slice().sort((a, b) => getHealthRatio(b) - getHealthRatio(a))[0] ?? null;
        }
        case TARGETING_MODES.CLOSEST:
        default: {
            if (!originToken) return available[0] ?? null;
            let closestToken = null;
            let closestDistance = Number.POSITIVE_INFINITY;
            for (const token of available) {
                const distance = measureDistance(originToken, token);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestToken = token;
                }
            }
            return closestToken ?? available[0] ?? null;
        }
    }
}

/**
 * Identify the token that should perform the automated action.
 * @param {object} [options]
 * @param {boolean} [options.fallbackToCombatant=true]
 * @returns {Token|null}
 */
function resolveActingToken({ fallbackToCombatant = true } = {}) {
    const controlled = canvas.tokens?.controlled ?? [];
    if (controlled.length === 1) return controlled[0];
    if (controlled.length > 1) return controlled[0];
    const targets = Array.from(game.user?.targets ?? []);
    if (targets.length) return targets[0];
    if (fallbackToCombatant) {
        const combatant = game.combat?.combatant;
        if (combatant) {
            const tokenId = combatant.tokenId ?? combatant.token?.id;
            const token = canvas.tokens?.get(tokenId) ?? combatant.token?.object ?? null;
            if (token) return token;
        }
    }
    return null;
}

function getChargeRange(actor) {
    const movement = actor?.system?.movement ?? {};
    const chargeRange = Number(movement.charge ?? movement.full ?? 0);
    return Number.isFinite(chargeRange) ? chargeRange : 0;
}

function getHostileTargets(originToken, { includeFriendlies = false } = {}) {
    const canvasTokens = canvas?.tokens?.placeables ?? [];
    const sceneId = originToken ? getTokenSceneId(originToken) : null;
    const hostileDisposition = CONST?.TOKEN_DISPOSITIONS?.HOSTILE ?? -1;
    return canvasTokens.filter(token => {
        if (!token?.actor) return false;
        const tokenSceneId = getTokenSceneId(token);
        if (sceneId && tokenSceneId !== sceneId) return false;
        const tokenId = token.id ?? token.document?.id;
        const originId = originToken ? originToken.id ?? originToken.document?.id : null;
        if (originId && tokenId === originId) return false;
        if (includeFriendlies) return true;
        return token.document?.disposition === hostileDisposition;
    });
}

function resolveTargetToken(actingToken, { targetId, includeFriendlies = false } = {}) {
    if (targetId) {
        const target = canvas.tokens?.get(targetId) ?? null;
        if (target) return target;
    }
    const targets = Array.from(game.user?.targets ?? []);
    if (targets.length) return targets[0];
    const hostiles = getHostileTargets(actingToken, { includeFriendlies });
    return hostiles[0] ?? null;
}

/**
 * Locate a weapon item on an actor using the provided predicate.
 * @param {Actor} actor
 * @param {string} preferredName
 * @param {Function} predicate
 * @returns {Item|null}
 */
function findWeapon(actor, preferredName, predicate) {
    if (!actor) return null;
    const weapons = actor.items?.filter(i => i.type === "weapon") ?? [];
    if (!weapons.length) return null;
    if (preferredName) {
        const matching = weapons.find(w => w.id === preferredName || w.name === preferredName);
        if (matching) return matching;
    }
    return weapons.find(predicate) ?? null;
}

/**
 * Build and execute a combat roll before applying damage to the target token.
 * @param {Actor} actor
 * @param {Item} weapon
 * @param {Token} targetToken
 * @param {Function} configureRoll
 * @param {object} [options]
 * @param {boolean} [options.autoResolveDefense]
 * @returns {Promise<object|null>}
 */
async function executeCombatRoll(actor, weapon, targetToken, configureRoll, { autoResolveDefense = false } = {}) {
    if (!actor || !weapon || !targetToken) return null;

    const rollData = DarkHeresyUtil.createWeaponRollData(actor, weapon);
    rollData.flags = rollData.flags ?? {};
    rollData.flags.isCombatRoll = true;
    rollData.flags.autoNpc = true;
    rollData.target = rollData.target ?? {};
    rollData.target.modifier = rollData.target.modifier ?? 0;

    const preWounds = Number(targetToken.actor?.system?.wounds?.value);

    if (typeof configureRoll === "function") {
        const result = await configureRoll(rollData, targetToken);
        if (result && typeof result === "object" && result.abort) {
            return { rollData, success: false, aborted: true, reason: result.reason };
        }
    }

    await combatRoll(rollData);

    let appliedActors = [];
    appliedActors = await applyAttackDamage(rollData, targetToken, { autoResolve: autoResolveDefense });

    const updatedActor = appliedActors?.[0] ?? targetToken.actor;
    const postWounds = Number(updatedActor?.system?.wounds?.value ?? targetToken.actor?.system?.wounds?.value);
    let inflictedDamage = 0;
    if (Number.isFinite(preWounds) && Number.isFinite(postWounds)) {
        inflictedDamage = Math.max(postWounds - preWounds, 0);
    }

    return { rollData, success: rollData.flags?.isSuccess !== false, target: targetToken, inflictedDamage };
}

/**
 * Describe a token for chat summaries.
 * @param {Token} token
 * @returns {string}
 */
function describeTarget(token) {
    return token?.name ?? token?.actor?.name ?? token?.document?.name ?? game.i18n?.localize?.("CHAT.CONTEXT.APPLY_DAMAGE") ?? "target";
}

async function autoRangedAttack({
    weaponId,
    targetId,
    attackType = "standard",
    aimValue = 0,
    includeFriendlies = false,
    autoResolveDefense = false
} = {}) {
    const actingToken = resolveActingToken();
    if (!actingToken) return warnAutoNpc("Select a token before running Auto Shoot.");

    const actor = actingToken.actor;
    if (!actor) return warnAutoNpc("The controlled token has no linked actor.");

    const weapon = findWeapon(actor, weaponId, item => {
        const weaponClass = item.class ?? item.system?.class;
        return weaponClass && weaponClass !== "melee";
    });
    if (!weapon) return warnAutoNpc(`${actor.name} has no ranged weapon.`);

    const targetToken = resolveTargetToken(actingToken, { targetId, includeFriendlies });
    if (!targetToken) return warnAutoNpc("No valid targets found for shooting.");

    try {
        const result = await executeCombatRoll(
            actor,
            weapon,
            targetToken,
            async rollData => {
                if (rollData.weapon?.isRange && rollData.weapon.clip?.value <= 0) {
                    await reportEmptyClip(rollData);
                    throw new Error("EMPTY_CLIP");
                }

                const rangeSelection = resolveRangeSelection(actingToken, targetToken, rollData.weapon?.range);
                if (!rangeSelection) {
                    throw new Error("OUT_OF_RANGE");
                }

                rollData.rangeMod = rangeSelection.modifier;
                if (rangeSelection.label) rollData.rangeModText = rangeSelection.label;
                rollData.attackType = {
                    name: attackType,
                    text: getConfigLabel(game.darkHeresy?.config?.attackTypeRanged, attackType, "ATTACK_TYPE.STANDARD")
                };
                let adjustedAim = aimValue;
                if (rollData.weapon?.traits?.inaccurate) {
                    adjustedAim = 0;
                } else if (rollData.weapon?.traits?.accurate && aimValue > 0) {
                    adjustedAim += 10;
                }
                rollData.aim = {
                    val: adjustedAim,
                    isAiming: adjustedAim > 0,
                    text: getConfigLabel(game.darkHeresy?.config?.aimModes, adjustedAim, "AIMING.NONE")
                };
            },
            { autoResolveDefense }
        );

        if (result?.aborted) return { outcome: "aborted" };

        if (result) {
            const damageText = Number.isFinite(result.inflictedDamage) ? result.inflictedDamage : 0;
            const summary = `${actor.name} fires ${weapon.name} at ${describeTarget(targetToken)} for ${damageText} damage!`;
            postAutoNpcSummary(summary, actor, actingToken);
            return { outcome: "npc-fired", result };
        }

        return { outcome: "npc-fired" };
    } catch(error) {
        if (error?.message === "EMPTY_CLIP") {
            warnAutoNpc(`${actor.name} attempted to fire ${weapon.name} but is out of ammo.`);
            return { outcome: "no-ammo" };
        }
        if (error?.message === "OUT_OF_RANGE") {
            return warnAutoNpc(`${weapon.name} is out of range for ${actor.name}.`);
        }
        throw error;
    }
}

async function autoMeleeAttack({
    weaponId,
    targetId,
    charge = false,
    includeFriendlies = false,
    autoResolveDefense = false
} = {}) {
    const actingToken = resolveActingToken();
    if (!actingToken) return warnAutoNpc("Select a token before running Auto Melee.");

    const actor = actingToken.actor;
    if (!actor) return warnAutoNpc("The controlled token has no linked actor.");

    const weapon = findWeapon(
        actor,
        weaponId,
        item => (item.class ?? item.system?.class) === "melee"
    );
    if (!weapon) return warnAutoNpc(`${actor.name} has no melee weapon.`);

    const targetToken = resolveTargetToken(actingToken, { targetId, includeFriendlies });
    if (!targetToken) return warnAutoNpc("No valid targets found for melee.");

    const chargeRange = getChargeRange(actor);
    const meleeDistance = measureDistance(actingToken, targetToken);

    if (charge) {
        if (!Number.isFinite(meleeDistance)) return warnAutoNpc("Unable to measure distance to target for charge.");
        if (!Number.isFinite(chargeRange) || chargeRange <= 0) {
            return warnAutoNpc(`${actor.name} cannot determine a charge distance.`);
        }
        if (meleeDistance > chargeRange) {
            return warnAutoNpc(`${describeTarget(targetToken)} is out of charge range (${chargeRange}).`);
        }
        const destination = computeMovementDestination(actingToken, targetToken, chargeRange, { stopAtContact: true });
        if (destination) await moveTokenTo(actingToken, destination);
    } else if (Number.isFinite(meleeDistance) && meleeDistance > 3) {
        return warnAutoNpc(`${describeTarget(targetToken)} is too far away for a melee attack.`);
    }

    let result = null;
    try {
        result = await executeCombatRoll(
            actor,
            weapon,
            targetToken,
            rollData => {
                rollData.attackType = {
                    name: charge ? "charge" : "standard",
                    text: getConfigLabel(
                        game.darkHeresy?.config?.attackTypeMelee,
                        charge ? "charge" : "standard",
                        "ATTACK_TYPE.STANDARD"
                    )
                };
                rollData.aim = { val: 0, isAiming: false };
                rollData.rangeMod = 0;
            },
            { autoResolveDefense }
        );
    } catch(error) {
        return warnAutoNpc(`Melee attack failed: ${error?.message ?? error}`);
    }

    const action = charge ? "charges" : "attacks";
    const summary = `${actor.name} ${action} ${describeTarget(targetToken)} with ${weapon.name}!`;
    postAutoNpcSummary(summary, actor, actingToken);
    return result;
}

export async function attackMenu() {
    const actingToken = resolveActingToken();
    if (!actingToken) return warnAutoNpc("Select a token before running Auto Attack Menu.");

    const actor = actingToken.actor;
    if (!actor) return warnAutoNpc("The controlled token has no linked actor.");

    const rangedOptions = getWeaponOptions(actor, { rangedOnly: true });
    const meleeOptions = getWeaponOptions(actor, { meleeOnly: true });

    if (!rangedOptions.length && !meleeOptions.length) {
        return warnAutoNpc(`${actor.name} has no weapons to use.`);
    }

    const targets = getHostileTargets(actingToken);
    if (!targets.length) {
        return warnAutoNpc("No valid targets found for attacks.");
    }
    const targetOptions = getTargetOptions(actingToken, targets, { chargeRange: getChargeRange(actor) });
    const defaultTargetId = Array.from(game.user?.targets ?? [])[0]?.id ?? targetOptions[0]?.id ?? "";
    const selectedTargets = targetOptions.map(option => ({
        ...option,
        selected: option.id === defaultTargetId
    }));

    const dialogData = {
        actorName: actor.name,
        rangedWeapons: rangedOptions,
        meleeWeapons: meleeOptions,
        targets: selectedTargets,
        defaultTargetId,
        chargeRange: getChargeRange(actor),
        units: canvas?.scene?.gridUnits ?? "m"
    };

    const html = await renderTemplate("systems/dark-heresy/template/dialog/auto-npc-attack.hbs", dialogData);
    let dialog;
    dialog = new Dialog({
        title: `Auto Attacks: ${actor.name}`,
        content: html,
        buttons: {
            aimShoot: {
                icon: "<i class=\"fa-solid fa-bullseye\"></i>",
                label: "Aim + Shoot",
                callback: html => {
                    const targetId = html.find("#auto-npc-target").val();
                    const weaponId = html.find("#auto-npc-ranged-weapon").val();
                    return autoRangedAttack({
                        weaponId,
                        targetId,
                        attackType: "standard",
                        aimValue: 10,
                        autoResolveDefense: true
                    });
                }
            },
            semiAuto: {
                icon: "<i class=\"fa-solid fa-crosshairs\"></i>",
                label: "Semi-Auto",
                callback: html => {
                    const targetId = html.find("#auto-npc-target").val();
                    const weaponId = html.find("#auto-npc-ranged-weapon").val();
                    return autoRangedAttack({
                        weaponId,
                        targetId,
                        attackType: "semi_auto",
                        aimValue: 0,
                        autoResolveDefense: true
                    });
                }
            },
            fullAuto: {
                icon: "<i class=\"fa-solid fa-gun\"></i>",
                label: "Full Auto",
                callback: html => {
                    const targetId = html.find("#auto-npc-target").val();
                    const weaponId = html.find("#auto-npc-ranged-weapon").val();
                    return autoRangedAttack({
                        weaponId,
                        targetId,
                        attackType: "full_auto",
                        aimValue: 0,
                        autoResolveDefense: true
                    });
                }
            },
            melee: {
                icon: "<i class=\"fa-solid fa-hand-fist\"></i>",
                label: "Melee Attack",
                callback: html => {
                    const targetId = html.find("#auto-npc-target").val();
                    const weaponId = html.find("#auto-npc-melee-weapon").val();
                    return autoMeleeAttack({ weaponId, targetId, autoResolveDefense: true });
                }
            },
            charge: {
                icon: "<i class=\"fa-solid fa-person-running\"></i>",
                label: "Charge + Attack",
                callback: html => {
                    const targetId = html.find("#auto-npc-target").val();
                    const weaponId = html.find("#auto-npc-melee-weapon").val();
                    return autoMeleeAttack({ weaponId, targetId, charge: true, autoResolveDefense: true });
                }
            },
            cancel: {
                icon: "<i class=\"fa-solid fa-times\"></i>",
                label: game.i18n.localize("BUTTON.CANCEL"),
                callback: () => {}
            }
        },
        default: "aimShoot",
        close: () => { dialog = null; }
    }, { width: 420 });
    dialog.render(true);
}

export async function aimedShot({ weaponId, targetId } = {}) {
    return autoRangedAttack({
        weaponId,
        targetId,
        attackType: "standard",
        aimValue: 10,
        autoResolveDefense: true
    });
}

export async function semiAutoShot({ weaponId, targetId } = {}) {
    return autoRangedAttack({
        weaponId,
        targetId,
        attackType: "semi_auto",
        aimValue: 0,
        autoResolveDefense: true
    });
}

export async function fullAutoShot({ weaponId, targetId } = {}) {
    return autoRangedAttack({
        weaponId,
        targetId,
        attackType: "full_auto",
        aimValue: 0,
        autoResolveDefense: true
    });
}

export async function meleeEngage({ weaponId, targetId, charge = false } = {}) {
    return autoMeleeAttack({
        weaponId,
        targetId,
        charge,
        autoResolveDefense: true
    });
}

export async function opposingAimedShot({ weaponId } = {}) {
    const actingToken = resolveActingToken();
    if (!actingToken) return warnAutoNpc("Select a token before running Opposing Aim + Shoot.");
    const targetToken = findNearestOpposingTarget(actingToken);
    if (!targetToken) return warnAutoNpc("No opposing faction targets found.");
    return autoRangedAttack({
        weaponId,
        targetId: targetToken.id ?? targetToken.document?.id,
        attackType: "standard",
        aimValue: 10,
        autoResolveDefense: true
    });
}

export async function opposingSemiAutoShot({ weaponId } = {}) {
    const actingToken = resolveActingToken();
    if (!actingToken) return warnAutoNpc("Select a token before running Opposing Semi-Auto.");
    const targetToken = findNearestOpposingTarget(actingToken);
    if (!targetToken) return warnAutoNpc("No opposing faction targets found.");
    return autoRangedAttack({
        weaponId,
        targetId: targetToken.id ?? targetToken.document?.id,
        attackType: "semi_auto",
        aimValue: 0,
        autoResolveDefense: true
    });
}

export async function opposingFullAutoShot({ weaponId } = {}) {
    const actingToken = resolveActingToken();
    if (!actingToken) return warnAutoNpc("Select a token before running Opposing Full Auto.");
    const targetToken = findNearestOpposingTarget(actingToken);
    if (!targetToken) return warnAutoNpc("No opposing faction targets found.");
    return autoRangedAttack({
        weaponId,
        targetId: targetToken.id ?? targetToken.document?.id,
        attackType: "full_auto",
        aimValue: 0,
        autoResolveDefense: true
    });
}

export async function opposingMeleeAttack({ weaponId } = {}) {
    const actingToken = resolveActingToken();
    if (!actingToken) return warnAutoNpc("Select a token before running Opposing Melee Attack.");
    const targetToken = findNearestOpposingTarget(actingToken);
    if (!targetToken) return warnAutoNpc("No opposing faction targets found.");
    return autoMeleeAttack({
        weaponId,
        targetId: targetToken.id ?? targetToken.document?.id,
        charge: false,
        autoResolveDefense: true
    });
}

export async function opposingChargeAttack({ weaponId } = {}) {
    const actingToken = resolveActingToken();
    if (!actingToken) return warnAutoNpc("Select a token before running Opposing Charge + Attack.");
    const targetToken = findNearestOpposingTarget(actingToken);
    if (!targetToken) return warnAutoNpc("No opposing faction targets found.");
    return autoMeleeAttack({
        weaponId,
        targetId: targetToken.id ?? targetToken.document?.id,
        charge: true,
        autoResolveDefense: true
    });
}

/**
 * Charge the selected hostile and perform a melee attack.
 * @param {object} [options]
 * @param {string} [options.weaponId]
 * @param {string} [options.weaponName]
 * @param {string} [options.targetMode]
 * @param {string} [options.targetFilter]
 * @param {boolean} [options.includeFriendlies]
 * @returns {Promise<object|null>}
 */
export async function autoChargeMelee({
    weaponId,
    weaponName,
    targetMode = TARGETING_MODES.CLOSEST,
    targetFilter = TARGET_FILTERS.ANY,
    includeFriendlies = false
} = {}) {
    const actingToken = resolveActingToken();
    if (!actingToken) return warnAutoNpc("Select a token before running Auto Charge + Melee.");

    const actor = actingToken.actor;
    if (!actor) return warnAutoNpc("The controlled token has no linked actor.");

    const weapon = findWeapon(
        actor,
        weaponId ?? weaponName,
        item => (item.class ?? item.system?.class) === "melee"
    );
    if (!weapon) return warnAutoNpc(`${actor.name} has no melee weapon.`);

    const targetToken = selectHostileTarget(actingToken, {
        mode: targetMode,
        filter: targetFilter,
        includeFriendlies,
        logWarnings: false
    });
    if (!targetToken) return warnAutoNpc("No valid targets found for charge.");

    const movement = actor.system?.movement ?? {};
    const chargeRange = Number(movement.charge ?? movement.full ?? 0);
    if (!Number.isFinite(chargeRange) || chargeRange <= 0) {
        return warnAutoNpc(`${actor.name} cannot determine a charge distance.`);
    }

    const meleeDistance = measureDistance(actingToken, targetToken);
    if (!Number.isFinite(meleeDistance)) return warnAutoNpc("Unable to measure distance to target for charge.");

    if (meleeDistance <= chargeRange) {
        const destination = computeMovementDestination(actingToken, targetToken, chargeRange, { stopAtContact: true });
        if (destination) await moveTokenTo(actingToken, destination);

        let result = null;
        try {
            result = await executeCombatRoll(
                actor,
                weapon,
                targetToken,
                rollData => {
                    rollData.attackType = {
                        name: "charge",
                        text: game.i18n?.localize?.("ATTACK_TYPE.CHARGE") ?? "ATTACK_TYPE.CHARGE"
                    };
                    rollData.aim = { val: 0, isAiming: false };
                    rollData.rangeMod = 0;
                }
            );
        } catch(error) {
            return warnAutoNpc(`Charge attack failed: ${error?.message ?? error}`);
        }

        const summary = `${actor.name} charges ${describeTarget(targetToken)} with ${weapon.name}!`;
        postAutoNpcSummary(summary, actor, actingToken);
        return result;
    }

    const fullMove = Number(movement.full ?? 0);
    if (!Number.isFinite(fullMove) || fullMove <= 0) {
        return warnAutoNpc(`${actor.name} cannot move toward the target.`);
    }

    const destination = computeMovementDestination(actingToken, targetToken, fullMove);
    if (destination) {
        await moveTokenTo(actingToken, destination);
        postAutoNpcSummary(`${actor.name} advances toward ${describeTarget(targetToken)} (Full Move).`, actor, actingToken);
    } else {
        warnAutoNpc("Unable to determine movement path toward target.");
    }
    return null;
}
/**
 * Perform a ranged attack using the configured targeting strategy.
 * @param {object} [options]
 * @param {string} [options.weaponId]
 * @param {string} [options.weaponName]
 * @param {string} [options.targetMode]
 * @param {string} [options.targetFilter]
 * @param {boolean} [options.includeFriendlies]
 * @returns {Promise<object|null>}
 */
export async function autoShoot({
    weaponId,
    weaponName,
    targetMode = TARGETING_MODES.CLOSEST,
    targetFilter = TARGET_FILTERS.ANY,
    includeFriendlies = false
} = {}) {
    const actingToken = resolveActingToken();
    if (!actingToken) return warnAutoNpc("Select a token before running Auto Shoot.");

    const actor = actingToken.actor;
    if (!actor) return warnAutoNpc("The controlled token has no linked actor.");

    const weapon = findWeapon(actor, weaponId ?? weaponName, item => {
        const weaponClass = item.class ?? item.system?.class;
        return weaponClass && weaponClass !== "melee";
    });
    if (!weapon) return warnAutoNpc(`${actor.name} has no ranged weapon.`);

    if (actor.type === "acolyte") {
        const rollData = DarkHeresyUtil.createWeaponRollData(actor, weapon);
        await prepareCombatRoll(rollData, actor);
        return { outcome: "acolyte-ui" };
    }

    const targetToken = selectHostileTarget(actingToken, {
        mode: targetMode,
        filter: targetFilter,
        includeFriendlies,
        logWarnings: false
    });
    if (!targetToken) return warnAutoNpc("No valid targets found for shooting.");

    try {
        const result = await executeCombatRoll(
            actor,
            weapon,
            targetToken,
            async rollData => {
                if (rollData.weapon?.isRange && rollData.weapon.clip?.value <= 0) {
                    await reportEmptyClip(rollData);
                    throw new Error("EMPTY_CLIP");
                }

                const rangeSelection = resolveRangeSelection(actingToken, targetToken, rollData.weapon?.range);
                if (!rangeSelection) {
                    throw new Error("OUT_OF_RANGE");
                }

                rollData.rangeMod = rangeSelection.modifier;
                if (rangeSelection.label) rollData.rangeModText = rangeSelection.label;
                rollData.attackType = {
                    name: "standard",
                    text: game.i18n?.localize?.("ATTACK_TYPE.STANDARD") ?? "ATTACK_TYPE.STANDARD"
                };
                rollData.aim = { val: 0, isAiming: false };
            }
        );

        if (result?.aborted) return { outcome: "aborted" };

        if (result) {
            const damageText = Number.isFinite(result.inflictedDamage) ? result.inflictedDamage : 0;
            const summary = `${actor.name} shoots ${describeTarget(targetToken)} for ${damageText} damage!`;
            postAutoNpcSummary(summary, actor, actingToken);
            return { outcome: "npc-fired", result };
        }

        return { outcome: "npc-fired" };
    } catch(error) {
        if (error?.message === "EMPTY_CLIP") {
            warnAutoNpc(`${actor.name} attempted to fire ${weapon.name} but is out of ammo.`);
            return { outcome: "no-ammo" };
        }
        if (error?.message === "OUT_OF_RANGE") {
            return warnAutoNpc(`${weapon.name} is out of range for ${actor.name}.`);
        }
        throw error;
    }
}

/**
 * Execute behaviour for an actor's configured personality.
 * @param {object} [options]
 * @param {string} [options.personalityOverride]
 * @returns {Promise<void>}
 */
export async function autoTurn({ personalityOverride } = {}) {
    const actingToken = resolveActingToken({ fallbackToCombatant: true });
    if (!actingToken) return warnAutoNpc("Select a token before running Auto Turn.");

    const actor = actingToken.actor;
    if (!actor) return warnAutoNpc("The controlled token has no linked actor.");

    const personalityId = personalityOverride ?? actor.system?.personality;
    if (!personalityId) return warnAutoNpc(`${actor.name} has no personality assigned.`);

    const definition = PERSONALITY_DEFINITIONS[personalityId];
    if (!definition) return warnAutoNpc(`${actor.name} has an unknown personality (${personalityId}).`);

    const context = { actor, token: actingToken };

    try {
        await definition.execute(context);
    } catch(error) {
        warnAutoNpc(`Personality execution failed: ${error?.message ?? error}`);
    }

    const combatantTokenId = game.combat?.combatant?.tokenId ?? game.combat?.combatant?.token?.id;
    if (game.combat && combatantTokenId === (actingToken.id ?? actingToken.document?.id)) {
        try {
            await game.combat.nextTurn();
        } catch(error) {
            warnAutoNpc(`Failed to advance turn: ${error?.message ?? error}`);
        }
    }
}

/**
 * Obtain the actor's reaction state.
 * @param {Actor} actor
 * @returns {{max:number,current:number}}
 */
function getReactionState(actor) {
    const reactions = actor?.system?.reactions ?? {};
    const max = Number(reactions.max ?? reactions.maximum ?? 0);
    const current = Number(reactions.current ?? reactions.value ?? 0);
    return {
        max: Number.isFinite(max) ? max : 0,
        current: Number.isFinite(current) ? current : 0
    };
}

/**
 * Spend one reaction if available.
 * @param {object} [options]
 * @param {Actor} [options.actor]
 * @param {string} [options.label]
 * @returns {Promise<number|null>}
 */
export async function useReaction({ actor, label = "use a reaction" } = {}) {
    if (!actor) return warnAutoNpc("No actor provided to spend a reaction.");
    if (!actor.isOwner) return null;

    const state = getReactionState(actor);
    if (state.current <= 0) {
        return warnAutoNpc(`${actor.name} attempted to ${label} but has 0 reactions remaining.`);
    }

    const newValue = state.current - 1;
    await actor.update({ "system.reactions.current": newValue });
    return newValue;
}

/**
 * Reset the actor's reactions to its maximum.
 * @param {Actor} actor
 * @returns {Promise<number|null>}
 */
export async function resetReactions(actor) {
    if (!actor || !actor.isOwner) return null;
    const state = getReactionState(actor);
    await actor.update({ "system.reactions.current": state.max });
    return state.max;
}

/**
 * Emit a warning when the system fails to refresh reactions.
 * @param {Error} error
 */
function describeCombatantResetFailure(error) {
    warnAutoNpc(`Failed to reset reactions: ${error?.message ?? error}`);
}

async function ensureAutoNpcMacro({ name, command, img, folderId }) {
    const existing = game.macros?.contents?.find(m => m.name === name);
    if (existing) {
        const updates = {};
        if (existing.command !== command) updates.command = command;
        if (img && existing.img !== img) updates.img = img;
        if (folderId && existing.folder?.id !== folderId) updates.folder = folderId;
        if (Object.keys(updates).length) {
            await existing.update(updates);
        }
        return existing;
    }

    return Macro.create({
        name,
        type: "script",
        img,
        command,
        folder: folderId
    }, { displaySheet: false });
}

async function createAutoAttackMacros() {
    if (!game.user?.isGM) return;
    const folderName = "AutoNPC v0.4";
    let folder = game.folders?.find(entry => entry.name === folderName && entry.type === "Macro") ?? null;
    if (!folder) {
        folder = await Folder.create({ name: folderName, type: "Macro" });
    }
    const folderId = folder?.id ?? null;

    const macros = [
        {
            name: "AutoNPC: Attack Menu",
            command: "game.darkHeresy.macros.autoNpc.attackMenu();",
            img: "icons/svg/target.svg"
        },
        {
            name: "AutoNPC: Opposing Aim + Shoot",
            command: "game.darkHeresy.macros.autoNpc.opposingAimedShot();",
            img: "icons/svg/bullseye.svg"
        },
        {
            name: "AutoNPC: Opposing Semi-Auto",
            command: "game.darkHeresy.macros.autoNpc.opposingSemiAutoShot();",
            img: "icons/svg/arrow-right.svg"
        },
        {
            name: "AutoNPC: Opposing Full Auto",
            command: "game.darkHeresy.macros.autoNpc.opposingFullAutoShot();",
            img: "icons/svg/rays.svg"
        },
        {
            name: "AutoNPC: Opposing Melee Attack",
            command: "game.darkHeresy.macros.autoNpc.opposingMeleeAttack();",
            img: "icons/svg/sword.svg"
        },
        {
            name: "AutoNPC: Opposing Charge + Attack",
            command: "game.darkHeresy.macros.autoNpc.opposingChargeAttack();",
            img: "icons/svg/daze.svg"
        },
        {
            name: "AutoNPC: Aim + Shoot",
            command: "game.darkHeresy.macros.autoNpc.aimedShot();",
            img: "icons/svg/bullseye.svg"
        },
        {
            name: "AutoNPC: Semi-Auto Burst",
            command: "game.darkHeresy.macros.autoNpc.semiAutoShot();",
            img: "icons/svg/arrow-right.svg"
        },
        {
            name: "AutoNPC: Full-Auto Burst",
            command: "game.darkHeresy.macros.autoNpc.fullAutoShot();",
            img: "icons/svg/rays.svg"
        },
        {
            name: "AutoNPC: Melee Attack",
            command: "game.darkHeresy.macros.autoNpc.meleeEngage();",
            img: "icons/svg/sword.svg"
        },
        {
            name: "AutoNPC: Charge + Attack",
            command: "game.darkHeresy.macros.autoNpc.meleeEngage({ charge: true });",
            img: "icons/svg/daze.svg"
        }
    ];

    for (const macro of macros) {
        await ensureAutoNpcMacro({ ...macro, folderId });
    }
}

/**
 * Reset the reaction counter for the active combatant, if allowed.
 * @param {Combatant} combatant
 */
function resetCombatantReactions(combatant) {
    const actor = combatant?.actor;
    if (!actor) return;
    resetReactions(actor).catch(describeCombatantResetFailure);
}

Hooks.on("combatStart", combat => {
    if (!game.user?.isGM) return;
    resetCombatantReactions(combat?.combatant);
});

Hooks.on("updateCombat", (combat, changed) => {
    if (!game.user?.isGM) return;
    if (typeof changed.turn === "number" || typeof changed.round === "number") {
        resetCombatantReactions(combat?.combatant);
    }
});

Hooks.once("ready", () => {
    createAutoAttackMacros().catch(error => {
        warnAutoNpc(`Failed to create AutoNPC macros: ${error?.message ?? error}`);
    });
});

Hooks.once("init", () => {
    const macroApi = {
        attackMenu,
        aimedShot,
        semiAutoShot,
        fullAutoShot,
        meleeEngage,
        opposingAimedShot,
        opposingSemiAutoShot,
        opposingFullAutoShot,
        opposingMeleeAttack,
        opposingChargeAttack,
        autoChargeMelee,
        autoShoot,
        autoTurn,
        selectHostileTarget,
        useReaction,
        resetReactions,
        TARGETING_MODES,
        TARGET_FILTERS,
        TARGETING_DOCUMENTATION,
        PERSONALITY_ARCHETYPES,
        PERSONALITY_OPTIONS,
        getPersonalityDefinition: id => PERSONALITY_DEFINITIONS[id] ?? null
    };

    if (!game.darkHeresy) game.darkHeresy = {};
    if (!game.darkHeresy.macros) game.darkHeresy.macros = {};
    game.darkHeresy.macros.autoNpc = macroApi;

    if (!game.macro) game.macro = {};
    game.macro.autoNpc = macroApi;
});
