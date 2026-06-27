import type { RecipeOp } from '../types.js';
import { RECIPE_SCHEME_ALIASES } from '../snapshot/manifest.js';

/** Register canonical scheme ids when export only has RecipeManager codec ids. */
export function expandRecipeSchemeAliases(recipes: RecipeOp[]): RecipeOp[] {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const extras: RecipeOp[] = [];

  for (const [canonicalId, aliases] of Object.entries(RECIPE_SCHEME_ALIASES)) {
    if (byId.has(canonicalId)) continue;
    for (const altId of aliases) {
      const source = byId.get(altId);
      if (!source) continue;
      extras.push({
        ...source,
        id: canonicalId,
        inputs: source.inputs.map((f) => ({ ...f })),
        outputs: source.outputs.map((f) => ({ ...f })),
        ...(source.energy ? { energy: { ...source.energy } } : {}),
        ...(source.circuitConfiguration !== undefined
          ? { circuitConfiguration: source.circuitConfiguration }
          : {}),
        source: `${source.source}#id-alias:${altId}`,
      });
      break;
    }
  }

  return extras.length > 0 ? [...recipes, ...extras] : recipes;
}

/** @deprecated use expandRecipeSchemeAliases */
export const expandMarkerRecipeAliases = expandRecipeSchemeAliases;
