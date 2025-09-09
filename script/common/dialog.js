import { commonRoll, combatRoll, reportEmptyClip } from "./roll.js";

/**
 * Show a generic roll dialog.
 * @param {object} rollData
 */
export async function prepareCommonRoll(rollData) {
    const html = await renderTemplate("systems/dark-heresy/template/dialog/common-roll.hbs", rollData);
    let dialog = new Dialog({
        title: game.i18n.localize(rollData.name),
        content: html,
        buttons: {
            roll: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize("BUTTON.ROLL"),
                callback: async html => {
                    const element = html[0] ?? html;
                    if (rollData.flags?.isEvasion) {
                        const skill = element.querySelector("#selectedSkill");
                        if (skill) {
                            rollData.name = game.i18n.localize(skill.options[skill.selectedIndex].text);
                            rollData.evasions.selected = skill.value;
                        }
                    } else {
                        rollData.name = game.i18n.localize(rollData.name);
                        rollData.target.base = parseInt(element.querySelector("#target").value, 10);
                        const characteristic = element.querySelector("[name=characteristic]");
                        rollData.rolledWith = characteristic.options[characteristic.selectedIndex].text;
                    }
                    rollData.target.modifier = parseInt(element.querySelector("#modifier").value, 10);
                    rollData.flags.isDamageRoll = false;
                    rollData.flags.isCombatRoll = false;
                    await commonRoll(rollData);
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize("BUTTON.CANCEL"),
                callback: () => {}
            }

        },
        default: "roll",
        close: () => {},
        render: html => {
            const element = html[0] ?? html;
            const sel = element.querySelector("select[name=characteristic]");
            const target = element.querySelector("#target");
            sel?.addEventListener("change", () => {
                target.value = sel.value;
            });
        }
    }, {
        width: 200
    });
    dialog.render(true);
}

/**
 * Show a combat roll dialog.
 * @param {object} rollData
 * @param {DarkHeresyActor} actorRef
 */
export async function prepareCombatRoll(rollData, actorRef) {
    if (rollData.weapon.isRanged && rollData.weapon.clip.value <= 0) {
        reportEmptyClip(rollData);
    } else {
        const html = await renderTemplate("systems/dark-heresy/template/dialog/combat-roll.hbs", rollData);
        let dialog = new Dialog({
            title: rollData.name,
            content: html,
            buttons: {
                roll: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize("BUTTON.ROLL"),
                    callback: async html => {
                        const element = html[0] ?? html;
                        rollData.name = game.i18n.localize(rollData.name);
                        rollData.target.base = parseInt(element.querySelector("#target")?.value, 10);
                        rollData.target.modifier = parseInt(element.querySelector("#modifier")?.value, 10);
                        const range = element.querySelector("#range");
                        if (range) {
                            rollData.rangeMod = parseInt(range.value, 10);
                            rollData.rangeModText = range.options[range.selectedIndex].text;
                        }

                        const attackType = element.querySelector("#attackType");
                        rollData.attackType = {
                            name: attackType?.value,
                            text: attackType?.options[attackType.selectedIndex].text,
                            modifier: 0
                        };

                        const aim = element.querySelector("#aim");
                        rollData.aim = {
                            val: parseInt(aim?.value, 10),
                            isAiming: aim?.value !== "0",
                            text: aim?.options[aim.selectedIndex].text
                        };

                        if (rollData.weapon.traits.inaccurate) {
                            rollData.aim.val = 0;
                        } else if (rollData.weapon.traits.accurate && rollData.aim.isAiming) {
                            rollData.aim.val += 10;
                        }

                        rollData.weapon.damageFormula = element.querySelector("#damageFormula").value.replace(" ", "");
                        rollData.weapon.damageType = element.querySelector("#damageType").value;
                        rollData.weapon.damageBonus = parseInt(element.querySelector("#damageBonus").value, 10);
                        rollData.weapon.penetrationFormula = element.querySelector("#penetration").value;
                        rollData.flags.isDamageRoll = false;
                        rollData.flags.isCombatRoll = true;

                        if (rollData.weapon.traits.skipAttackRoll) {
                            rollData.attackType.name = "standard";
                        }

                        await combatRoll(rollData);
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("BUTTON.CANCEL"),
                    callback: () => {}
                }
            },
            default: "roll",
            close: () => {}
        }, {width: 200});
        dialog.render(true);
    }
}

/**
 * Show a psychic power roll dialog.
 * @param {object} rollData
 */
export async function preparePsychicPowerRoll(rollData) {
    const html = await renderTemplate("systems/dark-heresy/template/dialog/psychic-power-roll.hbs", rollData);
    let dialog = new Dialog({
        title: rollData.name,
        content: html,
        buttons: {
            roll: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize("BUTTON.ROLL"),
                callback: async html => {
                    const element = html[0] ?? html;
                    rollData.name = game.i18n.localize(rollData.name);
                    rollData.target.base = parseInt(element.querySelector("#target")?.value, 10);
                    rollData.target.modifier = parseInt(element.querySelector("#modifier")?.value, 10);
                    rollData.psy.value = parseInt(element.querySelector("#psy").value, 10);
                    rollData.psy.warpConduit = element.querySelector("#warpConduit").checked;
                    rollData.weapon.damageFormula = element.querySelector("#damageFormula").value;
                    rollData.weapon.damageType = element.querySelector("#damageType").value;
                    rollData.weapon.damageBonus = parseInt(element.querySelector("#damageBonus").value, 10);
                    rollData.weapon.penetrationFormula = element.querySelector("#penetration").value;
                    rollData.weapon.rateOfFire = { burst: rollData.psy.value, full: rollData.psy.value };
                    const attackType = element.querySelector("#attackType");
                    rollData.attackType.name = attackType.value;
                    rollData.attackType.text = attackType.options[attackType.selectedIndex].text;
                    rollData.psy.useModifier = true;
                    rollData.flags.isDamageRoll = false;
                    rollData.flags.isCombatRoll = true;
                    await combatRoll(rollData);
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize("BUTTON.CANCEL"),
                callback: () => {}
            }
        },
        default: "roll",
        close: () => {}
    }, {width: 200});
    dialog.render(true);
}
