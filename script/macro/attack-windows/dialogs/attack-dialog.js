import DarkHeresyUtil from "../../../common/util.js";
import {
    actorHasDenyTheWitch,
    buildWeaponRollData,
    computeRangeModifier,
    extractNumericTrait,
    getCoverValue,
    getHitLocationFromRoll,
    reduceCoverLevel,
    resolveActorContext,
    resolveInitialTargets,
    resolveRangeData,
    resolveWeaponSelection,
    rollRandomLocation,
    spendFate
} from "../common.js";

const ATTACK_TYPE_CONFIG = Object.freeze({
    standard: { label: "Standard Attack", modifier: 10, hitMargin: 1, maxHits: 1 },
    semi_auto: { label: "Semi Auto", modifier: 0, hitMargin: 2, maxHitsKey: "burst" },
    full_auto: { label: "Full Auto", modifier: -10, hitMargin: 1, maxHitsKey: "full" },
    called_shot: { label: "Called Shot", modifier: -20, hitMargin: 1, maxHits: 1 },
    charge: { label: "Charge", modifier: 20, hitMargin: 1, maxHits: 1 },
    swift: { label: "Swift Attack", modifier: 0, hitMargin: 2, maxHitsKey: "melee" },
    lightning: { label: "Lightning Attack", modifier: -10, hitMargin: 1, maxHitsKey: "melee" },
    allOut: { label: "All Out Attack", modifier: 30, hitMargin: 1, maxHits: 1 }
});

const AIM_CONFIG = Object.freeze({
    none: { label: "No Aim", modifier: 0 },
    half: { label: "Half Aim (+10)", modifier: 10 },
    full: { label: "Full Aim (+20)", modifier: 20 }
});

/**
 *
 * @param modifier
 */
function clampModifier(modifier) {
    if (modifier > 60) return 60;
    if (modifier < -60) return -60;
    return modifier;
}

/**
 *
 * @param value
 */
function formatSigned(value) {
    const numeric = Number(value) || 0;
    return `${numeric >= 0 ? "+" : ""}${numeric}`;
}

/**
 *
 * @param formula
 * @param actor
 * @param psyValue
 */
function replaceSymbols(formula, actor, psyValue = null) {
    if (!formula) return "0";
    let updated = `${formula}`;
    if (psyValue !== null && psyValue !== undefined) {
        updated = updated.replaceAll(/PR/gi, psyValue);
    }
    const boni = actor?.attributeBoni ?? [];
    for (const bonus of boni) {
        updated = updated.replaceAll(bonus.regex, bonus.value);
    }
    return updated;
}

/**
 *
 * @param roll
 */
function extractDiceTerms(roll) {
    const diceTerms = [];
    for (const term of roll.terms ?? []) {
        if (term?.faces) {
            for (const result of term.results ?? []) {
                diceTerms.push({
                    faces: term.faces,
                    result,
                    term
                });
            }
        }
    }
    return diceTerms;
}

/**
 *
 * @param diceTerms
 * @param minimum
 */
function applyMinimumDice(diceTerms, minimum) {
    if (!Number.isFinite(minimum) || minimum <= 0) return null;
    const candidates = diceTerms.filter(entry => entry.result?.active !== false);
    if (!candidates.length) return null;
    candidates.sort((a, b) => (a.result.result ?? 0) - (b.result.result ?? 0));
    const chosen = candidates[0];
    const original = chosen.result.result ?? 0;
    if (original >= minimum) return null;
    chosen.result.result = minimum;
    return { original, minimum };
}

/**
 *
 * @param diceTerms
 * @param provenValue
 */
function applyProven(diceTerms, provenValue) {
    if (!Number.isFinite(provenValue) || provenValue <= 0) return [];
    const updates = [];
    for (const entry of diceTerms) {
        if (entry.result?.active === false) continue;
        const original = entry.result.result ?? 0;
        if (original < provenValue) {
            entry.result.result = provenValue;
            updates.push({ original, updated: provenValue });
        }
    }
    return updates;
}

/**
 *
 * @param formula
 */
async function rollDamageFormula(formula) {
    const roll = await new Roll(formula).evaluate({ async: true });
    return roll;
}

/**
 *
 */
async function rollRighteousFury() {
    const rfRoll = await new Roll("1d5").evaluate({ async: true });
    return rfRoll.total;
}

/**
 *
 * @param mode
 */
function getAttackTypeOptions(mode) {
    if (mode === "melee") {
        return ["standard", "charge", "swift", "lightning", "allOut", "called_shot"];
    }
    return ["standard", "semi_auto", "full_auto", "called_shot"];
}

/**
 *
 * @param mode
 */
function getDefaultAttackType(mode) {
    return mode === "melee" ? "standard" : "standard";
}

/**
 *
 * @param weapon
 * @param rollData
 */
