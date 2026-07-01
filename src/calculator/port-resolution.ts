import type { Recipe } from '@/data/types';
import type { TagIndex } from '@/lib/tag-index';
import { recipeInputMatchesProduct } from '@/lib/flow-match';
import { normalizePortId, parsePortId, productKey } from '@/lib/ports';
import { R, type Rational } from '@/calculator/rational';

export interface PortEdge {
  sourcePort?: string;
  targetPort?: string;
  itemId?: string;
  fluidId?: string;
}

export function resolveTargetInputPort(
  edge: PortEdge,
  recipe: Recipe,
  tags: TagIndex,
): string | null {
  if (edge.targetPort) {
    const portId = normalizePortId(edge.targetPort);
    const parsed = parsePortId(portId);
    if (parsed?.kind === 'in') return portId;
  }
  const key = edge.itemId ?? edge.fluidId ?? '';
  if (!key) return null;
  for (let i = 0; i < recipe.inputs.length; i++) {
    const inKey = productKey(recipe.inputs[i]!);
    if (inKey === key || recipeInputMatchesProduct(inKey, key, tags)) {
      return `in_${i}`;
    }
  }
  return null;
}

export function resolveSourceOutputPort(
  edge: PortEdge,
  recipe: Recipe,
): string | null {
  if (edge.sourcePort) {
    const portId = normalizePortId(edge.sourcePort);
    const parsed = parsePortId(portId);
    if (parsed?.kind === 'out') return portId;
  }
  const key = edge.itemId ?? edge.fluidId ?? '';
  if (!key) return null;
  const index = recipe.outputs.findIndex((o) => productKey(o) === key);
  return index >= 0 ? `out_${index}` : null;
}

/** Demand at a specific input port from primary output rate (per-port, not aggregated by item). */
export function portInputDemandRate(
  recipe: Recipe,
  inputIndex: number,
  primaryOutputRate: Rational,
  primaryOutputIndex = 0,
): Rational {
  const inp = recipe.inputs[inputIndex];
  const primaryOut = recipe.outputs[primaryOutputIndex];
  if (!inp || !primaryOut) return R.zero;
  return primaryOutputRate.mul(R.from(inp.amount)).div(R.from(primaryOut.amount));
}
