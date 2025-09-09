import { DarkHeresySheet } from "./actor.js";

export class NpcSheet extends DarkHeresySheet {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "actor"],
            template: "systems/dark-heresy/template/sheet/actor/npc.hbs",
            width: 700,
            height: 881,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        if (this.actor.isOwner) {
            buttons = [].concat(buttons);
        }
        return buttons;
    }

    getData() {
        const data = super.getData();
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);
        const element = html[0] ?? html;
        element.querySelectorAll(".item-cost").forEach(el => el.addEventListener("focusout", async ev => { await this._onItemCostFocusOut(ev); }));
        element.querySelectorAll(".item-starter").forEach(el => el.addEventListener("click", async ev => { await this._onItemStarterClick(ev); }));
    }

    async _onItemCostFocusOut(event) {
        event.preventDefault();
        const div = event.currentTarget.closest(".item");
        let item = this.actor.items.get(div.dataset.itemId);
        item.update({"system.cost": event.currentTarget.value});
    }

    async _onItemStarterClick(event) {
        event.preventDefault();
        const div = event.currentTarget.closest(".item");
        let item = this.actor.items.get(div.dataset.itemId);
        item.update({"system.starter": event.currentTarget.checked});
    }
}