function parseTraits(weapon, rollData) {
    const traits = foundry.utils.duplicate(rollData.weapon.traits ?? {});
    const special = weapon.system?.special ?? weapon.special ?? "";
    traits.blast = extractNumericTrait(special, /Blast\s*\((\d+)\)/i);
    traits.spray = traits.spray || /Spray/i.test(special);
    traits.proven = traits.proven ?? extractNumericTrait(special, /Proven\s*\((\d+)\)/i);
    traits.tearing = traits.tearing || /Tearing/i.test(special);
    traits.razorSharp = traits.razorSharp || /Razor/i.test(special);
    traits.accurate = traits.accurate || /Accurate/i.test(special);
    traits.storm = traits.storm || /Storm/i.test(special);
    traits.twinLinked = traits.twinLinked || /Twin/i.test(special);
    traits.force = traits.force || /Force/i.test(special);
    traits.inaccurate = traits.inaccurate || /Inaccurate/i.test(special);
    return traits;
}

/**
 *
 * @param configKey
 * @param rollData
 * @param mode
 */
function determineAttackType(configKey, rollData, mode) {
    const config = ATTACK_TYPE_CONFIG[configKey] ?? ATTACK_TYPE_CONFIG.standard;
    const meleeBonus = rollData.helpers?.characteristics?.weaponSkill?.bonus ?? rollData.helpers?.characteristics?.ballisticSkill?.bonus ?? 1;
    const maxHits = config.maxHits
        ?? (config.maxHitsKey === "burst" ? rollData.weapon.rateOfFire?.burst ?? 1 : null)
        ?? (config.maxHitsKey === "full" ? rollData.weapon.rateOfFire?.full ?? 1 : null)
        ?? (config.maxHitsKey === "melee" ? meleeBonus : 1);

    const label = config.label;
    const modifier = config.modifier + (mode === "ranged" && configKey === "standard" ? 0 : 0);
    return {
        key: configKey,
        label,
        modifier,
        hitMargin: config.hitMargin,
        maxHits: Math.max(Number(maxHits) || 1, 1)
    };
}

/**
 *
 * @param dos
 * @param attackType
 * @param traits
 */
function computeHitsOnSuccess(dos, attackType, traits) {
    const margin = Math.max(attackType.hitMargin || 1, 1);
    const baseHits = 1 + Math.floor(Math.max(dos - 1, 0) / margin);
    let hits = Math.min(baseHits, attackType.maxHits);

    if (traits?.storm) hits *= 2;
    return Math.max(hits, 1);
}

/**
 *
 * @param targetNumber
 * @param options
 */
async function rollAttack(targetNumber, options = {}) {
    const roll = await new Roll("1d100").evaluate({ async: true });
    const result = roll.total;
    const success = result <= targetNumber;
    const degrees = success
        ? 1 + Math.floor(targetNumber / 10) - Math.floor(result / 10)
        : 1 + Math.floor(result / 10) - Math.floor(targetNumber / 10);
    return {
        roll,
        result,
        success,
        dos: success ? degrees : 0,
        dof: success ? 0 : degrees
    };
}

/**
 *
 * @param actor
 */
function getTargetTypeLabel(actor) {
    return actor?.type === "npc" ? "NPC" : "PC";
}

/**
 *
 * @param weapon
 */
function getWeaponClass(weapon) {
    return weapon.system?.class ?? weapon.class ?? "";
}

/**
 *
 * @param weaponClass
 */
function canParry(weaponClass) {
    return weaponClass === "melee" || weaponClass === "pistol";
}

/**
 *
 * @param token
 * @param defenceType
 * @param weaponClass
 */
function actorCanDefend(token, defenceType, weaponClass) {
    if (!token?.actor) return { allowed: false, reason: "No actor" };
    const stunned = token.document?.hasStatusEffect?.("stunned") || token.document?.hasStatusEffect?.("unconscious");
    if (stunned) return { allowed: false, reason: "Cannot defend while stunned" };
    if (defenceType === "parry" && !canParry(weaponClass)) return { allowed: false, reason: "Weapon cannot be parried" };
    if (defenceType === "deny" && !actorHasDenyTheWitch(token.actor)) return { allowed: false, reason: "No Deny the Witch talent" };
    return { allowed: true, reason: "" };
}

/**
 *
 * @param actor
 * @param defenceType
 */
function buildDefenceRollData(actor, defenceType) {
    if (defenceType === "dodge") {
        return DarkHeresyUtil.createSkillRollData(actor, "dodge");
    }
    if (defenceType === "parry") {
        const data = DarkHeresyUtil.createSkillRollData(actor, "parry");
        data.target.modifier = (data.target.modifier ?? 0) + 10;
        return data;
    }
    const denyData = DarkHeresyUtil.createCharacteristicRollData(actor, "willpower");
    denyData.target.modifier = (denyData.target.modifier ?? 0);
    return denyData;
}

