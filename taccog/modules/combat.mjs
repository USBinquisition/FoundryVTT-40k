import { calculateDegrees } from "./dice.mjs";

const RANGE_BANDS = [
  { label: "Point Blank", max: 3, mod: 30 },
  { label: "Short", max: 10, mod: 10 },
  { label: "Standard", max: 30, mod: 0 },
  { label: "Long", max: 60, mod: -10 },
  { label: "Extreme", max: 120, mod: -30 }
];

export class TacCogCombat {
  static initiateAttack(attacker, weapon, targetOverride = null) {
    const target = targetOverride ?? getPrimaryTarget();
    if (!attacker || !weapon || !target) {
      ui.notifications.warn("Select an attacker, weapon, and target before attacking.");
      return;
    }

    const distance = measureDistance(attacker, target);
    const rangeInfo = getRangeInfo(distance);
    const targetStateMod = getTargetStateModifier(target);
    const attackerStateMod = getAttackerStateModifier(attacker);

    const dialogContent = `
      <form class="taccog-attack-dialog">
        <header>
          <h2>${weapon.name} vs ${target.name}</h2>
          <p>Distance: ${distance.toFixed(1)}m (${rangeInfo.label})</p>
        </header>
        <section>
          <div class="form-group">
            <label>Range Modifier</label>
            <input type="number" name="rangeMod" value="${rangeInfo.mod}" readonly />
          </div>
          <div class="form-group">
            <label>Target State</label>
            <input type="number" name="targetMod" value="${targetStateMod}" readonly />
          </div>
          <div class="form-group">
            <label>Attacker State</label>
            <input type="number" name="attackerMod" value="${attackerStateMod}" readonly />
          </div>
          <div class="form-group">
            <label>Aim Action</label>
            <div class="form-fields">
              <label><input type="radio" name="aim" value="0" checked /> None</label>
              <label><input type="radio" name="aim" value="10" /> Half (+10)</label>
              <label><input type="radio" name="aim" value="20" /> Full (+20)</label>
            </div>
          </div>
          <div class="form-group">
            <label>Fire Mode</label>
            <select name="fireMode">
              <option value="single">Single</option>
              <option value="semi">Semi</option>
              <option value="full">Full</option>
            </select>
          </div>
          <div class="form-group">
            <label>Attack Type</label>
            <select name="attackType">
              <option value="standard">Standard</option>
              <option value="called">Called Shot</option>
              <option value="suppressing">Suppressing Fire</option>
            </select>
          </div>
          <div class="form-group">
            <label>Called Shot Location</label>
            <select name="calledLocation" disabled>
              <option value="head">Head</option>
              <option value="body" selected>Body</option>
              <option value="arms">Arms</option>
              <option value="legs">Legs</option>
            </select>
          </div>
          <div class="form-group">
            <label><input type="checkbox" name="allOut" /> All Out Attack (+20 WS, no Dodge)</label>
          </div>
        </section>
      </form>
    `;

    new Dialog({
      title: "TacCog Attack",
      content: dialogContent,
      buttons: {
        roll: {
          label: "Roll",
          callback: (html) => executeAttack(attacker, weapon, target, html)
        },
        cancel: { label: "Cancel" }
      },
      default: "roll"
    }).render(true);
  }

  static autoShootNearest(attacker, weapon) {
    const target = getNearestEnemy(attacker);
    if (target) TacCogCombat.initiateAttack(attacker, weapon, target);
    return target;
  }

  static autoMeleeNearest(attacker, weapon) {
    const target = getNearestEnemy(attacker);
    if (!target) return null;
    const distance = measureDistance(attacker, target);
    if (distance <= getMeleeReach(attacker)) {
      TacCogCombat.initiateAttack(attacker, weapon, target);
      return target;
    }
    return null;
  }

  static autoCharge(attacker, weapon) {
    const target = getNearestEnemy(attacker);
    if (!target) return null;
    const distance = measureDistance(attacker, target);
    if (distance <= getChargeDistance(attacker)) {
      TacCogCombat.initiateAttack(attacker, weapon, target);
      return target;
    }
    ui.notifications.info("Target out of charge range.");
    return null;
  }
}

