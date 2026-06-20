import { join } from 'node:path';
import type { RecipeOp } from '../types.js';
import { listKubeJsFiles } from '../kubejs/scanner.js';
import { parseKubeJsFile } from '../kubejs/parse-file.js';
import { parseStartupGlobals } from '../kubejs/parse-globals.js';

export interface EnrichEnergyStats {
  kubejsRecipesWithEnergy: number;
  enrichedRecipes: number;
}

function hasEnergy(recipe: RecipeOp): boolean {
  return recipe.energy != null;
}

function mergeRecipeEnergy(snapshot: RecipeOp, kubejs: RecipeOp): RecipeOp {
  if (snapshot.energy || !kubejs.energy) return snapshot;
  return { ...snapshot, energy: { ...kubejs.energy } };
}

function parseKubejsRecipes(modpackRoot: string): Map<string, RecipeOp> {
  const serverRoot = join(modpackRoot, 'kubejs', 'server_scripts');
  const startupRoot = join(modpackRoot, 'kubejs', 'startup_scripts');
  const globals = parseStartupGlobals(startupRoot);
  const byId = new Map<string, RecipeOp>();

  for (const file of listKubeJsFiles(serverRoot)) {
    const result = parseKubeJsFile(file, { globals });
    for (const recipe of result.recipes) {
      if (!hasEnergy(recipe)) continue;
      byId.set(recipe.id, recipe);
    }
  }

  return byId;
}

export function enrichRecipeEnergy(
  recipes: RecipeOp[],
  modpackRoot: string,
): { recipes: RecipeOp[]; stats: EnrichEnergyStats } {
  const kubejsById = parseKubejsRecipes(modpackRoot);
  let enrichedRecipes = 0;

  const enriched = recipes.map((recipe) => {
    if (recipe.energy) return recipe;
    const kubejs = kubejsById.get(recipe.id);
    if (!kubejs?.energy) return recipe;
    enrichedRecipes += 1;
    return mergeRecipeEnergy(recipe, kubejs);
  });

  return {
    recipes: enriched,
    stats: {
      kubejsRecipesWithEnergy: kubejsById.size,
      enrichedRecipes,
    },
  };
}
