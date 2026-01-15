import DarkHeresyUtil from "../common/util.js";
import { combatRoll, applyDamage, reportEmptyClip } from "../common/roll.js";

export const TARGETING_MODES = Object.freeze({
    CLOSEST: "closest",
    TARGETED: "targeted",
    RANDOM: "random",
    WEAKEST: "weakest",
    STRONGEST: "strongest"
});

export const TARGET_FILTERS = Object.freeze({
    ANY: "any",
    NPC_ONLY: "npc",
    ACOLYTE_ONLY: "acolyte"
});

export const TARGETING_DOCUMENTATION = `Targeting Modes:
- closest  - hostile nearest to the acting token.
- targeted - currently targeted hostile (first entry if multiple).
- random   - random hostile within the scene.
- weakest  - hostile with the lowest wounds percentage.
- strongest - hostile with the highest wounds percentage.

Filters:
- any      - allow any hostile disposition.
- npc      - hostile tokens with NPC actors only.
- acolyte  - hostile tokens with Acolyte actors only.
`;

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
 * Select a hostile token using the provided targeting mode and filters.
 * @param {Token} originToken
 * @param {object} [options]
 * @param {string} [options.mode]
 * @param {string} [options.filter]
 * @returns {Token|null}
 */
export function selectHostileTarget(originToken, { mode = TARGETING_MODES.CLOSEST, filter = TARGET_FILTERS.ANY } = {}) {
    const canvasTokens = canvas?.tokens?.placeables ?? [];
    const sceneId = originToken ? getTokenSceneId(originToken) : null;
    const hostileDisposition = CONST?.TOKEN_DISPOSITIONS?.HOSTILE ?? -1;

    const hostiles = canvasTokens.filter(token => {
        if (!token?.actor) return false;
        if (token.document?.disposition !== hostileDisposition) return false;
        if (sceneId && getTokenSceneId(token) !== sceneId) return false;
        return passesFilter(token, filter);
    });

    if (!hostiles.length) return null;

    const normalizedMode = (mode ?? TARGETING_MODES.CLOSEST).toString().toLowerCase();
    switch (normalizedMode) {
        case TARGETING_MODES.TARGETED: {
            const targets = Array.from(game.user?.targets ?? []);
            const hostileIds = new Set(hostiles.map(t => t.id ?? t.document?.id));
            return targets.find(t => hostileIds.has(t.id ?? t.document?.id)) ?? null;
        }
        case TARGETING_MODES.RANDOM: {
            const index = Math.floor(Math.random() * hostiles.length);
            return hostiles[index] ?? null;
        }
        case TARGETING_MODES.WEAKEST: {
            const ordered = hostiles
                .slice()
                .sort((a, b) => getHealthRatio(a) - getHealthRatio(b));
            return ordered[0] ?? null;
        }
        case TARGETING_MODES.STRONGEST: {
            const ordered = hostiles
                .slice()
                .sort((a, b) => getHealthRatio(b) - getHealthRatio(a));
            return ordered[0] ?? null;
        }
        case TARGETING_MODES.CLOSEST:
        default: {
            if (!originToken) return hostiles[0] ?? null;
            let closestToken = null;
            let closestDistance = Number.POSITIVE_INFINITY;
            for (const token of hostiles) {
                const distance = measureDistance(originToken, token);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestToken = token;
                }
            }
            return closestToken ?? hostiles[0] ?? null;
        }
    }
}

/**
 * Identify the token that should perform the automated action.
 * @returns {Token|null}
 */
