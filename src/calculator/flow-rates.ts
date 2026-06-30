import type { Recipe } from '@/data/types';
import { Rational, R } from '@/calculator/rational';
import { productKey } from '@/lib/ports';
import { chanceRateMultiplier } from '@/lib/flow-chance';
import { effectiveDurationTicks } from '@/calculator/energy';
import { TICKS_PER_SECOND, type SchemeNode } from '@/calculator/flow-solver-types';

export function recipeDurationSec(recipe: Recipe, node: SchemeNode): Rational {
  return R.from(effectiveDurationTicks(recipe, node.voltageTier, node.overclock)).div(
    R.from(TICKS_PER_SECOND),
  );
}

export function perMachineOutputRateAtIndex(
  recipe: Recipe,
  index: number,
  node: SchemeNode,
): Rational {
  const output = recipe.outputs[index];
  if (!output) return R.zero;
  const base = R.from(output.amount).div(recipeDurationSec(recipe, node));
  return base.mul(chanceRateMultiplier(output.chance));
}

export function perMachineOutputRate(
  recipe: Recipe,
  outputKey: string,
  node: SchemeNode,
): Rational {
  const index = recipe.outputs.findIndex((o) => productKey(o) === outputKey);
  if (index < 0) return R.zero;
  return perMachineOutputRateAtIndex(recipe, index, node);
}

export function buildNodePortOutputRates(
  recipe: Recipe,
  node: SchemeNode,
  machineCount: Rational,
): Record<string, Rational> {
  const rates: Record<string, Rational> = {};
  for (let i = 0; i < recipe.outputs.length; i++) {
    rates[`out_${i}`] = perMachineOutputRateAtIndex(recipe, i, node).mul(machineCount);
  }
  return rates;
}

export function sumPortRatesByProduct(
  recipe: Recipe,
  portRates: Record<string, Rational>,
): Record<string, Rational> {
  const totals: Record<string, Rational> = {};
  for (let i = 0; i < recipe.outputs.length; i++) {
    const key = productKey(recipe.outputs[i]!);
    const rate = portRates[`out_${i}`] ?? R.zero;
    totals[key] = (totals[key] ?? R.zero).add(rate);
  }
  return totals;
}
