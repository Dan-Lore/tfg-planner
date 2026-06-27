import type { Flow } from '@/data/types';

export const PROGRAMMED_CIRCUIT_ID = 'gtceu:programmed_circuit';

export function productInputs(recipe: { inputs: Flow[]; circuitConfiguration?: number }): Flow[] {
  return recipe.inputs.filter((f) => f.itemId !== PROGRAMMED_CIRCUIT_ID);
}
