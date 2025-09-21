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
                icon: "<i class=\"fa-solid fa-check\"></i>",
                label: game.i18n.localize("BUTTON.ROLL"),
                callback: async html => {
                    html = $(html);
                    if (rollData.flags?.isEvasion) {
                        const skill = html.find("#selectedSkill")[0];
                        if (skill) {
                            rollData.name = game.i18n.localize(skill.options[skill.selectedIndex].text);
                            rollData.evasions.selected = skill.value;
                        }
                    } else {
                        rollData.name = game.i18n.localize(rollData.name);
                        rollData.target.base = parseInt(html.find("#target")[0].value, 10);
                        rollData.rolledWith = html.find("[name=characteristic] :selected").text();
                    }
                    rollData.target.modifier = parseInt(html.find("#modifier")[0].value, 10);
                    rollData.flags.isDamageRoll = false;
                    rollData.flags.isCombatRoll = false;
                    await commonRoll(rollData);
                }
            },
            cancel: {
                icon: "<i class=\"fa-solid fa-times\"></i>",
                label: game.i18n.localize("BUTTON.CANCEL"),
                callback: () => {}
            }

        },
        default: "roll",
        close: () => {},
        render: html => {
            html = $(html);
            const sel = html.find("select[name=characteristic");
            const target = html.find("#target");
            sel.change(() => {
                target.val(sel.val());
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
    if (rollData.weapon.isRange && rollData.weapon.clip.value <= 0) {
        reportEmptyClip(rollData);
    } else {
        rollData.flags = rollData.flags ?? {};
        if (rollData.weapon.isRange) {
            const autoRangeSelection = _determineAutomaticRange(rollData, actorRef);
            if (autoRangeSelection) {
                rollData.rangeMod = autoRangeSelection.modifier;
                rollData.flags.autoSelectedRange = true;
            } else {
                rollData.rangeMod = 0;
                rollData.flags.autoSelectedRange = false;
            }
        } else {
            rollData.flags.autoSelectedRange = false;
        }
        const html = await renderTemplate("systems/dark-heresy/template/dialog/combat-roll.hbs", rollData);
        let dialog = new Dialog({
            title: rollData.name,
            content: html,
            buttons: {
                roll: {
                    icon: "<i class=\"fa-solid fa-check\"></i>",
                    label: game.i18n.localize("BUTTON.ROLL"),
                    callback: async html => {
                        rollData.name = game.i18n.localize(rollData.name);
                        rollData.target.base = parseInt(html.find("#target")[0]?.value, 10);
                        rollData.target.modifier = parseInt(html.find("#modifier")[0]?.value, 10);
                        const range = html.find("#range")[0];
                        if (range) {
                            rollData.rangeMod = parseInt(range.value, 10);
                            rollData.rangeModText = range.options[range.selectedIndex].text;
                        }

                        const attackType = html.find("#attackType")[0];
                        rollData.attackType = {
                            name: attackType?.value,
                            text: attackType?.options[attackType.selectedIndex].text,
                            modifier: 0
                        };

                        const aim = html.find("#aim")[0];
                        rollData.aim = {
                            val: parseInt(aim?.value, 10),
                            isAiming: aim?.value !== "0",
                            text: aim?.options[aim.selectedIndex].text
                        };

                        if (rollData.weapon.traits.inaccurate) {
                            rollData.aim.val=0;
                        } else if (rollData.weapon.traits.accurate && rollData.aim.isAiming) {
                            rollData.aim.val += 10;
                        }

                        rollData.weapon.damageFormula = html.find("#damageFormula")[0].value.replace(" ", "");
                        rollData.weapon.damageType = html.find("#damageType")[0].value;
                        rollData.weapon.damageBonus = parseInt(html.find("#damageBonus")[0].value, 10);
                        rollData.weapon.penetrationFormula = html.find("#penetration")[0].value;
                        rollData.flags.isDamageRoll = false;
                        rollData.flags.isCombatRoll = true;

                        if (rollData.weapon.traits.skipAttackRoll) {
                            rollData.attackType.name = "standard";
                        }

                        await combatRoll(rollData);
                    }
                },
                cancel: {
                    icon: "<i class=\"fa-solid fa-times\"></i>",
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

function _determineAutomaticRange(rollData, actorRef) {
    if (!rollData.weapon?.isRange || !actorRef) return null;
    if (!game?.user) return null;
    const canvasInstance = globalThis.canvas;
    if (!canvasInstance?.ready || !canvasInstance.grid) return null;

    const targets = Array.from(game.user.targets ?? []);
    if (targets.length === 0) return null;

    const targetToken = targets[0];
    const actorToken = _findActorToken(actorRef, targetToken);
    if (!actorToken || !targetToken) return null;

    const origin = _getTokenCenter(actorToken);
    const destination = _getTokenCenter(targetToken);
    if (!origin || !destination) return null;

    const weaponRange = _normalizeWeaponRange(rollData.weapon.range);
    if (!Number.isFinite(weaponRange) || weaponRange <= 0) return null;

    const distance = canvasInstance.grid.measureDistance(origin, destination);
    if (!Number.isFinite(distance)) return null;

    const modifier = _computeRangeModifier(distance, weaponRange);
    if (modifier === null) return null;

    return { modifier };
}

function _findActorToken(actorRef, targetToken) {
    if (!actorRef) return null;
    if (actorRef.token?.object) return actorRef.token.object;

    const tokens = actorRef.getActiveTokens?.(true) ?? [];
    const targetSceneId = targetToken?.document?.parent?.id ?? targetToken?.scene?.id ?? null;
    let candidates = tokens;
    if (targetSceneId) {
        const sameScene = tokens.filter(token => (token?.document?.parent?.id ?? token?.scene?.id) === targetSceneId);
        if (sameScene.length) candidates = sameScene;
    }

    if (!candidates.length) {
        const canvasTokens = globalThis.canvas?.tokens?.placeables ?? [];
        const sceneMatches = canvasTokens.filter(token => token.actor?.id === actorRef.id);
        if (!sceneMatches.length) return null;
        candidates = sceneMatches;
    }

    const controlled = candidates.find(token => token.controlled);
    if (controlled) return controlled;

    const owned = candidates.find(token => token.isOwner);
    if (owned) return owned;

    return candidates[0] ?? null;
}

function _normalizeWeaponRange(rangeValue) {
    if (rangeValue === null || typeof rangeValue === "undefined") return NaN;
    if (typeof rangeValue === "number") return rangeValue;
    if (typeof rangeValue === "object") {
        const nestedValue = rangeValue.value ?? rangeValue.max ?? rangeValue.min;
        if (typeof nestedValue !== "undefined") {
            const numeric = Number(nestedValue);
            if (!Number.isNaN(numeric)) return numeric;
        }
    }
    const numeric = Number(rangeValue);
    if (!Number.isNaN(numeric)) return numeric;
    const match = String(rangeValue).match(/[-+]?[0-9]*\.?[0-9]+/);
    return match ? Number(match[0]) : NaN;
}

function _computeRangeModifier(distance, weaponRange) {
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

function _getTokenCenter(token) {
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
                icon: "<i class=\"fa-solid fa-check\"></i>",
                label: game.i18n.localize("BUTTON.ROLL"),
                callback: async html => {
                    rollData.name = game.i18n.localize(rollData.name);
                    rollData.target.base = parseInt(html.find("#target")[0]?.value, 10);
                    rollData.target.modifier = parseInt(html.find("#modifier")[0]?.value, 10);
                    rollData.psy.value = parseInt(html.find("#psy")[0].value, 10);
                    rollData.psy.warpConduit = html.find("#warpConduit")[0].checked;
                    rollData.weapon.damageFormula = html.find("#damageFormula")[0].value;
                    rollData.weapon.damageType = html.find("#damageType")[0].value;
                    rollData.weapon.damageBonus = parseInt(html.find("#damageBonus")[0].value, 10);
                    rollData.weapon.penetrationFormula = html.find("#penetration")[0].value;
                    rollData.weapon.rateOfFire = { burst: rollData.psy.value, full: rollData.psy.value };
                    const attackType = html.find("#attackType")[0];
                    rollData.attackType.name = attackType.value;
                    rollData.attackType.text = attackType.options[attackType.selectedIndex].text;
                    rollData.psy.useModifier = true;
                    rollData.flags.isDamageRoll = false;
                    rollData.flags.isCombatRoll = true;
                    await combatRoll(rollData);
                }
            },
            cancel: {
                icon: "<i class=\"fa-solid fa-times\"></i>",
                label: game.i18n.localize("BUTTON.CANCEL"),
                callback: () => {}
            }
        },
        default: "roll",
        close: () => {}
    }, {width: 200});
    dialog.render(true);
}
