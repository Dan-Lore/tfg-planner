import type { Recipe } from '@/data/types';
import type { TagIndex } from '@/shared/tag-index';
import { R, type Rational } from '@/calculator/rational';
import type {
  SchemeEdge,
  SchemeEdgeConstraint,
  SchemeNode,
} from '@/calculator/flow-solver-types';
import { perMachineOutputRate } from '@/calculator/flow-rates';
import { isSchemeBufferNode } from '@/calculator/buffer-solver';
import { recipeInputMatchesProduct } from '@/shared/flow-match';
import { primaryOutputProductKey } from '@/shared/primary-output';
import { productKey } from '@/shared/ports';

export function pinnedEdgeFlowMap(
  constraints: readonly SchemeEdgeConstraint[],
): Map<string, Rational> {
  const map = new Map<string, Rational>();
  for (const c of constraints) {
    map.set(c.edgeId, R.from(c.ratePerSecond));
  }
  return map;
}

/** Apply pinned edge flows and propagate demand to target/source nodes. */
export function applyEdgeConstraintsToMachineCountPhase(
  constraints: readonly SchemeEdgeConstraint[],
  _edges: readonly SchemeEdge[],
  edgeById: Map<string, SchemeEdge>,
  nodeById: Map<string, SchemeNode>,
  recipes: Map<string, Recipe>,
  tags: TagIndex,
  incoming: Map<string, SchemeEdge[]>,
  requiredOutput: Record<string, Record<string, Rational>>,
  edgeFlows: Record<string, Rational>,
): void {
  for (const constraint of constraints) {
    const edge = edgeById.get(constraint.edgeId);
    if (!edge) continue;
    const rate = R.from(constraint.ratePerSecond);
    edgeFlows[edge.id] = rate;

    const key = edge.itemId ?? edge.fluidId ?? '';
    if (!key) continue;

    const target = nodeById.get(edge.target);
    if (target && !isSchemeBufferNode(target)) {
      const existing = requiredOutput[edge.target]![key];
      if (!existing || rate.compare(existing) > 0) {
        requiredOutput[edge.target]![key] = rate;
      }
    }

    const source = nodeById.get(edge.source);
    if (!source || isSchemeBufferNode(source)) continue;
    const recipe = recipes.get(source.recipeId);
    if (!recipe) continue;

    const primaryKey = primaryOutputProductKey(source, recipe);
    const primaryOut = recipe.outputs.find((o) => productKey(o) === primaryKey);
    if (!primaryOut) continue;

    const sourceOutRate = rate;
    const existingSrc = requiredOutput[edge.source]![primaryKey];
    if (!existingSrc || sourceOutRate.compare(existingSrc) > 0) {
      requiredOutput[edge.source]![primaryKey] = sourceOutRate;
    }

    for (const inp of recipe.inputs) {
      const inKey = productKey(inp);
      if (!recipeInputMatchesProduct(inKey, key, tags) && key !== primaryKey) continue;
      const outAmount = primaryOut.amount;
      const inRate = sourceOutRate.mul(R.from(inp.amount)).div(R.from(outAmount));
      for (const inEdge of incoming.get(edge.source) ?? []) {
        const inEdgeKey = inEdge.itemId ?? inEdge.fluidId ?? '';
        if (!recipeInputMatchesProduct(inKey, inEdgeKey, tags)) continue;
        const up = nodeById.get(inEdge.source);
        if (!up) continue;
        const upRecipe = recipes.get(up.recipeId);
        if (!upRecipe) continue;
        const upOutKey = primaryOutputProductKey(up, upRecipe);
        const perMachine = perMachineOutputRate(upRecipe, upOutKey, up);
        if (perMachine.compare(R.zero) <= 0) continue;
        const needed = inRate;
        const prev = requiredOutput[inEdge.source]![upOutKey];
        if (!prev || needed.compare(prev) > 0) {
          requiredOutput[inEdge.source]![upOutKey] = needed;
        }
      }
    }
  }
}