function executeAttack(attacker, weapon, target, html) {
  const form = html[0].querySelector("form");
  const data = new FormData(form);
  const rangeMod = Number(data.get("rangeMod")) || 0;
  const targetMod = Number(data.get("targetMod")) || 0;
  const attackerMod = Number(data.get("attackerMod")) || 0;
  const aimMod = Number(data.get("aim")) || 0;
  const fireMode = data.get("fireMode") || "single";
  const attackType = data.get("attackType") || "standard";
  const calledLocation = data.get("calledLocation") || "body";
  const allOut = data.get("allOut") === "on";

  const attackTypeMod = attackType === "called" ? -20 : 0;
  const allOutMod = allOut ? 20 : 0;

  const totalMod = rangeMod + targetMod + attackerMod + aimMod + attackTypeMod + allOutMod;
  const baseCharacteristic = weapon.system?.attack_type === "melee" ? "ws" : "bs";
  const baseValue = attacker.system?.stats?.[baseCharacteristic]?.base ?? 30;
  const targetNumber = baseValue + totalMod;

  const roll = new Roll("1d100").roll({ async: false });
  const degrees = calculateDegrees(targetNumber, roll.total);

  const hits = getHitsFromFireMode(fireMode, degrees);

  roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    flavor: `Attack (${weapon.name}) vs ${target.name}`,
    content: `Target: ${targetNumber} | Roll: ${roll.total} | DoS: ${Math.abs(degrees)} | Hits: ${hits} | Called: ${calledLocation}`
  });
}

function getHitsFromFireMode(mode, degrees) {
  if (degrees <= 0) return 0;
  if (mode === "single") return 1;
  if (mode === "semi") return 1 + Math.floor(degrees / 2);
  return 1 + degrees;
}

function getRangeInfo(distance) {
  return RANGE_BANDS.find((band) => distance <= band.max) ?? RANGE_BANDS[RANGE_BANDS.length - 1];
}

function getPrimaryTarget() {
  const targets = Array.from(game.user?.targets ?? []);
  return targets[0]?.actor ?? null;
}

function measureDistance(attacker, target) {
  const attackerToken = attacker.getActiveTokens()[0];
  const targetToken = target.getActiveTokens()[0];
  if (!attackerToken || !targetToken) return 0;
  return canvas?.grid?.measureDistance(attackerToken, targetToken) ?? 0;
}

function getTargetStateModifier(target) {
  const effects = target?.effects?.map((effect) => effect.label.toLowerCase()) ?? [];
  let mod = 0;
  if (effects.some((label) => label.includes("prone"))) mod += 10;
  if (effects.some((label) => label.includes("stunned"))) mod += 10;
  return mod;
}

function getAttackerStateModifier(attacker) {
  const effects = attacker?.effects?.map((effect) => effect.label.toLowerCase()) ?? [];
  let mod = 0;
  if (effects.some((label) => label.includes("blinded"))) mod -= 30;
  if (effects.some((label) => label.includes("stunned"))) mod -= 20;
  return mod;
}

function getNearestEnemy(attacker) {
  const attackerToken = attacker.getActiveTokens()[0];
  if (!attackerToken) return null;
  const tokens = canvas?.tokens?.placeables ?? [];
  const enemies = tokens.filter((token) => token.actor && token.document.disposition === -1);
  let closest = null;
  let minDistance = Number.POSITIVE_INFINITY;
  for (const token of enemies) {
    const distance = canvas?.grid?.measureDistance(attackerToken, token) ?? 0;
    if (distance < minDistance) {
      minDistance = distance;
      closest = token.actor;
    }
  }
  return closest;
}

function getMeleeReach(actor) {
  return actor.system?.combat?.meleeReach ?? 1;
}

function getChargeDistance(actor) {
  const base = actor.system?.movement?.charge ?? 6;
  const bonus = actor.items?.find((item) => item.name === "Furious Charge") ? 3 : 0;
  return base + bonus;
}

export function getRunDistance(actor) {
  const base = actor.system?.movement?.run ?? 12;
  const bonus = actor.items?.find((item) => item.name === "Sprint") ? 3 : 0;
  return base + bonus;
}
