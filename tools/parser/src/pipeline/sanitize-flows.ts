import type { RecipeOp } from '../types.js';
import { sanitizeFlow } from '../kubejs/ast/flow-parse.js';

export function sanitizeRecipeFlows(recipe: RecipeOp): RecipeOp {
  return {
    ...recipe,
    inputs: recipe.inputs.map(sanitizeFlow),
    outputs: recipe.outputs.map(sanitizeFlow),
  };
}

export function sanitizeAllFlows(recipes: RecipeOp[]): RecipeOp[] {
  return recipes.map(sanitizeRecipeFlows);
}