function resolveActingToken() {
    const controlled = canvas.tokens?.controlled ?? [];
    if (controlled.length === 1) return controlled[0];
    if (controlled.length > 1) return controlled[0];
    const targets = Array.from(game.user?.targets ?? []);
    if (targets.length) return targets[0];
    return null;
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
 * @returns {Promise<object|null>}
 */
async function executeCombatRoll(actor, weapon, targetToken, configureRoll) {
    if (!actor || !weapon || !targetToken) return null;

    const rollData = DarkHeresyUtil.createWeaponRollData(actor, weapon);
    rollData.flags = rollData.flags ?? {};
    rollData.flags.isCombatRoll = true;
    rollData.flags.autoNpc = true;
    rollData.target.modifier = rollData.target.modifier ?? 0;

    if (typeof configureRoll === "function") {
        const result = configureRoll(rollData, targetToken);
        if (result instanceof Promise) await result;
    }

    await combatRoll(rollData);

    const shouldApplyDamage = rollData.flags?.isDamageRoll || rollData.flags?.isSuccess;
    if (shouldApplyDamage) {
        await applyDamage(rollData, [targetToken]);
    }

    return rollData;
}

/**
 * Charge the selected hostile and perform a melee attack.
 * @param {object} [options]
 * @param {string} [options.weaponId]
 * @param {string} [options.weaponName]
 * @param {string} [options.targetMode]
 * @param {string} [options.targetFilter]
 * @returns {Promise<object|null>}
 */
export async function autoChargeMelee({
    weaponId,
    weaponName,
    targetMode = TARGETING_MODES.CLOSEST,
    targetFilter = TARGET_FILTERS.ANY
} = {}) {
    const actingToken = resolveActingToken();
    if (!actingToken) return warnAutoNpc("Select a token before running Auto Charge + Melee.");

    const actor = actingToken.actor;
    if (!actor) return warnAutoNpc("The controlled token has no linked actor.");

    const weapon = findWeapon(
        actor,
        weaponId ?? weaponName,
        item => {
            const weaponClass = item.class ?? item.system?.class;
            return weaponClass === "melee";
        }
    );
    if (!weapon) return warnAutoNpc("No melee weapon found on the actor.");

    const targetToken = selectHostileTarget(actingToken, { mode: targetMode, filter: targetFilter });
    if (!targetToken) return warnAutoNpc("No hostile target available for Auto Charge.");

    const meleeDistance = measureDistance(actingToken, targetToken);
    if (!Number.isFinite(meleeDistance) || meleeDistance > 3) {
        return warnAutoNpc("Target is out of melee range for Auto Charge.");
    }

    return executeCombatRoll(
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
}

/**
 * Perform a ranged attack using the configured targeting strategy.
 * @param {object} [options]
 * @param {string} [options.weaponId]
 * @param {string} [options.weaponName]
 * @param {string} [options.targetMode]
 * @param {string} [options.targetFilter]
 * @returns {Promise<object|null>}
 */
export async function autoShoot({
    weaponId,
    weaponName,
    targetMode = TARGETING_MODES.CLOSEST,
    targetFilter = TARGET_FILTERS.ANY
} = {}) {
    const actingToken = resolveActingToken();
    if (!actingToken) return warnAutoNpc("Select a token before running Auto Shoot.");

    const actor = actingToken.actor;
    if (!actor) return warnAutoNpc("The controlled token has no linked actor.");

    const weapon = findWeapon(actor, weaponId ?? weaponName, item => {
        const weaponClass = item.class ?? item.system?.class;
        return weaponClass && weaponClass !== "melee";
    });
    if (!weapon) return warnAutoNpc("No ranged weapon found on the actor.");

    const targetToken = selectHostileTarget(actingToken, { mode: targetMode, filter: targetFilter });
    if (!targetToken) return warnAutoNpc("No hostile target available for Auto Shoot.");

    return executeCombatRoll(
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
    ).catch(error => {
        if (error?.message === "EMPTY_CLIP") {
            return warnAutoNpc("Cannot fire: clip is empty.");
        }
        if (error?.message === "OUT_OF_RANGE") {
            return warnAutoNpc("Target is beyond weapon range.");
        }
        throw error;
    });
}

Hooks.once("init", () => {
    const macroApi = {
        autoChargeMelee,
        autoShoot,
        selectHostileTarget,
        TARGETING_MODES,
        TARGET_FILTERS,
        TARGETING_DOCUMENTATION
    };

    if (!game.darkHeresy) game.darkHeresy = {};
    if (!game.darkHeresy.macros) game.darkHeresy.macros = {};
    game.darkHeresy.macros.autoNpc = macroApi;

    if (!game.macro) game.macro = {};
    game.macro.autoNpc = macroApi;
});

