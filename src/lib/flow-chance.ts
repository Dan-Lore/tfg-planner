import type { Flow } from '@/data/types';
import type { Rational } from '@/calculator/rational';
import { R } from '@/calculator/rational';
import { formatRate } from '@/calculator/format';

/** GregTech chanced I/O probability denominator. */
export const GT_CHANCE_BASE = 10_000;

export function isChancedFlow(flow: { chance?: number }): boolean {
  const c = flow.chance;
  return c !== undefined && c > 0 && c < GT_CHANCE_BASE;
}

export function chanceDisplayPercent(chance: number): number {
  return Math.round((chance / GT_CHANCE_BASE) * 100);
}

export function chanceRateMultiplier(chance: number | undefined): Rational {
  if (chance === undefined || chance <= 0 || chance >= GT_CHANCE_BASE) {
    return R.from(1);
  }
  return R.from(chance).div(R.from(GT_CHANCE_BASE));
}

export function formatFlowQuantityLabel(
  flow: Flow,
  itemName: string,
  amount = flow.amount,
): string {
  if (isChancedFlow(flow)) {
    return `${chanceDisplayPercent(flow.chance!)}% × ${amount}× ${itemName}`;
  }
  return `${amount}× ${itemName}`;
}

export function formatFlowRateLabel(rate: Rational, approximate: boolean): string {
  const text = formatRate(rate);
  return approximate ? `~${text}/s` : `${text}/s`;
}
