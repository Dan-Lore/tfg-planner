import type { Recipe } from '@/data/types';
import type { SchemeNode } from '@/calculator/flow-solver-types';
import { R, type Rational } from '@/calculator/rational';
import { productKey } from '@/lib/ports';

export function primaryOutputIndex(node: SchemeNode, recipe: Recipe): number {
  if ('primaryOutputIndex' in node && node.primaryOutputIndex != null) {
    const idx = node.primaryOutputIndex;
    if (idx >= 0 && idx < recipe.outputs.length) return idx;
  }
  return 0;
}

export function primaryOutputProductKey(node: SchemeNode, recipe: Recipe): string {
  const idx = primaryOutputIndex(node, recipe);
  return productKey(recipe.outputs[idx] ?? recipe.outputs[0] ?? {});
}

export function primaryOutputPortId(node: SchemeNode, recipe: Recipe): string {
  return `out_${primaryOutputIndex(node, recipe)}`;
}

export function primaryTheoreticalPortRate(
  node: SchemeNode,
  recipe: Recipe,
  portRates: Record<string, Rational> | undefined,
): Rational {
  if (!portRates) return R.zero;
  return portRates[primaryOutputPortId(node, recipe)] ?? R.zero;
}
