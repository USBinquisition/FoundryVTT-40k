export function rollTest({ label = "Test", target = 0, modifier = 0 } = {}) {
  const finalTarget = target + modifier;
  const roll = new Roll("1d100").roll({ async: false });
  const degrees = Math.floor((finalTarget - roll.total) / 10);

  roll.toMessage({
    flavor: `${label} (Target ${finalTarget})`,
    content: `Result: ${roll.total} | Degrees: ${degrees}`
  });

  return { roll, degrees, target: finalTarget };
}
