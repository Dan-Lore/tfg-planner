/** Parse user-entered target rate; rejects NaN, non-finite, and non-positive values. */
export function parsePositiveRate(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}