/**
 *
 * @param token
 * @param defenceType
 * @param weaponClass
 */
async function resolveDefenceRoll(token, defenceType, weaponClass) {
    const defenceCheck = actorCanDefend(token, defenceType, weaponClass);
    if (!defenceCheck.allowed) {
        return {
            attempted: false,
            defenceType,
            success: false,
            reason: defenceCheck.reason
        };
    }

    const rollData = buildDefenceRollData(token.actor, defenceType);
    const targetNumber = clampModifier((rollData.target?.base ?? 0) + (rollData.target?.modifier ?? 0));
    const roll = await rollAttack(targetNumber);

    return {
        attempted: true,
        defenceType,
        success: roll.success,
        targetNumber,
        roll
    };
}

/**
 *
 * @param token
 * @param weaponClass
 * @param attackLabel
 */
async function promptDefence(token, weaponClass, attackLabel) {
    const options = [
        { key: "accept", label: "Accept Hit" },
        { key: "dodge", label: "Defend: Dodge" },
        { key: "parry", label: "Defend: Parry (+10)" },
        { key: "deny", label: "Defend: Deny the Witch" }
    ];

    return new Promise(resolve => {
        const content = `
        <form>
            <div class="form-group">
                <label>${token.name} response to ${attackLabel}</label>
                <select name="defence">
                    ${options.map(option => `<option value="${option.key}">${option.label}</option>`).join("")}
                </select>
            </div>
            <p class="notes">Parry is only available against melee/pistol attacks. Deny the Witch requires the talent.</p>
        </form>`;

        new Dialog({
            title: `${token.name} Defence`,
            content,
            buttons: {
                confirm: {
                    label: "Resolve",
                    callback: html => {
                        const defenceType = html.find("[name='defence']").val();
                        resolve(defenceType);
                    }
                },
                accept: {
                    label: "Accept Hit",
                    callback: () => resolve("accept")
                }
            },
            default: "confirm"
        }).render(true);
    });
}

/**
 *
 * @param sections
 */
function buildTabsContent(sections) {
    const nav = sections
        .map((section, index) => `<a class="item ${index === 0 ? "active" : ""}" data-tab="${section.id}">${section.label}</a>`)
        .join("");
    const body = sections
        .map((section, index) => `
            <div class="tab ${index === 0 ? "active" : ""}" data-tab="${section.id}">
                ${section.content}
            </div>`)
        .join("");
    return `
    <div class="dh-tabs">
        <nav class="tabs" data-group="dh-attack-tabs">${nav}</nav>
        <section class="tab-content">${body}</section>
    </div>`;
}

/**
 *
 * @param html
 */
function activateTabs(html) {
    const tabs = html.find(".dh-tabs nav .item");
    tabs.on("click", ev => {
        ev.preventDefault();
        const tab = ev.currentTarget.dataset.tab;
        tabs.removeClass("active");
        html.find(`.dh-tabs nav .item[data-tab='${tab}']`).addClass("active");
        html.find(".dh-tabs .tab").removeClass("active");
        html.find(`.dh-tabs .tab[data-tab='${tab}']`).addClass("active");
    });
}

/**
 *
 * @param weapons
 */
function buildWeaponOptions(weapons) {
    if (!weapons.length) {
        return "<option value=\"\">No weapons found</option>";
    }
    return weapons
        .map(weapon => {
            const weaponClass = getWeaponClass(weapon);
            const range = weapon.system?.range ?? weapon.range ?? 0;
            const damage = weapon.system?.damage ?? weapon.damage ?? "";
            return `<option value="${weapon.id}">${weapon.name} (${weaponClass}, ${range}m, ${damage})</option>`;
        })
        .join("");
}

/**
 *
 * @param traits
 */
function getAoEFlags(traits) {
    return {
        blast: Number.isFinite(Number(traits?.blast)) && Number(traits.blast) > 0,
        spray: !!traits?.spray
    };
}

/**
 *
 * @param root0
 * @param root0.formula
 * @param root0.traits
 * @param root0.dos
 * @param root0.penetration
 */
async function buildDamageRoll({ formula, traits, dos, penetration }) {
    const roll = await rollDamageFormula(formula);
    const diceTerms = extractDiceTerms(roll);
    const provenUpdates = applyProven(diceTerms, traits.proven);
    const minDieValue = dos;
    const minimumUpdate = applyMinimumDice(diceTerms, Math.max(minDieValue, traits.proven ?? 0));
    const adjustedTotal = roll._evaluateTotal();

    let righteousFury = 0;
    const rfFace = traits.rfFace ?? 10;
    for (const entry of diceTerms) {
        if (entry.result?.active === false) continue;
        if ((entry.result.result ?? 0) >= rfFace) {
            righteousFury = await rollRighteousFury();
            break;
        }
    }

    return {
        total: adjustedTotal,
        righteousFury,
        penetration,
        dos,
        roll,
        provenUpdates,
        minimumUpdate
    };
}

