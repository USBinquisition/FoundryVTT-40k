import DarkHeresyUtil from "../../common/util.js";
import { PlaceableTemplate } from "../../common/placeable-template.js";

export const COVER_LEVELS = Object.freeze([4, 8, 12, 16, 20, 32, 64]);
export const COVER_ITEM_NAME = "Cover";
export const DENY_THE_WITCH_NAME = "Deny the Witch";

export const HIT_LOCATION_TABLE = Object.freeze([
    { max: 10, key: "head", label: "Head", armour: "ARMOUR.HEAD" },
    { max: 20, key: "leftArm", label: "Left Arm", armour: "ARMOUR.LEFT_ARM" },
    { max: 30, key: "rightArm", label: "Right Arm", armour: "ARMOUR.RIGHT_ARM" },
    { max: 40, key: "leftLeg", label: "Left Leg", armour: "ARMOUR.LEFT_LEG" },
    { max: 50, key: "rightLeg", label: "Right Leg", armour: "ARMOUR.RIGHT_LEG" },
    { max: 100, key: "body", label: "Torso", armour: "ARMOUR.BODY" }
]);

const MELEE_CLASSES = new Set(["melee", "pistol"]);
const RANGED_CLASSES = new Set(["pistol", "thrown", "heavy", "basic", "launched", "placed", "vehicle"]);

/**
 * Attempt to resolve the acting token and actor for the current user.
 * Prefers controlled tokens, then the chat speaker.
 * @returns {{token: Token|null, actor: Actor|null}}
 */
export function resolveActorContext() {
    const controlled = canvas?.tokens?.controlled ?? [];
    if (controlled.length) {
        const token = controlled[0];
        return { token, actor: token.actor ?? null };
    }

    const speaker = ChatMessage.getSpeaker();
    let actor = speaker.token ? game.actors.tokens[speaker.token] : null;
    if (!actor && speaker.actor) actor = game.actors.get(speaker.actor);
    const token = actor?.getActiveTokens?.(true, true)?.[0] ?? null;
    return { token, actor: actor ?? null };
}

/**
 * Build common characteristic lookup helpers so macros can easily access core stats.
 * @param {Actor} actor
 * @returns {Record<string, object>}
 */
export function buildCharacteristicLookup(actor) {
    const characteristics = actor?.characteristics ?? actor?.system?.characteristics ?? {};
    return {
        weaponSkill: characteristics.weaponSkill,
        ballisticSkill: characteristics.ballisticSkill,
        strength: characteristics.strength,
        toughness: characteristics.toughness,
        agility: characteristics.agility,
        intelligence: characteristics.intelligence,
        perception: characteristics.perception,
        willpower: characteristics.willpower,
        fellowship: characteristics.fellowship,
        influence: characteristics.influence
    };
}

/**
 * Obtain the center point of a token.
 * @param {Token} token
 * @returns {{x: number, y: number}|null}
 */
export function getTokenCenter(token) {
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
 * Measure grid distance between tokens.
 * @param {Token} origin
 * @param {Token} target
 * @returns {number}
 */
export function measureTokenDistance(origin, target) {
    const grid = canvas?.grid;
    if (!grid || !origin || !target) return Number.POSITIVE_INFINITY;
    const originCenter = getTokenCenter(origin);
    const targetCenter = getTokenCenter(target);
    if (!originCenter || !targetCenter) return Number.POSITIVE_INFINITY;
    const distance = grid.measureDistance(originCenter, targetCenter);
    return Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY;
}

/**
 * Determine whether the provided actor is a player character.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function isPC(actor) {
    return actor?.type === "acolyte";
}

/**
 * Select the nearest opposing actor token based on actor type.
 * PCs target nearest NPC, NPCs target nearest PC.
 * @param {Token|null} originToken
 * @param {Actor|null} originActor
 * @returns {Token|null}
 */
export function findNearestOpposition(originToken, originActor) {
    const tokens = canvas?.tokens?.placeables ?? [];
    if (!tokens.length) return null;

    const desiredType = isPC(originActor) ? "npc" : "acolyte";
    const candidates = tokens.filter(token => token?.actor?.type === desiredType);
    if (!candidates.length) return null;

    if (!originToken) return candidates[0] ?? null;

    let closest = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const token of candidates) {
        const distance = measureTokenDistance(originToken, token);
        if (distance < closestDistance) {
            closest = token;
            closestDistance = distance;
        }
    }
    return closest;
}

