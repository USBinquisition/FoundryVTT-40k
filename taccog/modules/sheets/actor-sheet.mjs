import { rollTest } from "../dice.mjs";
import { calculateCost } from "../progression.mjs";

const STAT_ORDER = ["ws", "bs", "s", "t", "ag", "int", "per", "wp", "fel"];

export class TacCogActorSheet extends ActorSheet {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["taccog", "sheet", "actor"],
      width: 780,
      height: 680,
      resizable: true,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "summary" }]
    });
  }

  get template() {
    return "systems/taccog/templates/actor-sheet.hbs";
  }

  getData() {
    const data = super.getData();
    const skills = this._prepareSkills(data.actor.items);
    data.system = data.actor.system;
    data.stats = this._prepareStats(data.system?.stats ?? {});
    data.skills = skills;
    data.xp = data.system?.xp ?? { total: 0, spent: 0, available: 0 };
    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find(".taccog-stat-roll").on("click", (event) => {
      event.preventDefault();
      const statKey = event.currentTarget.dataset.stat;
      const stat = this.actor.system?.stats?.[statKey];
      if (!stat) return;
      const target = (stat.base ?? 0) + (stat.advance ?? 0);
      rollTest({ label: stat.label ?? statKey.toUpperCase(), target });
    });
  }

  _prepareStats(stats) {
    const orderedKeys = STAT_ORDER.filter((key) => stats[key]).concat(
      Object.keys(stats).filter((key) => !STAT_ORDER.includes(key))
    );
    return orderedKeys.map((key) => {
      const entry = stats[key] ?? {};
      const base = entry.base ?? 0;
      const advance = entry.advance ?? 0;
      return {
        key,
        label: entry.label ?? key.toUpperCase(),
        short: entry.short ?? key.toUpperCase(),
        base,
        advance,
        total: base + advance
      };
    });
  }

  _prepareSkills(items) {
    const skillItems = items.filter((item) => item.type === "skill");
    const hasPolymath = items.some((item) => item.type === "talent" && item.name === "Polymath");

    const categorized = {
      basic: [],
      trained: [],
      specialist: []
    };

    for (const skill of skillItems) {
      const isSpecialist = skill.system?.is_specialist;
      const rank = skill.system?.rank ?? 0;
      const entry = {
        item: skill,
        rank,
        cost: calculateCost(skill, this.actor.system?.aptitudes ?? [])
      };

      if (isSpecialist) {
        categorized.specialist.push(entry);
      } else if (rank > 0) {
        categorized.trained.push(entry);
      } else {
        categorized.basic.push(entry);
      }
    }

    if (hasPolymath) {
      categorized.basic = categorized.basic.map((entry) => {
        if (entry.item.name?.toLowerCase().includes("common lore")) {
          return { ...entry, polymath: true };
        }
        return entry;
      });
    }

    return categorized;
  }
}
