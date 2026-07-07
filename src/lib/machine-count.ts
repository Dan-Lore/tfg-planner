/** Non-negative integer machine count (0 = machine disabled, no throughput). */
export function clampMachineCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}
