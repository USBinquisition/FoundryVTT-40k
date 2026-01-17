export const APTITUDES = [
  "General",
  "Weapon Skill",
  "Ballistic Skill",
  "Strength",
  "Toughness",
  "Agility",
  "Intelligence",
  "Perception",
  "Willpower",
  "Fellowship",
  "Offence",
  "Defence",
  "Finesse",
  "Tech",
  "Psyker",
  "Fieldcraft",
  "Leadership",
  "Social"
];

const TALENT_COSTS = {
  1: { 0: 600, 1: 300, 2: 200 },
  2: { 0: 900, 1: 450, 2: 300 },
  3: { 0: 1200, 1: 600, 2: 400 }
};

const SKILL_BASE_COSTS = { 0: 600, 1: 300, 2: 100 };

export function calculateCost(item, actorAptitudes = []) {
  const itemAptitudes = Array.isArray(item.system?.aptitudes)
    ? item.system.aptitudes.filter(Boolean)
    : [];
  const matchCount = itemAptitudes.filter((aptitude) => actorAptitudes.includes(aptitude)).length;

  if (item.type === "talent") {
    const tier = Math.clamped(item.system?.tier ?? 1, 1, 3);
    const tierCosts = TALENT_COSTS[tier];
    return tierCosts[Math.min(matchCount, 2)];
  }

  if (item.type === "skill") {
    const rank = Math.max(item.system?.rank ?? 0, 0);
    if (rank === 0) return 0;
    const multiplier = 1 + (rank - 1) * 0.5;
    const base = SKILL_BASE_COSTS[Math.min(matchCount, 2)];
    return Math.round((base * multiplier) / 50) * 50;
  }

  return 0;
}

export function updateActorXP(actor) {
  const actorAptitudes = Array.isArray(actor.system?.aptitudes) ? actor.system.aptitudes : [];
  const items = actor.items?.contents ?? [];
  const spent = items.reduce((total, item) => total + calculateCost(item, actorAptitudes), 0);
  const total = actor.system?.xp?.total ?? 0;
  const available = Math.max(total - spent, 0);

  actor.update({
    "system.xp.spent": spent,
    "system.xp.available": available
  });
}

export function calculateXP(actor) {
  updateActorXP(actor);
}