/**
 *
 * @param actor
 * @param rollData
 * @param traits
 * @param psyValue
 */
function buildDamageFormula(actor, rollData, traits, psyValue = null) {
    let formula = rollData.weapon.damageFormula ?? rollData.weapon.damage ?? "0";
    formula = replaceSymbols(formula, actor, psyValue);
    if (traits.tearing) {
        formula = formula.replace(/(\d+)d(\d+)/i, (match, dice, faces) => `${dice + 1}d${faces}dl1`);
    }
    formula = `${formula}+${rollData.weapon.damageBonus ?? 0}`;
    return formula;
}

/**
 *
 * @param actor
 * @param rollData
 * @param psyValue
 */
function buildPenetrationFormula(actor, rollData, psyValue = null) {
    const penetrationFormula = rollData.weapon.penetrationFormula ?? rollData.weapon.penetration ?? "0";
    return replaceSymbols(penetrationFormula, actor, psyValue);
}

/**
 *
 * @param formula
 * @param dos
 * @param traits
 */
async function rollPenetration(formula, dos, traits) {
    const roll = await new Roll(formula).evaluate({ async: true });
    const multiplier = dos >= 3 && traits.razorSharp ? 2 : 1;
    return roll.total * multiplier;
}

/**
 *
 * @param targets
 */
function formatTargetList(targets) {
    if (!targets.length) return "No target";
    return targets.map(token => token.name).join(", ");
}

/**
 *
 * @param root0
 * @param root0.attacker
 * @param root0.weapon
 * @param root0.attackType
 * @param root0.targetNumber
 * @param root0.attackRoll
 * @param root0.hits
 * @param root0.targets
 * @param root0.rangeSummary
 */
function buildAttackSummary({ attacker, weapon, attackType, targetNumber, attackRoll, hits, targets, rangeSummary }) {
    const outcome = attackRoll.success ? (hits > 0 ? "hit" : "hit (no hits resolved)") : "missed";
    const attackerLabel = `${attacker.name} (${getTargetTypeLabel(attacker)})`;
    const targetLabel = formatTargetList(targets);
    const rollLine = `${attackRoll.result}/${targetNumber}`;
    const hitsLine = attackRoll.success ? `${hits} hits scored` : `${attackRoll.dof} DoF`;
    const rangeLine = rangeSummary ? `<div class="dh-range">Range: ${rangeSummary}</div>` : "";

    return `
    <div class="dh-attack-summary">
        <div><strong>${attackerLabel}</strong> ${outcome} <strong>${targetLabel}</strong> with <strong>${weapon.name}</strong> (${attackType.label}).</div>
        <div class="dh-roll">(${rollLine} • ${hitsLine})</div>
        ${rangeLine}
    </div>`;
}

/**
 *
 * @param commandLabel
 * @param payload
 */
function buildRerollButton(commandLabel, payload) {
    const data = encodeURIComponent(JSON.stringify(payload));
    return `<button type="button" class="dh-inline-action" data-dh-reroll="${data}">${commandLabel}</button>`;
}

/**
 *
 * @param defence
 */
function buildDefenceSummary(defence) {
    if (!defence?.attempted) {
        return `<div class="dh-defence">Defence: ${defence?.reason ?? "Not attempted"}.</div>`;
    }
    const label = defence.defenceType === "parry" ? "Parry" : defence.defenceType === "deny" ? "Deny the Witch" : "Dodge";
    const outcome = defence.success ? "succeeded" : "failed";
    return `<div class="dh-defence">Defence (${label}) ${outcome} (${defence.roll.result}/${defence.targetNumber}).</div>`;
}

/**
 *
 * @param damageEntries
 */
function buildDamageSummary(damageEntries) {
    if (!damageEntries.length) return "<div class='dh-damage'>No damage rolled.</div>";
    const rows = damageEntries.map((entry, index) => `
        <li>
            Hit ${index + 1}: <strong>${entry.location.label}</strong> — ${entry.damage.total} damage (Pen ${entry.damage.penetration})
            ${entry.damage.righteousFury ? ` • RF ${entry.damage.righteousFury}` : ""}
        </li>`).join("");
    return `<div class="dh-damage"><ol>${rows}</ol></div>`;
}

/**
 *
 * @param payload
 */
function buildApplyDamageButton(payload) {
    const data = encodeURIComponent(JSON.stringify(payload));
    return `<button type="button" class="dh-inline-action" data-dh-apply="${data}">Apply Damage</button>`;
}

/**
 *
 * @param entries
 * @param targets
 */
