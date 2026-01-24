import { buildMacroOwnership, ensureDenyTheWitchTalent, resolveActorContext } from "./common.js";
import { createAttackMacroConfig, runAttackWindow } from "./dialogs/attack-dialog.js";
import { runDefendDialog } from "./dialogs/defend-dialog.js";
import { runPowerAttackDialog } from "./dialogs/power-attack-dialog.js";
import { runSpecialAttackDialog } from "./special-attacks/index.js";
import { runApplyCoverDialog } from "./cover/index.js";

const ROOT_FOLDER = "DH2e Automation";
const FOLDER_MAP = Object.freeze({
    ranged: "Ranged Attacking",
    melee: "Melee Attacking",
    defend: "Defending",
    psychic: "Psychic Attack",
    navigator: "Navigator Attack",
    special: "Other Special Attack",
    cover: "Apply Cover"
});

const MACRO_DEFINITIONS = Object.freeze([
    {
        key: "ranged",
        name: "Ranged Attacking",
        command: "game.darkHeresy.macros.attackWindows.rangedAttack();"
    },
    {
        key: "melee",
        name: "Melee Attacking",
        command: "game.darkHeresy.macros.attackWindows.meleeAttack();"
    },
    {
        key: "defend",
        name: "Defending",
        command: "game.darkHeresy.macros.attackWindows.defend();"
    },
    {
        key: "psychic",
        name: "Psychic Attack",
        command: "game.darkHeresy.macros.attackWindows.psychicAttack();"
    },
    {
        key: "navigator",
        name: "Navigator Attack",
        command: "game.darkHeresy.macros.attackWindows.navigatorAttack();"
    },
    {
        key: "special",
        name: "Other Special Attack",
        command: "game.darkHeresy.macros.attackWindows.specialAttack();"
    },
    {
        key: "cover",
        name: "Apply Cover",
        command: "game.darkHeresy.macros.attackWindows.applyCover();"
    }
]);

/**
 *
 * @param key
 */
function getFolderPath(key) {
    return [ROOT_FOLDER, FOLDER_MAP[key]].filter(Boolean);
}

/**
 *
 * @param pathParts
 */
async function ensureFolderPath(pathParts) {
    let parentId = null;
    for (const name of pathParts) {
        const currentParentId = parentId;
        let folder = game.folders.find(entry => entry.type === "Macro" && entry.name === name && entry.folder?.id === currentParentId);
        if (!folder) {
            folder = await Folder.create({
                name,
                type: "Macro",
                folder: currentParentId,
                ownership: buildMacroOwnership()
            });
        }
        parentId = folder.id;
    }
    return parentId;
}

/**
 *
 * @param definition
 */
async function ensureMacro(definition) {
    const folderId = await ensureFolderPath(getFolderPath(definition.key));
    let macro = game.macros.find(entry => entry.name === definition.name && entry.command === definition.command);
    const ownership = buildMacroOwnership();

    if (!macro) {
        macro = await Macro.create({
            name: definition.name,
            type: "script",
            img: "icons/skills/ranged/target-bullseye-arrow-glowing.webp",
            command: definition.command,
            folder: folderId,
            ownership
        }, { displaySheet: false });
        return macro;
    }

    const updates = {};
    if (macro.folder?.id !== folderId) updates.folder = folderId;
    updates.ownership = ownership;
    if (Object.keys(updates).length) {
        await macro.update(updates);
    }
    return macro;
}

/**
 *
 * @param mode
 */
function getWeaponsByMode(mode) {
    const { actor } = resolveActorContext();
    if (!actor) return [];
    const weapons = actor.items.filter(item => item.type === "weapon");
    if (mode === "melee") {
        return weapons.filter(item => ["melee", "pistol"].includes(item.system?.class ?? item.class));
    }
    if (mode === "ranged") {
        return weapons.filter(item => (item.system?.class ?? item.class) !== "melee");
    }
    return weapons;
}

/**
 *
 * @param mode
 */
async function runAttack(mode) {
    const weapons = getWeaponsByMode(mode);
    const config = createAttackMacroConfig({ mode, weapons });
    await runAttackWindow(config);
}

/**
 *
 */
export function registerAttackWindows() {
    if (!game.darkHeresy.macros) game.darkHeresy.macros = {};

    game.darkHeresy.macros.attackWindows = {
        rangedAttack: () => runAttack("ranged"),
        meleeAttack: () => runAttack("melee"),
        defend: () => runDefendDialog(),
        psychicAttack: () => runPowerAttackDialog({ navigator: false }),
        navigatorAttack: () => runPowerAttackDialog({ navigator: true }),
        specialAttack: () => runSpecialAttackDialog(),
        applyCover: () => runApplyCoverDialog()
    };

    if (!game.macro) game.macro = {};
    game.macro.attackWindows = game.darkHeresy.macros.attackWindows;
}

/**
 *
 */
async function ensureMacrosReady() {
    if (!game.user.isGM) return;
    await ensureDenyTheWitchTalent();
    for (const definition of MACRO_DEFINITIONS) {
        await ensureMacro(definition);
    }
}

Hooks.once("ready", () => {
    ensureMacrosReady();
});
