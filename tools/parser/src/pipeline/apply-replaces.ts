import type { RecipeStore } from './recipe-store.js';
import type { ReplaceOp } from '../types.js';

function selectorMatches(sel: ReplaceOp['selector'], recipeId: string): boolean {
  if (sel.id) return sel.id === recipeId;
  if (sel.mod) return recipeId.startsWith(sel.mod + ':');
  return false;
}

export function applyReplaces(store: RecipeStore, replaces: ReplaceOp[]): number {
  let patched = 0;
  for (const rep of replaces) {
    for (const recipe of store.values()) {
      if (!selectorMatches(rep.selector, recipe.id)) continue;
      let changed = false;
      for (const input of recipe.inputs) {
        if (input.itemId === rep.oldInput) {
          input.itemId = rep.newInput;
          changed = true;
        }
      }
      if (changed) patched++;
    }
  }
  return patched;
}
