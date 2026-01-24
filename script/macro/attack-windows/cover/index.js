import {
    COVER_LEVELS,
    applyCoverValues,
    buildCharacteristicLookup,
    ensureCoverItem,
    resolveActorContext
} from "../common.js";

const LOCATION_LABELS = Object.freeze({
    head: "Head",
    leftArm: "Left Arm",
    rightArm: "Right Arm",
    body: "Torso",
    leftLeg: "Left Leg",
    rightLeg: "Right Leg"
});

/**
 *
 * @param defaultLevel
 */
function buildLevelOptions(defaultLevel) {
    return COVER_LEVELS
        .map((value, index) => `<option value="${index}" ${value === defaultLevel ? "selected" : ""}>${value}</option>`)
        .join("");
}

/**
 *
 * @param defaultValue
 */
function buildLocationFields(defaultValue) {
    return Object.entries(LOCATION_LABELS)
        .map(([key, label]) => `
        <div class="form-group">
            <label>${label}</label>
            <input type="number" name="loc-${key}" value="${defaultValue}" />
            <label><input type="checkbox" name="use-${key}" checked /> Apply</label>
        </div>`)
        .join("");
}

/**
 *
 * @param actor
 * @param defaultLevel
 */
function buildDialogContent(actor, defaultLevel) {
    const levelOptions = buildLevelOptions(defaultLevel);
    const locationFields = buildLocationFields(defaultLevel);
    const stats = buildCharacteristicLookup(actor);
    return `
    <form class="dh-cover-window">
        <div class="form-group">
            <label>Actor</label>
            <div>${actor.name}</div>
        </div>
        <div class="form-group">
            <label>Cover Level</label>
            <select name="coverLevel">${levelOptions}</select>
        </div>
        <div class="form-group">
            <label>Base Armour Value</label>
            <input type="number" name="baseValue" value="${defaultLevel}" />
        </div>
        <fieldset>
            <legend>Locations</legend>
            ${locationFields}
        </fieldset>
        <p class="notes">Cover defaults to legs + torso. Adjust locations as needed. Cover will degrade by one level when penetrated.</p>
        <p class="notes">Stats: WP ${stats.willpower.total} • Fel ${stats.fellowship.total}</p>
    </form>`;
}

/**
 *
 * @param html
 * @param baseValue
 */
function buildPartValues(html, baseValue) {
    const partValues = {};
    for (const key of Object.keys(LOCATION_LABELS)) {
        const enabled = html.find(`[name='use-${key}']`).is(":checked");
        const value = Number(html.find(`[name='loc-${key}']`).val() || baseValue);
        partValues[key] = enabled ? value : 0;
    }
    return partValues;
}

/**
 *
 * @param partValues
 */
function summarizeParts(partValues) {
    return Object.entries(partValues)
        .map(([key, value]) => `${LOCATION_LABELS[key]} ${value}`)
        .join(" • ");
}

/**
 *
 * @param actor
 * @param partValues
 * @param levelValue
 */
async function sendCoverToChat(actor, partValues, levelValue) {
    const summary = summarizeParts(partValues);
    const content = `
    <div class="dh-cover-card">
        <div><strong>${actor.name}</strong> applies cover.</div>
        <div>Level: ${levelValue}</div>
        <div>${summary}</div>
        <div class="notes">Cover loses one level when penetrated.</div>
    </div>`;

    await ChatMessage.create({
        content,
        speaker: ChatMessage.getSpeaker({ actor })
    });
}

/**
 *
 */
export async function runApplyCoverDialog() {
    const { actor } = resolveActorContext();
    if (!actor) {
        ui.notifications.warn("No actor available for cover.");
        return;
    }

    const defaultLevel = COVER_LEVELS[1];
    await ensureCoverItem(actor);

    const result = await new Promise(resolve => {
        const content = buildDialogContent(actor, defaultLevel);
        new Dialog({
            title: "Apply Cover",
            content,
            buttons: {
                apply: {
                    label: "Apply Cover",
                    callback: html => {
                        const levelIndex = Number(html.find("[name='coverLevel']").val() || 0);
                        const baseValue = Number(html.find("[name='baseValue']").val() || COVER_LEVELS[levelIndex] || 0);
                        const partValues = buildPartValues(html, baseValue);
                        resolve({ levelIndex, baseValue, partValues });
                    }
                },
                cancel: {
                    label: "Cancel",
                    callback: () => resolve(null)
                }
            },
            default: "apply"
        }).render(true);
    });

    if (!result) return;

    const levelValue = COVER_LEVELS[result.levelIndex] ?? result.baseValue;
    await applyCoverValues(actor, result.partValues, result.levelIndex);
    await sendCoverToChat(actor, result.partValues, levelValue);
}
