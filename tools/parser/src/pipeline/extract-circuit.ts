import type { FlowOp } from '../types.js';

export const PROGRAMMED_CIRCUIT_ID = 'gtceu:programmed_circuit';

export function extractCircuitFromFlows<T extends FlowOp>(
  inputs: readonly T[],
): { productInputs: T[]; circuitConfiguration?: number } {
  const productInputs: T[] = [];
  let circuitConfiguration: number | undefined;
  for (const flow of inputs) {
    if (flow.itemId === PROGRAMMED_CIRCUIT_ID) {
      circuitConfiguration = flow.amount;
    } else {
      productInputs.push(flow);
    }
  }
  return { productInputs, circuitConfiguration };
}

/** Drop snapshot rows that only preserved GT circuit slot without real I/O. */
export function isCircuitOnlyBrokenRecipe(recipe: {
  inputs: FlowOp[];
  outputs: FlowOp[];
}): boolean {
  const { productInputs } = extractCircuitFromFlows(recipe.inputs);
  return recipe.outputs.length === 0 && productInputs.length === 0;
}
