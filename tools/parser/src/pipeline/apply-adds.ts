import type { RecipeStore } from './recipe-store.js';
import type { RecipeOp } from '../types.js';
import { isExplicitlyRemoved } from './apply-removes.js';
import type { RemoveSelector } from '../kubejs/ast/extractors/remove.js';

export function applyAdds(
  store: RecipeStore,
  adds: RecipeOp[],
  removes: RemoveSelector[],
): number {
  let count = 0;
  for (const recipe of adds) {
    if (isExplicitlyRemoved(recipe.id, removes)) continue;
    store.set(recipe);
    count++;
  }
  return count;
}
