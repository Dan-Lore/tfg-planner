import type { RecipeOp } from '../types.js';
import { recipePathSuffix } from '../../../../src/lib/recipe-canon.js';

const CHEM = 'gtceu:chemical_reactor';
const LCR = 'gtceu:large_chemical_reactor';

/** Mirror chemical_reactor recipes onto large_chemical_reactor when no native LCR suffix exists. */
export function mirrorChemReactorToLcr(recipes: RecipeOp[]): RecipeOp[] {
  const existingLcrSuffixes = new Set(
    recipes
      .filter((r) => r.machineId === LCR)
      .map((r) => recipePathSuffix(r.id)),
  );
  const mirrors: RecipeOp[] = [];

  for (const recipe of recipes) {
    if (recipe.machineId !== CHEM) continue;
    if (existingLcrSuffixes.has(recipePathSuffix(recipe.id))) continue;

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
