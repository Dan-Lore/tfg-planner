import type { RecipeOp } from '../types.js';

const CHEM = 'gtceu:chemical_reactor';
const LCR = 'gtceu:large_chemical_reactor';

/** Mirror chemical_reactor recipes onto large_chemical_reactor for machine picker parity. */
export function mirrorChemReactorToLcr(recipes: RecipeOp[]): RecipeOp[] {
  const existingLcr = new Set(
    recipes.filter((r) => r.machineId === LCR).map((r) => r.id.replace(/@lcr$/, '')),
  );
  const mirrors: RecipeOp[] = [];

  for (const recipe of recipes) {
    if (recipe.machineId !== CHEM) continue;
    if (existingLcr.has(recipe.id)) continue;

    const mirrorId = `${recipe.id}@lcr`;
    if (recipes.some((r) => r.id === mirrorId)) continue;

    mirrors.push({
      ...recipe,
      id: mirrorId,
      machineId: LCR,
      inputs: recipe.inputs.map((f) => ({ ...f })),
      outputs: recipe.outputs.map((f) => ({ ...f })),
      source: `${recipe.source}#lcr-mirror`,
    });
  }

  return mirrors;
}
