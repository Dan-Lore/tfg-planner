import type { RecipeStore } from './recipe-store.js';
import { removeMatchesRecipe, removeMatchesId, type RemoveSelector } from '../kubejs/ast/extractors/remove.js';

export function applyRemoves(store: RecipeStore, removes: RemoveSelector[]): number {
  let count = 0;
  for (const sel of removes) {
    if (sel.id) {
      if (store.delete(sel.id)) count++;
      continue;
    }
    for (const id of store.ids()) {
      const recipe = store.get(id);
      if (recipe && removeMatchesRecipe(sel, recipe) && store.delete(id)) count++;
    }
  }
  return count;
}

/** Only explicit id removals block KubeJS adds; mod-wide removes affect substrate only. */
export function isExplicitlyRemoved(recipeId: string, removes: RemoveSelector[]): boolean {
  return removes.some((sel) => sel.id != null && removeMatchesId(sel, recipeId));
}
