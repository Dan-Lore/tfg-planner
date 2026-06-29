import type { RecipeOp } from '../types.js';
import { RECIPE_SCHEME_ALIASES } from '../snapshot/manifest.js';
import { normalizeRecipeCanon as normalizeRecipeCanonCore } from '../../../../src/lib/recipe-canon.js';

const CANONICAL_SCHEME_IDS = new Set(Object.keys(RECIPE_SCHEME_ALIASES));

export interface NormalizeRecipeCanonResult {
  recipes: RecipeOp[];
  removedIds: string[];
}

/** Drop duplicate chem/LCR mirrors and alias copies with identical I/O on the same machine. */
export function normalizeRecipeCanon(recipes: RecipeOp[]): NormalizeRecipeCanonResult {
  return normalizeRecipeCanonCore(recipes, { canonicalSchemeIds: CANONICAL_SCHEME_IDS });
}
