export function adjustByWheel(
  value: number,
  deltaY: number,
  step: number,
  min: number,
): number {
  const delta = deltaY < 0 ? step : -step;
  const next = value + delta;
  const rounded =
    step >= 1
      ? Math.round(next)
      : Math.round(next / step) * step;
  return Math.max(min, Number(rounded.toFixed(step < 1 ? 1 : 0)));
}
