import DarkHeresyUtil from "../common/util.js";
import { combatRoll, commonRoll, reportEmptyClip } from "../common/roll.js";

const LOGGER = "[AutoNPC]";

export class AutoNpcMacro {

    static behaviors = {
        balanced: context => this._balancedBehavior(context),
        berserker: context => this._berserkerBehavior(context),
        marksman: context => this._marksmanBehavior(context),
        skirmisher: context => this._skirmisherBehavior(context),
        hunter: context => this._hunterBehavior(context),
        bulwark: context => this._bulwarkBehavior(context),
        commander: context => this._commanderBehavior(context),
        zealot: context => this._zealotBehavior(context),
        psyker: context => this._psykerBehavior(context),
        survivor: context => this._survivorBehavior(context)
    };

    static async runTurn(options = {}) {
        try {
            const actor = this._resolveActor(options);
            if (!actor) {
                this._logError("Unable to resolve an actor for NPC automation.");
                return false;
            }

            const token = this._resolveToken(actor, options);
            if (!token) {
                this._logError(`No active token found for ${actor.name}.`);
                return false;
            }

            const personalities = game.darkHeresy?.config?.npcPersonalities;
            if (!personalities) {
                this._logError("NPC personality configuration is missing.");
                return false;
            }

            const personalityId = actor.system?.personality ?? "balanced";
            const personality = personalities[personalityId] ?? personalities.balanced;
            if (!personality) {
                this._logError(`Personality '${personalityId}' is not defined.`);
                return false;
            }

            const behaviorId = personality.behavior ?? personalityId;
            const behavior = this.behaviors[behaviorId];
            if (!behavior) {
                this._logError(`Automation behavior '${behaviorId}' has not been implemented.`);
                return false;
            }

            const context = await this._buildContext(actor, token, personalityId, personality, options);
            if (!context.target) {
                console.warn(`${LOGGER} No hostile targets found for ${actor.name}.`);
            } else {
                await behavior.call(this, context);
            }

            if (game.combat) {
                await game.combat.nextTurn();
            }
            return true;
        } catch(error) {
            console.error(`${LOGGER} ${error.message}`, error);
            return false;
        }
    }

    static _resolveActor(options) {
        if (options?.actor) return options.actor;
        if (typeof options?.actorId === "string") {
            const actor = game.actors?.get(options.actorId);
            if (actor) return actor;
        }
        const speaker = ChatMessage.getSpeaker?.() ?? {};
        if (speaker.actor) {
            const actor = game.actors?.get(speaker.actor);
            if (actor) return actor;
        }
        return null;
    }

    static _resolveToken(actor, options) {
        const direct = this._resolveCanvasToken(options?.token ?? options?.tokenDocument);
        if (direct) return direct;
        if (typeof options?.tokenId === "string") {
            const token = this._resolveCanvasToken(options.tokenId);
            if (token) return token;
        }

        if (actor.token?.object) return actor.token.object;

        const tokens = actor.getActiveTokens?.(true) ?? [];
        if (tokens.length === 1) return tokens[0];
        const controlled = tokens.find(token => token.controlled);
        if (controlled) return controlled;
        const owned = tokens.find(token => token.isOwner);
        if (owned) return owned;
        if (tokens.length) return tokens[0];

        const canvasTokens = globalThis.canvas?.tokens?.placeables ?? [];
        return canvasTokens.find(token => token.actor?.id === actor.id) ?? null;
    }

    static _resolveCanvasToken(tokenLike) {
        if (!tokenLike) return null;
        if (tokenLike instanceof Token) return tokenLike;
        if (tokenLike.object instanceof Token) return tokenLike.object;
        if (tokenLike.document?.object instanceof Token) return tokenLike.document.object;
        if (typeof tokenLike === "string") return globalThis.canvas?.tokens?.get(tokenLike) ?? null;
        if (typeof tokenLike?.id === "string") return globalThis.canvas?.tokens?.get(tokenLike.id) ?? null;
        return null;
    }

    static async _buildContext(actor, token, personalityId, personality, options) {
        const target = this._selectTarget(token, options);
        const distance = target ? this._measureDistance(token, target) : null;
        const targetActor = target?.actor ?? target?.document?.actor ?? null;
        const { meleeWeapons, rangedWeapons } = this._partitionWeapons(actor);
        const availableRanged = rangedWeapons.filter(weapon => this._hasAmmo(weapon));
        const bestMelee = this._choosePreferredWeapon(meleeWeapons);
        const bestRanged = this._choosePreferredWeapon(availableRanged.length ? availableRanged : rangedWeapons);

        return {
            actor,
            token,
            target,
            targetActor,
            distance,
            personalityId,
            personality,
            meleeWeapons,
            rangedWeapons,
            availableRanged,
            bestMelee,
            bestRanged,
            options
        };
    }

