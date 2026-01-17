function parseCSV(content) {
  const lines = content.trim().split(/\r?\n/);
  const headers = lines.shift().split(",").map((value) => value.trim());
  return lines.map((line) => {
    const values = line.split(",").map((value) => value.trim());
    return headers.reduce((entry, header, index) => {
      entry[header] = values[index] ?? "";
      return entry;
    }, {});
  });
}

export async function importSkillsFromCSV(content) {
  const rows = parseCSV(content);
  return rows.map((row) => ({
    name: row.Name,
    type: "skill",
    system: {
      characteristic: row.Characteristic,
      aptitudes: [row["Aptitude 1"], row["Aptitude 2"]],
      is_specialist: row.Descriptor?.toLowerCase().includes("specialist") ?? false,
      rank: 0
    }
  }));
}

export async function importTalentsFromCSV(content) {
  const rows = parseCSV(content);
  return rows.map((row) => ({
    name: row.Name,
    type: "talent",
    system: {
      tier: Number(row.Tier) || 1,
      aptitudes: [row["Aptitude 1"], row["Aptitude 2"]],
      prerequisites: row.Prereqs,
      description: {
        short: row.Effect,
        long: row.Description
      }
    }
  }));
}

export async function importCharactersFromCSV(content) {
  const rows = parseCSV(content);
  return rows.map((row) => {
    const skills = row.Skills ? row.Skills.split(",").map((skill) => skill.trim()) : [];
    return {
      name: row.Name,
      type: "operative",
      system: {
        faction: row.Faction ?? "",
        subfaction: row.Subfaction ?? ""
      },
      skills
    };
  });
}

export async function createCharactersFromCSV(content) {
  const entries = await importCharactersFromCSV(content);
  const created = [];

  for (const entry of entries) {
    const actor = await Actor.create({
      name: entry.name,
      type: entry.type,
      system: entry.system
    });

    if (entry.skills.length) {
      const skillItems = entry.skills.map((skill) => ({ name: skill, type: "skill", system: {} }));
      await actor.createEmbeddedDocuments("Item", skillItems);
    }

    created.push(actor);
  }

  return created;
}
