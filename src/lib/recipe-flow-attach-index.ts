import type { Flow, Recipe, RecipeFlowAttachIndex, RecipeFlowAttachRef } from '@/data/types';
import { flowLookupKeys } from '@/lib/flow-match';
import type { TagIndex } from '@/lib/tag-index';

function addRef(
  map: Record<string, RecipeFlowAttachRef[]>,
  key: string,
  ref: RecipeFlowAttachRef,
): void {
  const list = map[key] ?? [];
  const dedupe = `${ref.recipeId}:${ref.portIndex}`;
  if (list.some((r) => `${r.recipeId}:${r.portIndex}` === dedupe)) return;
  list.push(ref);
  map[key] = list;
}

export function buildRecipeFlowAttachIndex(
  recipes: readonly Recipe[],
  tags: TagIndex,
): RecipeFlowAttachIndex {
  const byInputKey: Record<string, RecipeFlowAttachRef[]> = {};
  const byOutputKey: Record<string, RecipeFlowAttachRef[]> = {};

  for (const recipe of recipes) {
    recipe.inputs.forEach((flow, portIndex) => {
      const ref: RecipeFlowAttachRef = {
        machineId: recipe.machineId,
        recipeId: recipe.id,
        portIndex,
      };
      for (const key of flowLookupKeys(flow, tags)) {
        addRef(byInputKey, key, ref);
      }
    });
    recipe.outputs.forEach((flow, portIndex) => {
      const ref: RecipeFlowAttachRef = {
        machineId: recipe.machineId,
        recipeId: recipe.id,
        portIndex,
      };
      for (const key of flowLookupKeys(flow, tags)) {
        addRef(byOutputKey, key, ref);
      }
    });
  }

  return {
    format: 'tfg-pack-flow-index',
    formatVersion: 1,
    byInputKey,
    byOutputKey,
  };
}

export function machineIdsForFlowAttach(
  attachIndex: RecipeFlowAttachIndex,
  flow: Flow,
  direction: 'upstream' | 'downstream',
  tags: TagIndex,
): Set<string> {
  const map =
    direction === 'downstream' ? attachIndex.byInputKey : attachIndex.byOutputKey;
  const machineIds = new Set<string>();
  for (const key of flowLookupKeys(flow, tags)) {
    for (const ref of map[key] ?? []) {
      machineIds.add(ref.machineId);
    }
  }
  return machineIds;
}
