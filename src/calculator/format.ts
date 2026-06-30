import { R, type Rational } from './rational';

export function formatRate(rate: Rational): string {
  const n = rate.toNumber();
  if (n === 0) return '0';
  if (n >= 100) return n.toFixed(1);
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

/** Load fraction 0…1 → display percent (capped 0–100). */
export function formatLoadPercent(fraction: Rational): string {
  const pct = Math.min(
    100,
    Math.max(0, fraction.mul(R.from(100)).toNumber()),
  );
  if (pct >= 99.95) return '100%';
  if (pct <= 0.05) return '0%';
  return `${Math.round(pct)}%`;
}
