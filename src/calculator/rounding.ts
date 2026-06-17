import { Rational, R } from './rational';

/** ceil(ideal), minimum 1 — единственная стратегия проекта */
export function ceilMachineCount(ideal: Rational): number {
  if (ideal.compare(R.zero) <= 0) return 1;
  const n = ideal.num;
  const d = ideal.den;
  const q = n / d;
  const r = n % d;
  const ceil = r === 0n ? q : q + 1n;
  const count = Number(ceil < 1n ? 1n : ceil);
  return count;
}

export function idealMachineCount(
  requiredRatePerSec: Rational,
  perMachineRatePerSec: Rational,
): Rational {
  if (perMachineRatePerSec.compare(R.zero) <= 0) {
    return R.one;
  }
  return requiredRatePerSec.div(perMachineRatePerSec);
}
