import DarkHeresyUtil from "../../../common/util.js";
import {
    actorHasDenyTheWitch,
    buildCharacteristicLookup,
    ensureDenyTheWitchTalent,
    resolveActorContext,
    spendFate
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
        <nav class="tabs" data-group="dh-defend-tabs">${nav}</nav>
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
 * @param actor
 * @param denyAvailable
 */
function buildDialogContent(actor, denyAvailable) {
    const denyOption = denyAvailable ? "" : "disabled";
    const tabs = buildTabsContent([
        {
            id: "defence",
            label: "Defence",
            content: `
            <div class="form-group">
                <label>Defence Type</label>
                <select name="defenceType">
                    <option value="dodge">Dodge</option>
                    <option value="parry">Parry (+10)</option>
                    <option value="deny" ${denyOption}>Deny the Witch</option>
                </select>
            </div>
            <div class="form-group">
                <label>Manual Modifier</label>
                <input type="number" name="manualMod" value="0" />
            </div>
            <div class="form-group">
                <label>Fate (before roll)</label>
                <label><input type="checkbox" name="fateBefore" /> Spend Fate for +20</label>
            </div>`
        },
        {
            id: "stats",
            label: "Stats",
            content: `
            <p>Weapon Skill: ${actor.characteristics.weaponSkill.total}</p>
            <p>Ballistic Skill: ${actor.characteristics.ballisticSkill.total}</p>
            <p>Willpower: ${actor.characteristics.willpower.total}</p>
            <p>Agility: ${actor.characteristics.agility.total}</p>`
        }
    ]);

    return `
    <form class="dh-defend-window">
        <div class="form-group">
            <label>Actor</label>
            <div>${actor.name}</div>
        </div>
        ${tabs}
    </form>`;
}

/**
 *
 * @param actor
 * @param targetNumber
 * @param rollResult
 */
async function handlePostRollFate(actor, targetNumber, rollResult) {
    if (rollResult.success) return rollResult;
    const available = Number(actor?.fate?.value ?? 0) > 0;
    if (!available) return rollResult;

    return new Promise(resolve => {
        new Dialog({
            title: "Spend Fate",
            content: `<p>${actor.name} failed (${rollResult.result}/${targetNumber}). Spend Fate?</p>`,
            buttons: {
                plusTen: {
                    label: "+10 & Reroll",
                    callback: async () => {
                        const spent = await spendFate(actor);
                        if (!spent) return resolve(rollResult);
                        const reroll = await rollTarget(targetNumber + 10);
                        reroll.fateSpent = true;
                        resolve(reroll);
                    }
                },
                reroll: {
                    label: "Fate Reroll",
                    callback: async () => {
                        const spent = await spendFate(actor);
                        if (!spent) return resolve(rollResult);
                        const reroll = await rollTarget(targetNumber);
                        reroll.fateSpent = true;
                        resolve(reroll);
                    }
                },
                keep: {
                    label: "Keep Result",
                    callback: () => resolve(rollResult)
                }
            },
            default: "keep"
        }).render(true);
    });
}

/**
 *
 * @param actor
 * @param defenceType
 * @param manualMod
 * @param fateBefore
 */
async function resolveDefenceRoll(actor, defenceType, manualMod, fateBefore) {
    const defenceData = defenceType === "deny"
        ? DarkHeresyUtil.createCharacteristicRollData(actor, "willpower")
        : DarkHeresyUtil.createSkillRollData(actor, defenceType);

    if (defenceType === "parry") {
        defenceData.target.modifier = (defenceData.target.modifier ?? 0) + 10;
    }

    const fateBeforeMod = fateBefore ? 20 : 0;
    const modifier = (defenceData.target.modifier ?? 0) + manualMod + fateBeforeMod;
    const targetNumber = (defenceData.target.base ?? 0) + clampModifier(modifier);
    let rollResult = await rollTarget(targetNumber);
    rollResult = await handlePostRollFate(actor, targetNumber, rollResult);
    return { defenceData, targetNumber, rollResult };
}

/**
 *
 * @param root0
 * @param root0.actor
 * @param root0.defenceType
 * @param root0.targetNumber
 * @param root0.rollResult
 * @param root0.manualMod
 */
async function sendDefenceToChat({ actor, defenceType, targetNumber, rollResult, manualMod }) {
    const labelMap = {
        dodge: "Dodge",
        parry: "Parry",
        deny: "Deny the Witch"
    };
    const label = labelMap[defenceType] ?? defenceType;
    const outcome = rollResult.success ? "succeeded" : "failed";
    const characteristics = buildCharacteristicLookup(actor);
    const statSummary = `WS ${characteristics.weaponSkill.total} • BS ${characteristics.ballisticSkill.total} • WP ${characteristics.willpower.total}`;

    const content = `
    <div class="dh-defend-card">
        <div><strong>${actor.name}</strong> attempts to ${label}.</div>
        <div>Target: ${targetNumber} (${manualMod >= 0 ? "+" : ""}${manualMod} manual)</div>
        <div>Result: ${rollResult.result}/${targetNumber} — ${outcome} (${rollResult.success ? rollResult.dos : rollResult.dof} ${rollResult.success ? "DoS" : "DoF"})</div>
        <div class="notes">${statSummary}</div>
    </div>`;

    await ChatMessage.create({
        content,
        speaker: ChatMessage.getSpeaker({ actor })
    });
}

/**
 *
 */
export async function runDefendDialog() {
    const { actor } = resolveActorContext();
    if (!actor) {
        ui.notifications.warn("No actor available to defend.");
        return;
    }

    if (game.user.isGM) {
        await ensureDenyTheWitchTalent();
    }

    const denyAvailable = actorHasDenyTheWitch(actor);

    const result = await new Promise(resolve => {
        const content = buildDialogContent(actor, denyAvailable);
        new Dialog({
            title: "Defend",
            content,
            buttons: {
                defend: {
                    label: "Roll Defence",
                    callback: html => {
                        const defenceType = html.find("[name='defenceType']").val();
                        const manualMod = Number(html.find("[name='manualMod']").val() || 0);
                        const fateBefore = html.find("[name='fateBefore']").is(":checked");
                        resolve({ defenceType, manualMod, fateBefore });
                    }
                },
                cancel: {
                    label: "Cancel",
                    callback: () => resolve(null)
                }
            },
            default: "defend",
            render: html => activateTabs(html)
        }).render(true);
    });

    if (!result) return;
    if (result.defenceType === "deny" && !denyAvailable) {
        ui.notifications.warn("Deny the Witch is not available on this actor.");
        return;
    }

    const defenceRoll = await resolveDefenceRoll(actor, result.defenceType, result.manualMod, result.fateBefore);
    await sendDefenceToChat({
        actor,
        defenceType: result.defenceType,
        targetNumber: defenceRoll.targetNumber,
        rollResult: defenceRoll.rollResult,
        manualMod: result.manualMod
    });
}
