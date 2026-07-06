/** Compare id lists as sets (order-independent). */
export function idsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}
