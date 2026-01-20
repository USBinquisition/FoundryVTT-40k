export function calculateDegrees(target, rollTotal) {
  if (rollTotal <= target) {
    return 1 + Math.floor((target - rollTotal) / 10);
  }
  return -1 - Math.floor((rollTotal - target) / 10);
}

export function rollTest({ label = "Test", target = 0, modifier = 0 } = {}) {
  const finalTarget = target + modifier;
  const roll = new Roll("1d100").roll({ async: false });
  const degrees = calculateDegrees(finalTarget, roll.total);
  const outcome = degrees > 0 ? "Success" : "Failure";

  roll.toMessage({
    flavor: `${label} (Target ${finalTarget})`,
    content: `Result: ${roll.total} | ${outcome} | Degrees: ${Math.abs(degrees)}`
  });

  return { roll, degrees, target: finalTarget };
}