async function applyDamageToTargets(entries, targets) {
    if (!entries.length || !targets.length) return;
    const damages = entries.map(entry => ({
        amount: entry.damage.total,
        location: entry.location.armour,
        penetration: entry.damage.penetration,
        type: entry.damageType,
        righteousFury: entry.damage.righteousFury
    }));
    for (const token of targets) {
        await token.actor?.applyDamage?.(damages);
    }
}

/**
 *
 * @param message
 * @param html
 */
function activateChatListeners(message, html) {
    html.find(".dh-inline-action[data-dh-reroll]").on("click", async ev => {
        const payload = JSON.parse(decodeURIComponent(ev.currentTarget.dataset.dhReroll));
        await runAttackWindow(payload.config);
    });

    html.find(".dh-inline-action[data-dh-apply]").on("click", async ev => {
        const payload = JSON.parse(decodeURIComponent(ev.currentTarget.dataset.dhApply));
        const targets = payload.targetIds
            .map(id => canvas.tokens?.get(id))
            .filter(token => token?.actor);
        await applyDamageToTargets(payload.entries, targets);
    });
}

Hooks.on("renderChatMessage", (message, html) => {
    if (!message.getFlag("dark-heresy", "attackWindow")) return;
    activateChatListeners(message, html);
});

/**
 *
 * @param actor
 */
function getOwnership(actor) {
    return actor?.ownership ?? actor?.data?.ownership ?? {};
}

/**
 *
 * @param actor
 */
function userOwnsActor(actor) {
    const ownership = getOwnership(actor);
    const level = ownership[game.user.id] ?? ownership.default ?? 0;
    return level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER || game.user.isGM;
}

/**
 *
 * @param actor
 * @param config
 * @param targetNumber
 * @param attackRoll
 */
async function handlePostRollFate(actor, config, targetNumber, attackRoll) {
    if (attackRoll.success) return attackRoll;
    const fateAvailable = Number(actor?.fate?.value ?? 0) > 0;
    if (!fateAvailable || !userOwnsActor(actor)) return attackRoll;

    return new Promise(resolve => {
        const content = `
        <p>${actor.name} failed the roll (${attackRoll.result}/${targetNumber}). Spend Fate?</p>
        <p>Before: +20 to the target. After: +10 then reroll, or Fate reroll.</p>`;
        new Dialog({
            title: "Spend Fate",
            content,
            buttons: {
                plusTen: {
                    label: "+10 & Reroll",
                    callback: async () => {
                        const spent = await spendFate(actor);
                        if (!spent) return resolve(attackRoll);
                        const reroll = await rollAttack(targetNumber + 10);
                        reroll.fateSpent = true;
                        reroll.fateMode = "+10";
                        resolve(reroll);
                    }
                },
                reroll: {
                    label: "Fate Reroll",
                    callback: async () => {
                        const spent = await spendFate(actor);
                        if (!spent) return resolve(attackRoll);
                        const reroll = await rollAttack(targetNumber);
                        reroll.fateSpent = true;
                        reroll.fateMode = "reroll";
                        resolve(reroll);
                    }
                },
                keep: {
                    label: "Keep Result",
                    callback: () => resolve(attackRoll)
                }
            },
            default: "keep"
        }).render(true);
    });
}

/**
 *
 * @param root0
 * @param root0.actor
 * @param root0.token
 * @param root0.weapons
 * @param root0.attackTypes
 * @param root0.defaultTargets
 * @param root0.mode
 * @param root0.defaultWeaponId
 */
