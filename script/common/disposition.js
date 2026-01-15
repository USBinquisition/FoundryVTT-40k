const DISPOSITION_COLORS = {
    friendly: 0x3cb371,
    neutral: 0x9e9e9e,
    enemy: 0xe74c3c
};

const ACTIVE_DISPOSITION_HIGHLIGHTS = new Set();

const getTokenObject = (tokenLike) => tokenLike?.object ?? tokenLike;

const getActorDisposition = (actor) => actor?.system?.disposition ?? "neutral";

const isTokenVisible = (token) => {
    if (!token) return false;
    if (typeof token.isVisible === "boolean") return token.isVisible;
    return token.visible ?? false;
};

const clearTokenRing = (token) => {
    if (!token?._dhDispositionRing) return;
    const ring = token._dhDispositionRing.graphic;
    if (ring) {
        ring.removeFromParent();
        ring.destroy();
    }
    token._dhDispositionRing = null;
};

const drawTokenRing = (token, disposition) => {
    const color = DISPOSITION_COLORS[disposition] ?? DISPOSITION_COLORS.neutral;
    const ring = new PIXI.Graphics();
    ring.lineStyle(4, color, 0.9);
    const radius = Math.min(token.w, token.h) / 2;
    ring.drawCircle(token.w / 2, token.h / 2, radius);
    ring.eventMode = "none";
    ring.interactive = false;
    ring.zIndex = 10;
    token.sortableChildren = true;
    token.addChild(ring);
    token._dhDispositionRing = { disposition, graphic: ring };
};

const updateTokenDispositionRing = (tokenLike) => {
    const token = getTokenObject(tokenLike);
    if (!token?.actor) {
        clearTokenRing(token);
        return;
    }
    const disposition = getActorDisposition(token.actor);
    if (!ACTIVE_DISPOSITION_HIGHLIGHTS.has(disposition) || !isTokenVisible(token)) {
        clearTokenRing(token);
        return;
    }
    if (token._dhDispositionRing?.disposition === disposition) {
        return;
    }
    clearTokenRing(token);
    drawTokenRing(token, disposition);
};

const applyDispositionHighlights = () => {
    const tokens = canvas?.tokens?.placeables ?? [];
    tokens.forEach(updateTokenDispositionRing);
};

const toggleDispositionHighlight = (disposition, enabled) => {
    if (enabled) {
        ACTIVE_DISPOSITION_HIGHLIGHTS.add(disposition);
    } else {
        ACTIVE_DISPOSITION_HIGHLIGHTS.delete(disposition);
    }
    applyDispositionHighlights();
};

export const registerDispositionControls = () => {
    Hooks.on("getSceneControlButtons", (controls) => {
        const tokenControls = controls.find((control) => control.name === "token");
        if (!tokenControls) return;
        tokenControls.tools.push(
            {
                name: "highlight-friendly",
                title: game.i18n.localize("TOKEN_HIGHLIGHT.FRIENDLY"),
                icon: "fas fa-user-check",
                toggle: true,
                active: ACTIVE_DISPOSITION_HIGHLIGHTS.has("friendly"),
                onClick: (enabled) => toggleDispositionHighlight("friendly", enabled)
            },
            {
                name: "highlight-neutral",
                title: game.i18n.localize("TOKEN_HIGHLIGHT.NEUTRAL"),
                icon: "fas fa-user",
                toggle: true,
                active: ACTIVE_DISPOSITION_HIGHLIGHTS.has("neutral"),
                onClick: (enabled) => toggleDispositionHighlight("neutral", enabled)
            },
            {
                name: "highlight-enemy",
                title: game.i18n.localize("TOKEN_HIGHLIGHT.ENEMY"),
                icon: "fas fa-user-minus",
                toggle: true,
                active: ACTIVE_DISPOSITION_HIGHLIGHTS.has("enemy"),
                onClick: (enabled) => toggleDispositionHighlight("enemy", enabled)
            }
        );
    });

    Hooks.on("canvasReady", () => applyDispositionHighlights());
    Hooks.on("refreshToken", (token) => updateTokenDispositionRing(token));
    Hooks.on("updateActor", (actor, data) => {
        if (!Object.prototype.hasOwnProperty.call(data?.system ?? {}, "disposition")) return;
        const activeTokens = actor.getActiveTokens?.() ?? [];
        if (activeTokens.length) {
            activeTokens.forEach(updateTokenDispositionRing);
        } else {
            applyDispositionHighlights();
        }
    });
};
