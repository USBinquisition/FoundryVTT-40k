import { DarkHeresyItemSheet } from "./item.js";

export class CyberneticSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "cybernetic"],
            template: "systems/dark-heresy/template/sheet/cybernetic.hbs",
            width: Math.min(window.innerWidth * 0.4, 600),
            height: Math.min(window.innerHeight * 0.6, 700),
            resizable: true,
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
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}