function buildAttackDialogContent({ actor, token, weapons, attackTypes, defaultTargets, mode, defaultWeaponId }) {
    const weaponOptions = buildWeaponOptions(weapons);
    const targetNames = defaultTargets.map(target => target.name).join(", ") || "None";
    const aimOptions = Object.entries(AIM_CONFIG)
        .map(([key, config]) => `<option value="${key}">${config.label}</option>`)
        .join("");
    const attackTypeOptions = attackTypes
        .map(key => `<option value="${key}">${ATTACK_TYPE_CONFIG[key].label}</option>`)
        .join("");

    const attackTab = `
    <div class="form-group">
        <label>Acting Token</label>
        <div>${token?.name ?? "None"} (${actor?.name ?? "No actor"})</div>
    </div>
    <div class="form-group">
        <label>Weapon</label>
        <select name="weaponId">${weaponOptions}</select>
        <div class="form-fields">
            <label><input type="checkbox" name="randomWeapon" /> Random weapon</label>
            <label><input type="checkbox" name="directDamage" /> Go straight to damage</label>
        </div>
    </div>
    <div class="form-group">
        <label>Attack Type</label>
        <select name="attackType">${attackTypeOptions}</select>
    </div>
    <div class="form-group">
        <label>Aim</label>
        <select name="aim">${aimOptions}</select>
    </div>
    <div class="form-group">
        <label>Fate (before roll)</label>
        <label><input type="checkbox" name="fateBefore" /> Spend Fate for +20</label>
    </div>`;

    const targetingTab = `
    <div class="form-group">
        <label>Current Targets</label>
        <div>${targetNames}</div>
        <p class="notes">Use Foundry targeting (T key) to select one or more targets. Templates will update targets automatically.</p>
    </div>
    <div class="form-group">
        <label>Template Options</label>
        <div class="form-fields">
            <button type="button" data-dh-template="blast">Place Blast Template</button>
            <button type="button" data-dh-template="spray">Place Spray Template</button>
        </div>
    </div>`;

    const modifiersTab = `
    <div class="form-group">
        <label>Manual Modifier</label>
        <input type="number" name="manualMod" value="0" />
    </div>
    <div class="form-group">
        <label>Range Modifier Override</label>
        <input type="number" name="rangeOverride" placeholder="Auto" />
    </div>
    <div class="form-group">
        <label>Cover Modifier</label>
        <input type="number" name="coverMod" value="0" />
        <label><input type="checkbox" name="considerWalls" /> Consider walls (manual only)</label>
    </div>`;

    const tabs = buildTabsContent([
        { id: "attack", label: "Attack", content: attackTab },
        { id: "targeting", label: "Targeting", content: targetingTab },
        { id: "modifiers", label: "Modifiers", content: modifiersTab }
    ]);

    return `
    <form class="dh-attack-window" data-mode="${mode}">
        ${tabs}
        <input type="hidden" name="defaultWeaponId" value="${defaultWeaponId ?? ""}" />
    </form>`;
}

/**
 *
 * @param root0
 * @param root0.actor
 * @param root0.token
 * @param root0.weapons
 * @param root0.mode
 */
async function collectDialogResult({ actor, token, weapons, mode }) {
    if (!actor) {
        ui.notifications.warn("No actor selected for attack.");
        return null;
    }

    const attackTypes = getAttackTypeOptions(mode);
    const defaultTargets = resolveInitialTargets(token, actor);
    const defaultWeaponId = weapons[0]?.id ?? "";

    return new Promise(resolve => {
        const content = buildAttackDialogContent({ actor, token, weapons, attackTypes, defaultTargets, mode, defaultWeaponId });
        const dialog = new Dialog({
            title: `${mode === "melee" ? "Melee" : "Ranged"} Attack`,
            content,
            buttons: {
                attack: {
                    label: "Attack",
                    callback: html => {
                        const weaponId = html.find("[name='weaponId']").val();
                        const randomWeapon = html.find("[name='randomWeapon']").is(":checked");
                        const directDamage = html.find("[name='directDamage']").is(":checked");
                        const attackType = html.find("[name='attackType']").val();
                        const aim = html.find("[name='aim']").val();
                        const fateBefore = html.find("[name='fateBefore']").is(":checked");
                        const manualMod = Number(html.find("[name='manualMod']").val() || 0);
                        const rangeOverrideRaw = html.find("[name='rangeOverride']").val();
                        const rangeOverride = rangeOverrideRaw === "" ? null : Number(rangeOverrideRaw);
                        const coverMod = Number(html.find("[name='coverMod']").val() || 0);
                        const considerWalls = html.find("[name='considerWalls']").is(":checked");
                        resolve({ weaponId, randomWeapon, directDamage, attackType, aim, fateBefore, manualMod, rangeOverride, coverMod, considerWalls });
                    }
                },
                cancel: {
                    label: "Cancel",
                    callback: () => resolve(null)
                }
            },
            default: "attack",
            render: html => {
                activateTabs(html);
                html.find("button[data-dh-template]").on("click", async ev => {
                    const weaponId = html.find("[name='weaponId']").val();
                    const weapon = weapons.find(item => item.id === weaponId);
                    if (!weapon) {
                        ui.notifications.warn("Select a weapon first.");
                        return;
                    }
                    const rollData = buildWeaponRollData(actor, weapon);
                    const traits = parseTraits(weapon, rollData);
                    if (ev.currentTarget.dataset.dhTemplate === "blast") {
                        if (!traits.blast) {
                            ui.notifications.warn("Weapon does not have Blast (X).");
                            return;
                        }
                        const { placeBlastTemplate } = await import("../common.js");
                        await placeBlastTemplate(token, weapon);
                    } else {
                        if (!traits.spray) {
                            ui.notifications.warn("Weapon does not have Spray.");
                            return;
                        }
                        const { placeSprayTemplate } = await import("../common.js");
                        await placeSprayTemplate(token, weapon);
                    }
                });
            }
        });
        dialog.render(true);
    });
}

/**
 *
 * @param token
 * @param actor
 * @param weapon
 * @param rollData
 * @param mode
 */
