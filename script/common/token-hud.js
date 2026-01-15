const FACTION_OPTIONS = [
    { value: "", label: "FACTION.NEUTRAL", icon: "fa-regular fa-circle" },
    { value: "friendly", label: "FACTION.FRIENDLY", icon: "fa-solid fa-handshake" },
    { value: "enemy", label: "FACTION.ENEMY", icon: "fa-solid fa-skull" }
];

function getFactionClass(value) {
    if (value === "friendly") return "friendly";
    if (value === "enemy") return "enemy";
    return "neutral";
}

export function registerFactionTokenHud() {
    Hooks.on("renderTokenHUD", (app, html) => {
        const token = app.object;
        const actor = token?.actor;
        if (!actor || !["npc", "acolyte"].includes(actor.type)) return;
        if (!actor.isOwner) return;

        const currentFaction = actor.system?.faction ?? "";
        const column = html.find(".col.right");
        if (!column.length) return;

        FACTION_OPTIONS.forEach(option => {
            const label = game.i18n.localize(option.label);
            const factionClass = getFactionClass(option.value);
            const button = $(`
                <div class="control-icon faction-control faction-${factionClass}" data-faction="${option.value}" title="${label}">
                    <i class="${option.icon}"></i>
                </div>
            `);
            if (option.value === currentFaction) {
                button.addClass("active");
            }
            column.append(button);
        });

        html.find(".faction-control").on("click", async event => {
            event.preventDefault();
            const selected = event.currentTarget.dataset.faction ?? "";
            await actor.update({ "system.faction": selected });
            html.find(".faction-control").removeClass("active");
            $(event.currentTarget).addClass("active");
        });
    });
}
