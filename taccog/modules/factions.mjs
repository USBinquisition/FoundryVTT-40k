const FACTIONS = [
  { id: "inquisition", name: "Inquisition" },
  { id: "guard", name: "Astra Militarum" },
  { id: "navy", name: "Imperial Navy" },
  { id: "mechanicus", name: "Adeptus Mechanicus" }
];

export function listFactions() {
  return FACTIONS.slice();
}

export function getFaction(id) {
  return FACTIONS.find((faction) => faction.id === id) ?? null;
}