async function resolveTargetsForAttack(token, actor, weapon, rollData, mode) {
    let targets = resolveInitialTargets(token, actor);
    const traits = parseTraits(weapon, rollData);
    const aoe = getAoEFlags(traits);

    if (aoe.blast) {
        const { placeBlastTemplate } = await import("../common.js");
        const placed = await placeBlastTemplate(token, weapon);
        if (placed.targets.length) targets = placed.targets;
    } else if (aoe.spray) {
        const { placeSprayTemplate } = await import("../common.js");
        const placed = await placeSprayTemplate(token, weapon);
        if (placed.targets.length) targets = placed.targets;
    }

    if (!targets.length) {
        const explicit = Array.from(game.user?.targets ?? []).filter(target => target?.actor);
        if (explicit.length) targets = explicit;
    }

    return targets;
}

/**
 *
 * @param root0
 * @param root0.attackerActor
 * @param root0.targetToken
 * @param root0.weaponClass
 * @param root0.attackLabel
 */
async function resolveDefenceFlow({ attackerActor, targetToken, weaponClass, attackLabel }) {
    const attackerIsPC = attackerActor?.type === "acolyte";
    const targetIsPC = targetToken?.actor?.type === "acolyte";

    if (!targetToken?.actor) {
        return { attempted: false, defenceType: "none", success: false, reason: "No target actor" };
    }

    if (attackerIsPC && !targetIsPC) {
        const preferred = canParry(weaponClass) ? "parry" : "dodge";
        return resolveDefenceRoll(targetToken, preferred, weaponClass);
    }

    if (!attackerIsPC && targetIsPC) {
        const choice = await promptDefence(targetToken, weaponClass, attackLabel);
        if (!choice || choice === "accept") {
            return { attempted: false, defenceType: "accept", success: false, reason: "Accepted hit" };
        }
        return resolveDefenceRoll(targetToken, choice, weaponClass);
    }

    const preferred = canParry(weaponClass) ? "parry" : "dodge";
    return resolveDefenceRoll(targetToken, preferred, weaponClass);
}

/**
 *
 * @param root0
 * @param root0.actor
 * @param root0.weapon
 * @param root0.rollData
 * @param root0.attackRoll
 * @param root0.hits
 * @param root0.targets
 * @param root0.traits
 * @param root0.mode
 */
async function resolveDamageEntries({ actor, weapon, rollData, attackRoll, hits, targets, traits, mode }) {
    const psyValue = rollData.psy?.value ?? null;
    const damageFormula = buildDamageFormula(actor, rollData, traits, psyValue);
    const penetrationFormula = buildPenetrationFormula(actor, rollData, psyValue);
    const penetration = await rollPenetration(penetrationFormula, attackRoll.dos, traits);
    const weaponDamageType = rollData.weapon.damageType ?? weapon.system?.damageType ?? "impact";
    const weaponClass = getWeaponClass(weapon);

    const entries = [];
    const baseLocation = getHitLocationFromRoll(attackRoll.result);
    for (let i = 0; i < hits; i += 1) {
        const location = i === 0 ? baseLocation : await rollRandomLocation();
        const damage = await buildDamageRoll({ formula: damageFormula, traits, dos: attackRoll.dos, penetration });
        const targetToken = targets[i % targets.length] ?? null;
        const coverValue = targetToken?.actor ? getCoverValue(targetToken.actor, location.key) : 0;
        let coverReduced = null;
        if (targetToken?.actor && coverValue > 0 && penetration >= coverValue) {
            coverReduced = await reduceCoverLevel(targetToken.actor, location.key);
        }
        entries.push({
            location,
            damage,
            targetToken,
            damageType: weaponDamageType,
            coverValue,
            coverReduced,
            weaponClass
        });
    }
    return entries;
}

/**
 *
 * @param entries
 */
function summarizeCoverReduction(entries) {
    const reductions = entries.filter(entry => entry.coverReduced?.reduced);
    if (!reductions.length) return "";
    const lines = reductions.map(entry => `${entry.targetToken?.name ?? "Target"} cover reduced to ${entry.coverReduced.newLevelValue}`).join(" • ");
    return `<div class="dh-cover">Cover penetrated: ${lines}</div>`;
}

/**
 *
 * @param root0
 * @param root0.actor
 * @param root0.weapon
 * @param root0.attackType
 * @param root0.targetNumber
 * @param root0.attackRoll
 * @param root0.hits
 * @param root0.targets
 * @param root0.entries
 * @param root0.config
 * @param root0.rangeSummary
 * @param root0.defenceResults
 */
