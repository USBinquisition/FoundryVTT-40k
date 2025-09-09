import {prepareCommonRoll, prepareCombatRoll, preparePsychicPowerRoll} from "../../common/dialog.js";
import DarkHeresyUtil from "../../common/util.js";

export class DarkHeresySheet extends ActorSheet {
    activateListeners(html) {
        super.activateListeners(html);
        const element = html[0] ?? html;
        element.querySelectorAll(".item-create").forEach(el => el.addEventListener("click", ev => this._onItemCreate(ev)));
        element.querySelectorAll(".item-edit").forEach(el => el.addEventListener("click", ev => this._onItemEdit(ev)));
        element.querySelectorAll(".item-delete").forEach(el => el.addEventListener("click", ev => this._onItemDelete(ev)));
        element.querySelectorAll("input").forEach(el => el.addEventListener("focusin", ev => this._onFocusIn(ev)));
        element.querySelectorAll(".roll-characteristic").forEach(el => el.addEventListener("click", async ev => await this._prepareRollCharacteristic(ev)));
        element.querySelectorAll(".roll-skill").forEach(el => el.addEventListener("click", async ev => await this._prepareRollSkill(ev)));
        element.querySelectorAll(".roll-speciality").forEach(el => el.addEventListener("click", async ev => await this._prepareRollSpeciality(ev)));
        element.querySelectorAll(".roll-insanity").forEach(el => el.addEventListener("click", async ev => await this._prepareRollInsanity(ev)));
        element.querySelectorAll(".roll-corruption").forEach(el => el.addEventListener("click", async ev => await this._prepareRollCorruption(ev)));
        element.querySelectorAll(".roll-weapon").forEach(el => el.addEventListener("click", async ev => await this._prepareRollWeapon(ev)));
        element.querySelectorAll(".roll-psychic-power").forEach(el => el.addEventListener("click", async ev => await this._prepareRollPsychicPower(ev)));
    }

    /** @override */
    async getData() {
        const data = super.getData();
        data.system = data.data.system;
        data.items = this.constructItemLists(data);
        data.enrichment = await this._enrichment();
        return data;
    }

    async _enrichment() {
        let enrichment = {};
        if (this.actor.type !== "npc") {
            enrichment["system.bio.notes"] = await TextEditor.enrichHTML(this.actor.system.bio.notes, {async: true});
        } else {
            enrichment["system.notes"] = await TextEditor.enrichHTML(this.actor.system.notes, {async: true});
        }
        return foundry.utils.expandObject(enrichment);
    }

    /** @override */
    get template() {
        if (!game.user.isGM && this.actor.limited) {
            return "systems/dark-heresy/template/sheet/actor/limited-sheet.hbs";
        } else {
            return this.options.template;
        }
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        if (this.actor.isOwner) {
            buttons = [
                {
                    label: game.i18n.localize("BUTTON.ROLL"),
                    class: "custom-roll",
                    icon: "fas fa-dice",
                    onclick: async () => await this._prepareCustomRoll()
                }
            ].concat(buttons);
        }
        return buttons;
    }

    _onItemCreate(event) {
        event.preventDefault();
        let header = event.currentTarget.dataset;

        let data = {
            name: `New ${game.i18n.localize(`TYPES.Item.${header.type.toLowerCase()}`)}`,
            type: header.type
        };
        this.actor.createEmbeddedDocuments("Item", [data], { renderSheet: true });
    }

    _onItemEdit(event) {
        event.preventDefault();
        const div = event.currentTarget.closest(".item");
        let item = this.actor.items.get(div.dataset.itemId);
        item.sheet.render(true);
    }

    _onItemDelete(event) {
        event.preventDefault();
        const div = event.currentTarget.closest(".item");
        this.actor.deleteEmbeddedDocuments("Item", [div.dataset.itemId]);
        div.remove();
        this.render(false);
    }

    async _prepareCustomRoll() {
        const rollData = {
            name: "DIALOG.CUSTOM_ROLL",
            baseTarget: 50,
            modifier: 0,
            ownerId: this.actor.id
        };
        await prepareCommonRoll(rollData);
    }

    async _prepareRollCharacteristic(event) {
        event.preventDefault();
        const characteristicName = event.currentTarget.dataset.characteristic;
        await prepareCommonRoll(
            DarkHeresyUtil.createCharacteristicRollData(this.actor, characteristicName)
        );
    }

    async _prepareRollSkill(event) {
        event.preventDefault();
        const skillName = event.currentTarget.dataset.skill;
        await prepareCommonRoll(
            DarkHeresyUtil.createSkillRollData(this.actor, skillName)
        );
    }

    async _prepareRollSpeciality(event) {
        event.preventDefault();
        const skillName = event.currentTarget.closest(".item").dataset.skill;
        const specialityName = event.currentTarget.dataset.speciality;
        await prepareCommonRoll(
            DarkHeresyUtil.createSpecialtyRollData(this.actor, skillName, specialityName)
        );
    }

    async _prepareRollInsanity(event) {
        event.preventDefault();
        await prepareCommonRoll(
            DarkHeresyUtil.createFearTestRolldata(this.actor)
        );
    }

    async _prepareRollCorruption(event) {
        event.preventDefault();
        await prepareCommonRoll(
            DarkHeresyUtil.createMalignancyTestRolldata(this.actor)
        );
    }

    async _prepareRollWeapon(event) {
        event.preventDefault();
        const div = event.currentTarget.closest(".item");
        const weapon = this.actor.items.get(div.dataset.itemId);
        await prepareCombatRoll(
            DarkHeresyUtil.createWeaponRollData(this.actor, weapon),
            this.actor
        );
    }

    async _prepareRollPsychicPower(event) {
        event.preventDefault();
        const div = event.currentTarget.closest(".item");
        const psychicPower = this.actor.items.get(div.dataset.itemId);
        await preparePsychicPowerRoll(
            DarkHeresyUtil.createPsychicRollData(this.actor, psychicPower)
        );
    }

    _onFocusIn(event) {
        event.currentTarget.select();
    }

    constructItemLists() {
        let items = {};
        let itemTypes = this.actor.itemTypes;
        items.mentalDisorders = itemTypes.mentalDisorder;
        items.malignancies = itemTypes.malignancy;
        items.mutations = itemTypes.mutation;
        if (this.actor.type === "npc") {
            items.abilities = itemTypes.talent
                .concat(itemTypes.trait)
                .concat(itemTypes.specialAbility);
        }
        items.talents = itemTypes.talent;
        items.traits = itemTypes.trait;
        items.specialAbilities = itemTypes.specialAbility;
        items.aptitudes = itemTypes.aptitude;

        items.psychicPowers = itemTypes.psychicPower;

        items.criticalInjuries = itemTypes.criticalInjury;

        items.gear = itemTypes.gear;
        items.drugs = itemTypes.drug;
        items.tools = itemTypes.tool;
        items.cybernetics = itemTypes.cybernetic;

        items.armour = itemTypes.armour;
        items.forceFields = itemTypes.forceField;

        items.weapons = itemTypes.weapon;
        items.weaponMods = itemTypes.weaponModification;
        items.ammunitions = itemTypes.ammunition;
        this._sortItemLists(items);

        return items;
    }

    _sortItemLists(items) {
        for (let list in items) {
            if (Array.isArray(items[list])) items[list] = items[list].sort((a, b) => a.sort - b.sort);
            else if (typeof items[list] == "object") _sortItemLists(items[list]);
        }
    }
}
