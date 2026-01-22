import { calculateCost } from "../progression.mjs";

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
    data.skills = skills;
    data.xp = data.system?.xp ?? { total: 0, spent: 0, available: 0 };
    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("select[name='attackType']").on("change", (event) => {
      const calledDropdown = html.find("select[name='calledLocation']");
      calledDropdown.prop("disabled", event.target.value !== "called");
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
