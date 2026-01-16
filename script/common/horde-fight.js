const DEFAULT_HORDE_STATE = {
    active: false,
    stage: "inactive",
    hordeTemplateId: null,
    selections: {},
    initiatedAt: null,
    startedBy: null
};

export class HordeFightManager {
    static app = null;

    static initialize() {
        game.settings.register("dark-heresy", "hordeFightState", {
            name: "Horde Fight State",
            hint: "Tracks the active horde fight selection flow.",
            scope: "world",
            config: false,
            type: Object,
            default: DEFAULT_HORDE_STATE,
            onChange: state => {
                HordeFightManager._handleStateChange(state);
            }
        });

        Hooks.once("ready", () => {
            const state = HordeFightManager.state;
            if (state?.active) {
                HordeFightManager.open();
            }
        });
    }

    static get state() {
        return game.settings.get("dark-heresy", "hordeFightState");
    }

    static async setState(state) {
        await game.settings.set("dark-heresy", "hordeFightState", state);
    }

    static async updateState(patch) {
        const nextState = foundry.utils.mergeObject(
            foundry.utils.duplicate(HordeFightManager.state),
            patch,
            { inplace: false, insertKeys: true, overwrite: true }
        );
        await HordeFightManager.setState(nextState);
    }

    static async startFight() {
        if (!game.user.isGM) {
            ui.notifications.warn(game.i18n.localize("HORDE_FIGHT.ONLY_GM"));
            return;
        }
        await HordeFightManager.setState({
            ...foundry.utils.duplicate(DEFAULT_HORDE_STATE),
            active: true,
            stage: "gathering",
            startedBy: game.user.id
        });
        HordeFightManager.open();
    }

    static open() {
        if (!HordeFightManager.app) {
            HordeFightManager.app = new HordeFightApp();
        }
        HordeFightManager.app.render(true);
    }

    static close() {
        if (HordeFightManager.app) {
            HordeFightManager.app.close();
        }
    }

    static _handleStateChange(state) {
        if (state?.active) {
            HordeFightManager.open();
            HordeFightManager.app?.render();
        } else {
            HordeFightManager.close();
        }
    }
}

class HordeFightApp extends Application {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "dark-heresy-horde-fight",
            template: "systems/dark-heresy/template/dialog/horde-fight.hbs",
            classes: ["dark-heresy", "horde-fight-app"],
            popOut: false
        });
    }

    getData() {
        const state = HordeFightManager.state ?? DEFAULT_HORDE_STATE;
        const selection = state.selections?.[game.user.id] ?? { actorIds: [], confirmed: false };
        const ownedActors = game.actors
            .filter(actor => actor.isOwner && actor.type !== "npc")
            .sort((a, b) => a.name.localeCompare(b.name));
        const hordeTemplates = game.actors
            .filter(actor => actor.type === "npc")
            .sort((a, b) => a.name.localeCompare(b.name));
        const playerUsers = game.users.filter(user => !user.isGM);
        const participants = playerUsers.map(user => {
            const entry = state.selections?.[user.id] ?? { actorIds: [], confirmed: false };
            return {
                id: user.id,
                name: user.name,
                confirmed: entry.confirmed,
                actors: (entry.actorIds || [])
                    .map(actorId => game.actors.get(actorId))
                    .filter(Boolean)
                    .map(actor => ({ id: actor.id, name: actor.name, img: actor.img }))
            };
        });
        const hordeTemplate = state.hordeTemplateId ? game.actors.get(state.hordeTemplateId) : null;
        const hasSelections = participants.some(participant => participant.actors.length > 0);
        const everyoneReady = participants.length > 0 && participants.every(participant => participant.confirmed);
        const isReadyToStart = Boolean(state.hordeTemplateId) && hasSelections && everyoneReady;
        return {
            state,
            isGM: game.user.isGM,
            ownedActors,
            hordeTemplates,
            participants,
            hordeTemplate,
            selectedActorIds: selection.actorIds ?? [],
            selectionConfirmed: selection.confirmed ?? false,
            isGathering: state.stage === "gathering",
            isConfirmed: state.stage === "confirmed",
            isReadyToStart
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find(".horde-refresh").on("click", () => this.render());
        html.find(".horde-actor-confirm").on("click", async () => {
            const actorIds = html
                .find("input.horde-actor-choice:checked")
                .map((index, element) => element.value)
                .get();
            await this._updateSelection(actorIds, true);
        });
        html.find(".horde-actor-clear").on("click", async () => {
            const actorIds = html
                .find("input.horde-actor-choice:checked")
                .map((index, element) => element.value)
                .get();
            await this._updateSelection(actorIds, false);
        });
        html.find(".horde-template-select").on("change", async event => {
            if (!game.user.isGM) {
                return;
            }
            await HordeFightManager.updateState({ hordeTemplateId: event.currentTarget.value || null });
        });
        html.find(".horde-initiate").on("click", async () => {
            if (!game.user.isGM) {
                return;
            }
            await this._initiateFight();
        });
        html.find(".horde-dismiss").on("click", async () => {
            if (!game.user.isGM) {
                return;
            }
            await HordeFightManager.setState(foundry.utils.duplicate(DEFAULT_HORDE_STATE));
        });
        html.find(".horde-open-actor").on("click", event => {
            const actorId = event.currentTarget.dataset.actorId;
            const actor = game.actors.get(actorId);
            if (actor) {
                actor.sheet.render(true);
            }
        });
    }

    async _updateSelection(actorIds, confirmed) {
        if (!HordeFightManager.state?.active) {
            ui.notifications.warn(game.i18n.localize("HORDE_FIGHT.NOT_ACTIVE"));
            return;
        }
        const selections = foundry.utils.duplicate(HordeFightManager.state.selections ?? {});
        selections[game.user.id] = {
            actorIds,
            confirmed,
            name: game.user.name
        };
        await HordeFightManager.updateState({ selections });
    }

    async _initiateFight() {
        const state = HordeFightManager.state ?? DEFAULT_HORDE_STATE;
        if (!state.active) {
            ui.notifications.warn(game.i18n.localize("HORDE_FIGHT.NOT_ACTIVE"));
            return;
        }
        await HordeFightManager.updateState({
            stage: "confirmed",
            initiatedAt: Date.now()
        });
        ui.notifications.info(game.i18n.localize("HORDE_FIGHT.CONFIRMED"));
    }
}
