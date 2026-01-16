# Macro Reference (Foundry VTT + Dark Heresy)

This document is a quick reference for building Foundry VTT macros for the Dark Heresy system. It is intended for humans **and** for AI agents generating macros on demand.

## Macro Basics

- **Macro type**: `Script` (JavaScript).
- **Execution context**: the macro runs with access to `game`, `canvas`, `ui`, `ChatMessage`, `Roll`, and system data.
- **Common pattern**: resolve speaker → validate token/actor → prompt for inputs → roll → post chat → apply effects.

## Actor & Token Resolution

```js
const speaker = ChatMessage.getSpeaker();
const actor = speaker.token
  ? canvas.tokens?.get(speaker.token)?.actor
  : game.actors?.get(speaker.actor);
const token = canvas.tokens?.controlled?.[0]
  ?? (speaker.token ? canvas.tokens?.get(speaker.token) : null);
```

- Prefer controlled token when present.
- Provide a warning if no token/actor is available.

## Targeting

```js
const targets = Array.from(game.user?.targets ?? []);
const targetToken = targets[0] ?? null;
```

**UX note:** If no target is selected, show a hint like `press T while hovering target to select`.

## Line of Effect / Walls

Foundry API differs across versions. Use a fallback approach:

```js
const isWallBlocking = (origin, target) => {
  const walls = canvas.walls;
  if (!walls || !origin || !target) return false;
  const ray = new Ray(origin, target);
  if (typeof walls.checkCollision === "function") {
    return walls.checkCollision(ray, { type: "sight", mode: "any" });
  }
  if (typeof walls.testCollision === "function") {
    return walls.testCollision(ray, { type: "sight", mode: "any" });
  }
  const backend = CONFIG.Canvas?.polygonBackends?.sight;
  if (backend?.testCollision) {
    return backend.testCollision(ray.A, ray.B, { type: "sight", mode: "any" });
  }
  return false;
};
```

## Measuring Distance

```js
const distance = canvas.grid?.measureDistance(origin, target) ?? Infinity;
```

## Degrees of Success / Failure

```js
const computeDegrees = (target, rollTotal) => {
  const success = rollTotal <= target;
  if (success) {
    const degree = Math.floor(target / 10) - Math.floor(rollTotal / 10);
    return { success: true, dos: Math.max(1 + degree, 1), dof: 0 };
  }
  const degree = Math.floor(rollTotal / 10) - Math.floor(target / 10);
  return { success: false, dos: 0, dof: Math.max(1 + degree, 1) };
};
```

## Chat Output

```js
await roll.toMessage({
  speaker: ChatMessage.getSpeaker({ actor, token: token?.document }),
  flavor: "Your message here"
});
```

For a summary block:

```js
await ChatMessage.create({
  speaker: ChatMessage.getSpeaker({ actor, token: token?.document }),
  content: `<div class="dh-roll">${lines.map(l => `<p>${l}</p>`).join("")}</div>`
});
```

## Status Effects

To toggle a status effect:

```js
await actor.toggleStatusEffect("prone", { active: true });
```

To apply timed effects, use an ActiveEffect with `duration.rounds`.

## Damage Application (Custom)

If a macro needs to ignore armor but apply TB, or ignore both, apply wounds directly:

```js
const applyRawDamage = async (actor, amount) => {
  const wounds = actor.system.wounds.value;
  const maxWounds = actor.system.wounds.max;
  let critical = actor.system.wounds.critical;
  let newWounds = wounds + amount;
  let newCritical = critical;
  if (newWounds > maxWounds) {
    newCritical += (newWounds - maxWounds);
    newWounds = maxWounds;
  }
  await actor.update({
    "system.wounds.value": newWounds,
    "system.wounds.critical": newCritical
  });
};
```

## Fatigue & Insanity

```js
const applyFatigue = async (actor, levels) => {
  const current = Number(actor.system.fatigue.value ?? 0);
  await actor.update({ "system.fatigue.value": current + levels });
};

const applyInsanity = async (actor, amount) => {
  const current = Number(actor.system.insanity ?? 0);
  await actor.update({ "system.insanity": current + amount });
};
```

## Temporary Visuals (AOE / Cone / Light)

**Measured templates:**

```js
await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [
  { t: "cone", user: game.user.id, x, y, distance: 15, direction: 90, angle: 120 }
]);
```

**Ambient light:**

```js
await canvas.scene.createEmbeddedDocuments("AmbientLight", [
  { x, y, rotation: 90, config: { dim: 15, bright: 15, angle: 120, animation: { type: "radialrainbow" } } }
]);
```

For previews, create them before a dialog and update/remove them when the dialog closes.

## UI Dialogs

```js
new Dialog({
  title: "Title",
  content: "<p>HTML</p>",
  buttons: {
    ok: { label: "OK", callback: html => {} },
    cancel: { label: "Cancel" }
  },
  default: "ok"
}).render(true);
```

Use `render` to wire up custom button handlers inside the HTML if needed.

## AI Macro Authoring Notes

- Always handle **missing tokens/targets** gracefully.
- Provide **clear chat output** for each stage and target.
- Prefer **modular helper functions** inside the macro for clarity.
- Respect Foundry API differences by adding fallbacks for walls/sight checks.
- For macros that produce temporary visuals, ensure cleanup after completion.
