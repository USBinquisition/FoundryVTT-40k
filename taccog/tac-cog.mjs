import { TacCogActorSheet } from "./modules/sheets/actor-sheet.mjs";
import { registerStatusEffects } from "./modules/effects.mjs";
import { calculateXP } from "./modules/progression.mjs";
import * as importer from "./modules/importer.mjs";
import * as dice from "./modules/dice.mjs";
import * as combat from "./modules/combat.mjs";
import * as factions from "./modules/factions.mjs";

const THEME_SETTING = "themeProfile";

Hooks.once("init", () => {
  game.taccog = {
    importer,
    dice,
    combat,
    factions,
    effects: { registerStatusEffects },
    progression: { calculateXP }
  };

  game.settings.register("taccog", THEME_SETTING, {
    name: "TacCog Theme",
    hint: "Select the UI theme profile used across all TacCog sheets.",
    scope: "client",
    config: true,
    type: String,
    choices: {
      cogsteel: "Cogsteel",
      voidglass: "Voidglass",
      parchment: "Parchment",
      nightops: "Night Ops"
    },
    default: "cogsteel",
    onChange: (value) => applyTheme(value)
  });

  Actors.registerSheet("taccog", TacCogActorSheet, {
    types: ["operative", "troop", "ship"],
    makeDefault: true,
    label: "TacCog Actor Sheet"
  });

  registerStatusEffects();
});

Hooks.once("ready", () => {
  applyTheme(game.settings.get("taccog", THEME_SETTING));
});

Hooks.on("preCreateItem", (item, data) => {
  if (!["skill", "talent"].includes(item.type)) return;
  const aptitudes = item.system?.aptitudes ?? ["", ""];
  if (aptitudes[0] && aptitudes[1]) return;
  const autoAptitudes = getDefaultAptitudes(item.name);
  if (autoAptitudes) {
    item.updateSource({ system: { aptitudes: autoAptitudes } });
  }
});

Hooks.on("updateActor", (actor) => {
  if (!actor?.system?.xp) return;
  calculateXP(actor);
});

function applyTheme(value) {
  document.body?.setAttribute("data-taccog-theme", value);
}

function getDefaultAptitudes(name = "") {
  const normalized = name.toLowerCase().trim();
  const mapping = {
    "dodge": ["Agility", "Defence"],
    "parry": ["Weapon Skill", "Defence"],
    "awareness": ["Perception", "Fieldcraft"],
    "command": ["Fellowship", "Leadership"],
    "strong mind": ["Willpower", "Psyker"]
  };
  return mapping[normalized] ?? null;
}
