const STATUS_ICONS = {
  fatigue: "icons/svg/poison.svg",
  stunned: "icons/svg/daze.svg",
  prone: "icons/svg/falling.svg",
  blinded: "icons/svg/blind.svg",
  bleeding: "icons/svg/blood.svg",
  fear: "icons/svg/terror.svg"
};

export function registerStatusEffects() {
  const statusEffects = Object.entries(STATUS_ICONS).map(([id, icon]) => ({
    id,
    label: `TACCOG.Status.${id}`,
    icon
  }));

  CONFIG.statusEffects = [...CONFIG.statusEffects, ...statusEffects];
}

export function applyTalentEffect(talentItem) {
  const effects = talentItem.effects?.contents ?? [];
  if (!effects.length) return;
  talentItem.effects.forEach((effect) => effect.apply());
}