    static _selectTarget(token, options) {
        const explicit = this._resolveCanvasToken(options?.target ?? options?.targetDocument);
        if (explicit) return explicit;
        if (typeof options?.targetId === "string") {
            const tokenById = this._resolveCanvasToken(options.targetId);
            if (tokenById) return tokenById;
        }

        const targeted = Array.from(game.user?.targets ?? []);
        if (targeted.length) return targeted[0];

        const hostiles = this._findHostileTargets(token);
        if (hostiles.length) return hostiles[0];

        const combatantTargets = this._findCombatTargets(token);
        if (combatantTargets.length) return combatantTargets[0];

        return null;
    }

    static _findHostileTargets(token) {
        const canvasTokens = globalThis.canvas?.tokens?.placeables ?? [];
        if (!token) return [];
        return canvasTokens
            .filter(target => target?.actor && this._isHostile(token, target))
            .sort((a, b) => {
                const aDist = this._measureDistance(token, a) ?? Number.POSITIVE_INFINITY;
                const bDist = this._measureDistance(token, b) ?? Number.POSITIVE_INFINITY;
                return aDist - bDist;
            });
    }

    static _findCombatTargets(token) {
        if (!game.combat) return [];
        const combatants = game.combat.combatants ?? [];
        return combatants
            .map(combatant => this._resolveCanvasToken(combatant.token ?? combatant.tokenId))
            .filter(target => target?.actor && this._isHostile(token, target))
            .sort((a, b) => {
                const aDist = this._measureDistance(token, a) ?? Number.POSITIVE_INFINITY;
                const bDist = this._measureDistance(token, b) ?? Number.POSITIVE_INFINITY;
                return aDist - bDist;
            });
    }

    static _isHostile(source, target) {
        if (!source || !target) return false;
        const sourceDisposition = source.document?.disposition ?? source.data?.disposition ?? 0;
        const targetDisposition = target.document?.disposition ?? target.data?.disposition ?? 0;
        if (sourceDisposition === 0 || targetDisposition === 0) {
            return source.actor?.id !== target.actor?.id;
        }
        return Math.sign(sourceDisposition) !== Math.sign(targetDisposition);
    }

    static _partitionWeapons(actor) {
        const weapons = actor.itemTypes?.weapon ?? [];
        const meleeWeapons = [];
        const rangedWeapons = [];
        for (const weapon of weapons) {
            if (weapon.class === "melee") meleeWeapons.push(weapon);
            else rangedWeapons.push(weapon);
        }
        return { meleeWeapons, rangedWeapons };
    }

    static _hasAmmo(weapon) {
        const clip = weapon?.clip;
        if (!clip) return true;
        if (clip.max <= 0) return true;
        return clip.value > 0;
    }

    static _choosePreferredWeapon(weapons = []) {
        if (!weapons.length) return null;
        return weapons
            .slice()
            .sort((a, b) => {
                const attackA = Number(a.attack ?? 0) || 0;
                const attackB = Number(b.attack ?? 0) || 0;
                return attackB - attackA;
            })[0];
    }

    static _measureDistance(source, target) {
        const canvasInstance = globalThis.canvas;
        if (!canvasInstance?.ready || !canvasInstance.grid) return null;
        const origin = this._getTokenCenter(source);
        const destination = this._getTokenCenter(target);
        if (!origin || !destination) return null;
        const distance = canvasInstance.grid.measureDistance(origin, destination);
        return Number.isFinite(distance) ? distance : null;
    }

    static _getTokenCenter(token) {
        if (!token) return null;
        if (token.center) return token.center;
        if (typeof token.getCenter === "function") return token.getCenter();
        if (token.object && token.object !== token) {
            if (token.object.center) return token.object.center;
            if (typeof token.object.getCenter === "function") return token.object.getCenter();
        }
        return null;
    }