/**
 * Returns a sorted list of target tokens. Defaults to user targets, otherwise nearest opposition.
 * @param {Token|null} originToken
 * @param {Actor|null} originActor
 * @returns {Token[]}
 */
export function resolveInitialTargets(originToken, originActor) {
    const explicitTargets = Array.from(game.user?.targets ?? []).filter(token => token?.actor);
    if (explicitTargets.length) return explicitTargets;
    const nearest = findNearestOpposition(originToken, originActor);
    return nearest ? [nearest] : [];
}

/**
 * Normalize a weapon range value into a numeric distance.
 * @param {number|string|object} rangeValue
 * @returns {number}
 */
export function normalizeRange(rangeValue) {
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
 * Compute a range modifier using DH2e bands.
 * @param {number} distance
 * @param {number} weaponRange
 * @returns {{modifier:number, band:string}|null}
 */
export function computeRangeModifier(distance, weaponRange) {
    if (!Number.isFinite(distance) || !Number.isFinite(weaponRange) || weaponRange <= 0) return null;

    const pointBlankLimit = 3;
    const shortLimit = weaponRange / 2;
    const standardLimit = weaponRange;
    const longLimit = weaponRange * 2;
    const extremeLimit = weaponRange * 3;

    if (distance <= pointBlankLimit) return { modifier: 30, band: "Point Blank" };
    if (distance <= shortLimit) return { modifier: 10, band: "Short" };
    if (distance <= standardLimit) return { modifier: 0, band: "Standard" };
    if (distance <= longLimit) return { modifier: -10, band: "Long" };
    if (distance <= extremeLimit) return { modifier: -30, band: "Extreme" };
    return null;
}

/**
 * Resolve measured distances and automatic range modifiers for targets.
 * @param {Token|null} originToken
 * @param {Token[]} targets
 * @param {number|string|object} weaponRange
 * @returns {{summary: string, modifier: number, perTarget: Array<{token: Token, distance: number, range: {modifier:number, band:string}|null}>}}
 */
export function resolveRangeData(originToken, targets, weaponRange) {
    const numericRange = normalizeRange(weaponRange);
    const perTarget = (targets ?? []).map(token => {
        const distance = originToken ? measureTokenDistance(originToken, token) : NaN;
        const range = Number.isFinite(numericRange) ? computeRangeModifier(distance, numericRange) : null;
        return { token, distance, range };
    });

    const modifiers = perTarget
        .map(entry => entry.range?.modifier)
        .filter(mod => Number.isFinite(mod));

    const modifier = modifiers.length ? Math.min(...modifiers) : 0;
    const parts = perTarget.map(entry => {
        if (!Number.isFinite(entry.distance)) return `${entry.token.name}: ?`;
        const band = entry.range ? `${entry.range.band} (${entry.range.modifier >= 0 ? "+" : ""}${entry.range.modifier})` : "Out of range";
        return `${entry.token.name}: ${entry.distance.toFixed(1)}m ${band}`;
    });

    return {
        summary: parts.join(" • "),
        modifier,
        perTarget
    };
}

/**
 * Retrieve weapons from an actor filtered by attack mode.
 * @param {Actor} actor
 * @param {"melee"|"ranged"|"any"} mode
 * @returns {Item[]}
 */
export function getWeaponsForMode(actor, mode) {
    const weapons = actor?.items?.filter(item => item?.type === "weapon") ?? [];
    if (mode === "any") return weapons;

    return weapons.filter(weapon => {
        const weaponClass = weapon.system?.class ?? weapon.class;
        if (mode === "melee") return MELEE_CLASSES.has(weaponClass);
        if (mode === "ranged") return weaponClass !== "melee" || RANGED_CLASSES.has(weaponClass);
        return true;
    });
}

/**
 * Choose a weapon by id, or optionally select one at random.
 * @param {Actor} actor
 * @param {Item[]} weapons
 * @param {string} weaponId
 * @param {boolean} randomWeapon
 * @returns {Item|null}
 */
export function resolveWeaponSelection(actor, weapons, weaponId, randomWeapon) {
    if (!actor || !weapons?.length) return null;
    if (randomWeapon) {
        const index = Math.floor(Math.random() * weapons.length);
        return weapons[index] ?? null;
    }
    return weapons.find(weapon => weapon.id === weaponId) ?? weapons[0] ?? null;
}

/**
 * Extract a numeric trait value, e.g. Blast (3).
 * @param {string} special
 * @param {RegExp} regex
 * @returns {number|null}
 */
export function extractNumericTrait(special, regex) {
    if (!special) return null;
    const match = special.match(regex);
    if (!match) return null;
    const valueMatch = match[0].match(/\d+/);
    if (!valueMatch) return null;
    const value = Number(valueMatch[0]);
    return Number.isFinite(value) ? value : null;
}

/**
 * Place a blast template and return tokens inside it.
 * @param {Token|null} originToken
 * @param {Item|null} weapon
 * @returns {Promise<{template: MeasuredTemplateDocument|null, targets: Token[]}>}
 */
export async function placeBlastTemplate(originToken, weapon) {
    const blastValue = extractNumericTrait(weapon?.system?.special ?? weapon?.special ?? "", /Blast\s*\((\d+)\)/i);
    if (!blastValue || !originToken) return { template: null, targets: [] };

    const templateData = {
        t: "circle",
        user: game.user.id,
        distance: blastValue,
        direction: 0,
        x: originToken.center?.x ?? originToken.x,
        y: originToken.center?.y ?? originToken.y,
        fillColor: game.user.color,
        flags: { "dark-heresy": { origin: originToken.document?.uuid } }
    };

    const cls = CONFIG.MeasuredTemplate.documentClass;
    const templateDoc = new cls(templateData, { parent: canvas.scene });
    const templateObject = new MeasuredTemplate(templateDoc);
    await templateObject.drawPreview();

    const placedDoc = templateObject.document ?? null;
    const targets = placedDoc ? collectTokensInTemplate(placedDoc) : [];
    if (targets.length) {
        const ids = targets.map(token => token.id);
        game.user.updateTokenTargets(ids);
    }
    return { template: placedDoc, targets };
}

/**
 * Place a spray cone template and return tokens inside it.
 * @param {Token|null} originToken
 * @param {Item|null} weapon
 * @returns {Promise<{template: MeasuredTemplateDocument|null, targets: Token[]}>}
 */
export async function placeSprayTemplate(originToken, weapon) {
    if (!originToken || !weapon) return { template: null, targets: [] };
    const rollData = DarkHeresyUtil.createWeaponRollData(originToken.actor, weapon);
    const template = PlaceableTemplate.cone({ item: weapon.id, actor: originToken.actor.id }, 30, rollData.weapon.range);
    const placed = await template.drawPreview();
    const placedDoc = placed?.document ?? placed ?? null;
    const targets = placedDoc ? collectTokensInTemplate(placedDoc) : [];
    if (targets.length) {
        const ids = targets.map(token => token.id);
        game.user.updateTokenTargets(ids);
    }
    return { template: placedDoc, targets };
}

/**
 * Collect tokens whose centers fall within a measured template.
 * @param {MeasuredTemplateDocument} templateDoc
 * @returns {Token[]}
 */
export function collectTokensInTemplate(templateDoc) {
    const templateObject = templateDoc?.object;
    if (!templateObject) return [];
    const tokens = canvas?.tokens?.placeables ?? [];
    const contained = tokens.filter(token => {
        const center = getTokenCenter(token);
        if (!center) return false;
        return templateObject.shape?.contains?.(center.x - templateObject.x, center.y - templateObject.y);
    });
    return contained;
}

/**
 * Map a d100 result to a hit location using the requested table.
 * @param {number} rollResult
 * @returns {{key:string, armour:string, label:string, target:number}}
 */
export function getHitLocationFromRoll(rollResult) {
    const padded = rollResult < 10 ? `0${rollResult}` : `${rollResult}`;
    const reversed = Number(padded.split("").reverse().join(""));
    return mapLocationFromTarget(reversed);
}

/**
 * Map a numeric location target to a hit location entry.
 * @param {number} locationTarget
 * @returns {{key:string, armour:string, label:string, target:number}}
 */
export function mapLocationFromTarget(locationTarget) {
    const target = Math.min(Math.max(Number(locationTarget) || 0, 1), 100);
    const entry = HIT_LOCATION_TABLE.find(part => target <= part.max) ?? HIT_LOCATION_TABLE.at(-1);
    return {
        key: entry.key,
        armour: entry.armour,
        label: entry.label,
        target
    };
}

/**
 * Roll a random hit location.
 * @returns {{key:string, armour:string, label:string, target:number, roll:number}}
 */
export async function rollRandomLocation() {
    const roll = await new Roll("1d100").evaluate({ async: true });
    const location = mapLocationFromTarget(roll.total);
    return {
        ...location,
        roll: roll.total
    };
}

/**
 * Spend a fate point on an actor if possible.
 * @param {Actor} actor
 * @returns {Promise<boolean>}
 */
export async function spendFate(actor) {
    const current = Number(actor?.fate?.value ?? actor?.system?.fate?.value ?? 0);
    if (!actor || current <= 0) return false;
    await actor.update({ "system.fate.value": current - 1 });
    return true;
}

/**
 * Ensure the Deny the Witch talent exists in the world item directory.
 * @returns {Promise<Item|null>}
 */
export async function ensureDenyTheWitchTalent() {
    let talent = game.items?.find(item => item.name === DENY_THE_WITCH_NAME && item.type === "talent");
    if (talent) return talent;

    talent = await Item.create({
        name: DENY_THE_WITCH_NAME,
        type: "talent",
        img: "icons/magic/defensive/shield-barrier-flaming-diamond-blue.webp",
        system: {
            prerequisites: "",
            aptitudes: "Willpower, Defence",
            benefit: "You may attempt to resist psychic powers with a Willpower test as a Reaction.",
            tier: 2,
            starter: true,
            cost: 0
        },
        ownership: buildMacroOwnership()
    }, { displaySheet: false });

    ui.notifications.info("Created base talent: Deny the Witch");
    return talent;
}

/**
 * Determine whether an actor has the Deny the Witch talent.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function actorHasDenyTheWitch(actor) {
    if (!actor) return false;
    return actor.items?.some(item => item.type === "talent" && item.name === DENY_THE_WITCH_NAME) ?? false;
}

/**
 * Build macro ownership so everyone can execute but only GMs can edit.
 * @returns {object}
 */
export function buildMacroOwnership() {
    const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER };
    for (const user of game.users ?? []) {
        if (user.isGM) {
            ownership[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        }
    }
    return ownership;
}

/**
 * Ensure the actor has a dedicated additive armour item for cover.
 * @param {Actor} actor
 * @returns {Promise<Item|null>}
 */
export async function ensureCoverItem(actor) {
    if (!actor) return null;
    let coverItem = actor.items.find(item => item.type === "armour" && item.name === COVER_ITEM_NAME);
    if (coverItem) return coverItem;

    coverItem = await actor.createEmbeddedDocuments("Item", [{
        name: COVER_ITEM_NAME,
        type: "armour",
        img: "icons/environment/settlement/stone-wall.webp",
        system: {
            type: "basic",
            isAdditive: true,
            part: {
                head: 0,
                leftArm: 0,
                rightArm: 0,
                body: 0,
                leftLeg: 0,
                rightLeg: 0
            },
            maxAgility: 0
        },
        flags: {
            "dark-heresy": {
                coverLevelIndex: 0,
                coverLevelValue: 0
            }
        }
    }]);

    return coverItem?.[0] ?? null;
}

/**
 * Apply cover values to the actor's cover item.
 * @param {Actor} actor
 * @param {Record<string, number>} partValues
 * @param {number} levelIndex
 * @returns {Promise<Item|null>}
 */
export async function applyCoverValues(actor, partValues, levelIndex) {
    const coverItem = await ensureCoverItem(actor);
    if (!coverItem) return null;

    const levelValue = COVER_LEVELS[levelIndex] ?? 0;
    await coverItem.update({
        "system.isAdditive": true,
        "system.part": {
            head: Number(partValues.head ?? 0),
            leftArm: Number(partValues.leftArm ?? 0),
            rightArm: Number(partValues.rightArm ?? 0),
            body: Number(partValues.body ?? 0),
            leftLeg: Number(partValues.leftLeg ?? 0),
            rightLeg: Number(partValues.rightLeg ?? 0)
        },
        "flags.dark-heresy.coverLevelIndex": levelIndex,
        "flags.dark-heresy.coverLevelValue": levelValue
    });
    return coverItem;
}

/**
 * Reduce cover by one level when it is penetrated.
 * @param {Actor} actor
 * @param {string} locationKey
 * @returns {Promise<{reduced: boolean, newLevelIndex:number, newLevelValue:number}>}
 */
export async function reduceCoverLevel(actor, locationKey) {
    const coverItem = await ensureCoverItem(actor);
    if (!coverItem) {
        return { reduced: false, newLevelIndex: 0, newLevelValue: 0 };
    }

    const currentIndex = Number(coverItem.getFlag("dark-heresy", "coverLevelIndex") ?? 0);
    const newLevelIndex = Math.max(currentIndex - 1, 0);
    const newLevelValue = COVER_LEVELS[newLevelIndex] ?? 0;

    const currentParts = foundry.utils.duplicate(coverItem.system.part);
    for (const key of Object.keys(currentParts)) {
        if (currentParts[key] > 0) currentParts[key] = newLevelValue;
    }

    await coverItem.update({
        "system.part": currentParts,
        "flags.dark-heresy.coverLevelIndex": newLevelIndex,
        "flags.dark-heresy.coverLevelValue": newLevelValue
    });

    return {
        reduced: newLevelIndex !== currentIndex,
        newLevelIndex,
        newLevelValue,
        locationKey
    };
}

/**
 * Retrieve the cover value for a given location.
 * @param {Actor} actor
 * @param {string} locationKey
 * @returns {number}
 */
export function getCoverValue(actor, locationKey) {
    const coverItem = actor?.items?.find(item => item.type === "armour" && item.name === COVER_ITEM_NAME);
    if (!coverItem) return 0;
    return Number(coverItem.system?.part?.[locationKey] ?? 0);
}

/**
 * Create roll data for a weapon including stat lookups and helper references.
 * @param {Actor} actor
 * @param {Item} weapon
 * @returns {object}
 */
export function buildWeaponRollData(actor, weapon) {
    const rollData = DarkHeresyUtil.createWeaponRollData(actor, weapon);
    rollData.helpers = {
        characteristics: buildCharacteristicLookup(actor)
    };
    return rollData;
}