async function createAttackChatMessage({ actor, weapon, attackType, targetNumber, attackRoll, hits, targets, entries, config, rangeSummary, defenceResults }) {
    const summary = buildAttackSummary({ attacker: actor, weapon, attackType, targetNumber, attackRoll, hits, targets, rangeSummary });
    const defenceSummary = defenceResults.map(result => buildDefenceSummary(result)).join("");
    const damageSummary = buildDamageSummary(entries);
    const coverSummary = summarizeCoverReduction(entries);
    const rerollButton = buildRerollButton("Redo (+20)", {
        config: {
            ...config,
            manualMod: (config.manualMod ?? 0) + 20,
            skipDialog: true
        }
    });

    const applyButton = buildApplyDamageButton({
        entries,
        targetIds: targets.map(token => token.id)
    });

    const content = `
    <div class="dh-attack-card">
        ${summary}
        <div class="dh-actions">${rerollButton}</div>
        <hr />
        ${defenceSummary}
        ${coverSummary}
        <hr />
        ${damageSummary}
        <div class="dh-actions">${applyButton}</div>
    </div>`;

    await ChatMessage.create({
        content,
        speaker: ChatMessage.getSpeaker({ actor }),
        flags: {
            "dark-heresy": {
                attackWindow: true
            }
        }
    });
}

/**
 *
 * @param config
 */
export async function runAttackWindow(config) {
    const { token, actor } = resolveActorContext();
    if (!actor) {
        ui.notifications.warn("No actor available for attack.");
        return;
    }

    const weapons = config.weapons;
    const mode = config.mode;
    if (!weapons.length) {
        ui.notifications.warn("No valid weapons found for this macro.");
        return;
    }

    let dialogResult = config.skipDialog ? config : await collectDialogResult({ actor, token, weapons, mode });
    if (!dialogResult) return;

    const weapon = resolveWeaponSelection(actor, weapons, dialogResult.weaponId, dialogResult.randomWeapon);
    if (!weapon) {
        ui.notifications.warn("No weapon selected.");
        return;
    }

    const rollData = buildWeaponRollData(actor, weapon);
    const traits = parseTraits(weapon, rollData);
    const weaponClass = getWeaponClass(weapon);

    const targets = await resolveTargetsForAttack(token, actor, weapon, rollData, mode);
    const targetTokens = targets.length ? targets : [];

    const attackType = determineAttackType(dialogResult.attackType ?? getDefaultAttackType(mode), rollData, mode);
    const aim = AIM_CONFIG[dialogResult.aim] ?? AIM_CONFIG.none;
    const fateBeforeMod = dialogResult.fateBefore ? 20 : 0;

    const rangeData = resolveRangeData(token, targetTokens, rollData.weapon.range);
    const autoRangeModifier = rangeData.modifier ?? 0;
    const rangeModifier = dialogResult.rangeOverride ?? autoRangeModifier;

    const manualMod = Number(dialogResult.manualMod ?? 0);
    const coverMod = Number(dialogResult.coverMod ?? 0);

    const baseTarget = rollData.target.base ?? 0;
    let totalModifier = attackType.modifier + aim.modifier + fateBeforeMod + rangeModifier + manualMod + coverMod;
    if (traits.twinLinked) totalModifier += 20;
    if (traits.inaccurate) totalModifier -= 10;

    const targetNumber = baseTarget + clampModifier(totalModifier);
    const directDamage = !!dialogResult.directDamage;

    let attackRoll = directDamage
        ? {
            result: null,
            success: true,
            dos: 1,
            dof: 0
        }
        : await rollAttack(targetNumber);

    if (!directDamage) {
        attackRoll = await handlePostRollFate(actor, dialogResult, targetNumber, attackRoll);
    }

    const hits = attackRoll.success ? computeHitsOnSuccess(attackRoll.dos, attackType, traits) : 0;
    const rangeSummary = rangeData.summary;

    const defenceResults = [];
    if (attackRoll.success && targetTokens.length) {
        for (const targetToken of targetTokens) {
            const defence = await resolveDefenceFlow({ attackerActor: actor, targetToken, weaponClass, attackLabel: weapon.name });
            defenceResults.push(defence);
        }
    }

    const anyDefended = defenceResults.some(result => result.success);
    const resolvedHits = anyDefended ? Math.max(hits - 1, 0) : hits;

    const entries = resolvedHits > 0
        ? await resolveDamageEntries({ actor, weapon, rollData, attackRoll, hits: resolvedHits, targets: targetTokens.length ? targetTokens : [null], traits, mode })
        : [];

    await createAttackChatMessage({
        actor,
        weapon,
        attackType,
        targetNumber,
        attackRoll,
        hits: resolvedHits,
        targets: targetTokens,
        entries,
        config: {
            ...dialogResult,
            mode
        },
        rangeSummary,
        defenceResults
    });
}

/**
 *
 * @param root0
 * @param root0.mode
 * @param root0.weapons
 */
export function createAttackMacroConfig({ mode, weapons }) {
    return {
        mode,
        weapons
    };
}
