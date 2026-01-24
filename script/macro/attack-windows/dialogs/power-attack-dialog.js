import DarkHeresyUtil from "../../../common/util.js";
import {
    extractNumericTrait,
    getHitLocationFromRoll,
    resolveActorContext,
    resolveInitialTargets,
    resolveRangeData,
    rollRandomLocation
} from "../common.js";

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
 * @param targetNumber
 */
async function rollTarget(targetNumber) {
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
 * @param formula
 * @param actor
 * @param psyValue
 */
function replaceSymbols(formula, actor, psyValue) {
    if (!formula) return "0";
    let updated = `${formula}`.replaceAll(/PR/gi, psyValue);
    for (const bonus of actor.attributeBoni ?? []) {
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
                diceTerms.push({ faces: term.faces, result });
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
function applyDosMinimum(diceTerms, minimum) {
    if (!minimum || minimum <= 0) return;
    const active = diceTerms.filter(entry => entry.result?.active !== false);
    if (!active.length) return;
    active.sort((a, b) => (a.result.result ?? 0) - (b.result.result ?? 0));
    const die = active[0];
    if ((die.result.result ?? 0) < minimum) {
        die.result.result = minimum;
    }
}

/**
 *
 * @param actor
 * @param rollData
 * @param attackRoll
 */
async function buildPowerDamage(actor, rollData, attackRoll) {
    const traits = rollData.weapon.traits ?? {};
    const damageFormula = replaceSymbols(rollData.weapon.damageFormula, actor, rollData.psy.value);
    const damageRoll = await new Roll(`${damageFormula}+${rollData.weapon.damageBonus ?? 0}`).evaluate({ async: true });
    const diceTerms = extractDiceTerms(damageRoll);
    applyDosMinimum(diceTerms, attackRoll.dos);
    const total = damageRoll._evaluateTotal();
    const penetrationFormula = replaceSymbols(rollData.weapon.penetrationFormula ?? "0", actor, rollData.psy.value);
    const penetrationRoll = await new Roll(penetrationFormula).evaluate({ async: true });
    const penetration = penetrationRoll.total;
    return { total, penetration, traits, damageRoll };
}

/**
 *
 * @param actor
 * @param powers
 * @param title
 */
function buildDialogContent(actor, powers, title) {
    const options = powers.map(power => `<option value="${power.id}">${power.name}</option>`).join("");
    return `
    <form class="dh-power-window">
        <div class="form-group">
            <label>Actor</label>
            <div>${actor.name}</div>
        </div>
        <div class="form-group">
            <label>${title}</label>
            <select name="powerId">${options}</select>
        </div>
        <div class="form-group">
            <label>Psy Rating</label>
            <input type="number" name="psyValue" value="${actor.psy.rating}" min="0" />
        </div>
        <div class="form-group">
            <label>Manual Modifier</label>
            <input type="number" name="manualMod" value="0" />
        </div>
    </form>`;
}

/**
 *
 * @param actor
 * @param powers
 * @param title
 */
async function resolveDialog(actor, powers, title) {
    if (!powers.length) {
        ui.notifications.warn("No psychic powers available.");
        return null;
    }
    return new Promise(resolve => {
        const content = buildDialogContent(actor, powers, title);
        new Dialog({
            title,
            content,
            buttons: {
                roll: {
                    label: "Roll",
                    callback: html => {
                        const powerId = html.find("[name='powerId']").val();
                        const psyValue = Number(html.find("[name='psyValue']").val() || actor.psy.rating);
                        const manualMod = Number(html.find("[name='manualMod']").val() || 0);
                        resolve({ powerId, psyValue, manualMod });
                    }
                },
                cancel: {
                    label: "Cancel",
                    callback: () => resolve(null)
                }
            },
            default: "roll"
        }).render(true);
    });
}

/**
 *
 * @param root0
 * @param root0.actor
 * @param root0.power
 * @param root0.attackRoll
 * @param root0.targetNumber
 * @param root0.targets
 * @param root0.damageEntries
 * @param root0.rangeSummary
 */
async function sendPowerToChat({ actor, power, attackRoll, targetNumber, targets, damageEntries, rangeSummary }) {
    const targetLabel = targets.length ? targets.map(token => token.name).join(", ") : "No target";
    const outcome = attackRoll.success ? "hit" : "missed";
    const damages = damageEntries.map((entry, index) => `<li>Hit ${index + 1}: ${entry.location.label} — ${entry.damage.total} (Pen ${entry.damage.penetration})</li>`).join("");
    const rangeLine = rangeSummary ? `<div class="dh-range">Range: ${rangeSummary}</div>` : "";

    const content = `
    <div class="dh-power-card">
        <div><strong>${actor.name}</strong> uses <strong>${power.name}</strong> and ${outcome} <strong>${targetLabel}</strong>.</div>
        <div>Roll: ${attackRoll.result}/${targetNumber} (${attackRoll.success ? attackRoll.dos : attackRoll.dof} ${attackRoll.success ? "DoS" : "DoF"})</div>
        ${rangeLine}
        <ol>${damages}</ol>
    </div>`;

    await ChatMessage.create({
        content,
        speaker: ChatMessage.getSpeaker({ actor })
    });
}

/**
 *
 * @param actor
 * @param power
 * @param rollData
 * @param attackRoll
 * @param targets
 */
async function resolveDamageEntries(actor, power, rollData, attackRoll, targets) {
    const traits = rollData.weapon.traits ?? {};
    const blast = extractNumericTrait(power.system?.damage?.special ?? "", /Blast\s*\((\d+)\)/i);
    const hits = attackRoll.success ? Math.max(1, attackRoll.dos) : 0;
    const entries = [];
    const baseLocation = getHitLocationFromRoll(attackRoll.result);

    for (let i = 0; i < hits; i += 1) {
        const location = i === 0 ? baseLocation : await rollRandomLocation();
        const damage = await buildPowerDamage(actor, rollData, attackRoll);
        entries.push({ location, damage, blast, target: targets[i % (targets.length || 1)] });
    }
    return entries;
}

/**
 *
 * @param root0
 * @param root0.navigator
 */
export async function runPowerAttackDialog({ navigator = false } = {}) {
    const { actor, token } = resolveActorContext();
    if (!actor) {
        ui.notifications.warn("No actor available.");
        return;
    }

    const powers = actor.items.filter(item => item.type === "psychicPower");
    const title = navigator ? "Navigator Attack" : "Psychic Attack";
    const dialogResult = await resolveDialog(actor, powers, title);
    if (!dialogResult) return;

    const power = powers.find(item => item.id === dialogResult.powerId);
    if (!power) {
        ui.notifications.warn("Selected power not found.");
        return;
    }

    const rollData = DarkHeresyUtil.createPsychicRollData(actor, power);
    rollData.psy.value = dialogResult.psyValue;

    const targets = resolveInitialTargets(token, actor);
    const rangeData = resolveRangeData(token, targets, rollData.weapon.range);
    const targetNumber = (rollData.target.base ?? 0) + clampModifier((rollData.target.modifier ?? 0) + dialogResult.manualMod + (rangeData.modifier ?? 0));
    const attackRoll = await rollTarget(targetNumber);
    const damageEntries = attackRoll.success ? await resolveDamageEntries(actor, power, rollData, attackRoll, targets) : [];

    await sendPowerToChat({
        actor,
        power,
        attackRoll,
        targetNumber,
        targets,
        damageEntries,
        rangeSummary: rangeData.summary
    });
}