    static _normalizeWeaponRange(rangeValue) {
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

    static _computeRangeModifier(distance, weaponRange) {
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

    static _supportsAttackType(weapon, attackType) {
        if (!weapon) return false;
        switch (attackType) {
            case "semi_auto":
            case "barrage":
            case "swift":
                return (weapon.rateOfFire?.burst ?? 0) > 0;
            case "full_auto":
            case "lightning":
                return (weapon.rateOfFire?.full ?? 0) > 0;
            case "charge":
            case "allOut":
                return weapon.class === "melee";
            default:
                return true;
        }
    }

    static _createAim(bonus = 0) {
        return {
            val: bonus,
            isAiming: bonus !== 0
        };
    }

    static _computeShotsFired(rollData) {
        switch (rollData.attackType?.name) {
            case "semi_auto":
            case "swift":
            case "barrage":
                return Math.max(1, rollData.weapon?.rateOfFire?.burst ?? 1);
            case "full_auto":
            case "lightning":
                return Math.max(1, rollData.weapon?.rateOfFire?.full ?? 1);
            default:
                return 1;
        }
    }

    static async executeRanged(context, { weapon, attackType = "standard", aim = 0, modifier = 0 } = {}) {
        const selectedWeapon = weapon ?? context.bestRanged;
        if (!selectedWeapon) return false;
        const supported = this._supportsAttackType(selectedWeapon, attackType) ? attackType : "standard";

        if (!this._hasAmmo(selectedWeapon)) {
            const rollData = DarkHeresyUtil.createWeaponRollData(context.actor, selectedWeapon);
            rollData.flags.isCombatRoll = true;
            rollData.flags.isDamageRoll = false;
            rollData.flags.isAttack = true;
            await reportEmptyClip(rollData);
            return false;
        }

        const rollData = DarkHeresyUtil.createWeaponRollData(context.actor, selectedWeapon);
        rollData.flags.isCombatRoll = true;
        rollData.flags.isDamageRoll = false;
        rollData.flags.isAttack = true;
        rollData.attackType.name = supported;
        rollData.aim = this._createAim(aim);
        rollData.target.modifier += modifier;

        const rangeValue = this._normalizeWeaponRange(selectedWeapon.range ?? selectedWeapon.system?.range ?? 0);
        const rangeMod = this._computeRangeModifier(context.distance ?? NaN, rangeValue);
        if (rangeMod === null && selectedWeapon.class !== "melee") {
            return false;
        }
        rollData.rangeMod = rangeMod ?? 0;
        rollData.shotsFired = this._computeShotsFired(rollData);

        await combatRoll(rollData);
        return true;
    }

    static async executeMelee(context, { weapon, attackType = "standard", aim = 0, modifier = 0 } = {}) {
        const selectedWeapon = weapon ?? context.bestMelee;
        if (!selectedWeapon) return false;
        const supported = this._supportsAttackType(selectedWeapon, attackType) ? attackType : "standard";

        const rollData = DarkHeresyUtil.createWeaponRollData(context.actor, selectedWeapon);
        rollData.flags.isCombatRoll = true;
        rollData.flags.isDamageRoll = false;
        rollData.flags.isAttack = true;
        rollData.attackType.name = supported;
        rollData.aim = this._createAim(aim);
        rollData.target.modifier += modifier;
        rollData.shotsFired = this._computeShotsFired(rollData);

        await combatRoll(rollData);
        return true;
    }

    static async executeDefense(context, { prefer } = {}) {
        const skills = context.actor.skills ?? {};
        const dodgeSkill = skills.dodge;
        const parrySkill = skills.parry;
        if (!dodgeSkill && !parrySkill) return false;

        let selected = prefer;
        if (selected === "dodge" && !dodgeSkill) selected = null;
        if (selected === "parry" && !parrySkill) selected = null;
        if (!selected) {
            const dodgeValue = dodgeSkill?.total ?? -Infinity;
            const parryValue = parrySkill?.total ?? -Infinity;
            selected = dodgeValue >= parryValue ? "dodge" : "parry";
        }

        const rollData = DarkHeresyUtil.createSkillRollData(context.actor, selected);
        rollData.flags.isEvasion = true;
        rollData.flags.isCombatRoll = false;
        rollData.flags.isDamageRoll = false;
        rollData.flags.isAttack = false;
        rollData.target.modifier = 0;
        rollData.name = game.i18n.localize("DIALOG.EVASION");
        rollData.evasions = {
            dodge: DarkHeresyUtil.createSkillRollData(context.actor, "dodge"),
            parry: DarkHeresyUtil.createSkillRollData(context.actor, "parry"),
            deny: DarkHeresyUtil.createCharacteristicRollData(context.actor, "willpower"),
            selected
        };

        await commonRoll(rollData);
        return true;
    }

    static _isWithinMeleeRange(context) {
        if (context.distance === null || typeof context.distance === "undefined") return false;
        return context.distance <= 2;
    }

    static async _balancedBehavior(context) {
        const ranged = await this.executeRanged(context, { aim: 10, attackType: "standard" });
        if (ranged) return true;
        const meleeType = this._isWithinMeleeRange(context) ? "allOut" : "charge";
        return this.executeMelee(context, { attackType: meleeType });
    }

    static async _berserkerBehavior(context) {
        const meleeType = this._isWithinMeleeRange(context) ? "allOut" : "charge";
        const melee = await this.executeMelee(context, { attackType: meleeType });
        if (melee) return true;
        return this.executeRanged(context, { attackType: "standard" });
    }

    static async _marksmanBehavior(context) {
        const ranged = await this.executeRanged(context, { aim: 20, attackType: "called_shot" });
        if (ranged) return true;
        return this._balancedBehavior(context);
    }

    static async _skirmisherBehavior(context) {
        const preferredWeapon = context.bestRanged ?? context.bestMelee;
        let attackType = "standard";
        if (preferredWeapon && this._supportsAttackType(preferredWeapon, "semi_auto")) {
            attackType = "semi_auto";
        }
        const ranged = await this.executeRanged(context, { attackType, aim: 10 });
        if (ranged) {
            await this.executeDefense(context, { prefer: "dodge" });
            return true;
        }
        const meleeAttackType = context.bestMelee && this._supportsAttackType(context.bestMelee, "swift") ? "swift" : "standard";
        const melee = await this.executeMelee(context, { attackType: meleeAttackType });
        if (melee) {
            await this.executeDefense(context, { prefer: "parry" });
            return true;
        }
        return false;
    }

    static async _hunterBehavior(context) {
        if (this._isWithinMeleeRange(context)) {
            await this.executeDefense(context, { prefer: "dodge" });
        }
        const ranged = await this.executeRanged(context, { aim: 10, attackType: "standard" });
        if (ranged) return true;
        return this.executeMelee(context, { attackType: "charge" });
    }

    static async _bulwarkBehavior(context) {
        const meleeType = this._isWithinMeleeRange(context) ? "allOut" : "charge";
        const melee = await this.executeMelee(context, { attackType: meleeType, aim: 10 });
        if (melee) {
            await this.executeDefense(context, { prefer: "parry" });
            return true;
        }
        return this.executeRanged(context, { attackType: "standard" });
    }

    static async _commanderBehavior(context) {
        const commandSkill = context.actor.skills?.command;
        if (commandSkill) {
            const rollData = DarkHeresyUtil.createSkillRollData(context.actor, "command");
            rollData.flags.isEvasion = false;
            rollData.flags.isCombatRoll = false;
            rollData.flags.isDamageRoll = false;
            await commonRoll(rollData);
        }
        const attackType = context.bestRanged && this._supportsAttackType(context.bestRanged, "semi_auto") ? "semi_auto" : "standard";
        const ranged = await this.executeRanged(context, { attackType, aim: 10 });
        if (ranged) return true;
        return this.executeMelee(context, { attackType: "standard" });
    }

    static async _zealotBehavior(context) {
        const meleeType = context.bestMelee && this._supportsAttackType(context.bestMelee, "lightning") ? "lightning" : "charge";
        const melee = await this.executeMelee(context, { attackType: meleeType });
        if (melee) return true;
        return this.executeRanged(context, { attackType: "full_auto" });
    }

    static async _psykerBehavior(context) {
        const powers = context.actor.itemTypes?.psychicPower ?? [];
        const offensive = powers.find(power => power.system?.damage?.formula || power.system?.damage?.special);
        if (offensive) {
            const rollData = DarkHeresyUtil.createPsychicRollData(context.actor, offensive);
            rollData.flags.isCombatRoll = true;
            rollData.flags.isDamageRoll = false;
            rollData.flags.isAttack = true;
            rollData.psy.useModifier = true;
            const weaponRange = this._normalizeWeaponRange(offensive.range ?? 0);
            const rangeModifier = this._computeRangeModifier(context.distance ?? NaN, weaponRange);
            rollData.rangeMod = rangeModifier ?? 0;
            await combatRoll(rollData);
            return true;
        }
        const ranged = await this.executeRanged(context, { aim: 10, attackType: "standard" });
        if (ranged) return true;
        return this.executeMelee(context, { attackType: "standard" });
    }

    static async _survivorBehavior(context) {
        await this.executeDefense(context, { prefer: "dodge" });
        const ranged = await this.executeRanged(context, { attackType: "standard" });
        if (ranged) return true;
        return this.executeMelee(context, { attackType: "standard" });
    }

    static _logError(message) {
        console.error(`${LOGGER} ${message}`);
    }
}

export default AutoNpcMacro;
