import type { PackData, PackMeta, PackSlice, Recipe } from './types';

/** Build solver-compatible PackData from a slice (subset of recipes). */
export function sliceAsPackData(slice: PackSlice): PackData {
  const { meta, recipes } = slice;
  return {
    format: 'tfg-pack-data',
    formatVersion: 1,
    modpackVersion: meta.modpackVersion,
    dataVersion: meta.dataVersion,
    generatedAt: meta.generatedAt,
    machines: meta.machines,
    items: meta.items,
    fluids: meta.fluids,
    recipes,
  };
}

export function isPackMeta(data: PackMeta | PackData): data is PackMeta {
  return data.formatVersion === 2;
}

export function recipeIdsFromSchemeNodes(
  nodes: readonly { recipeId?: string; kind?: string }[],
): Set<string> {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (node.kind && node.kind !== 'machine') continue;
    if (!node.recipeId) continue;
    ids.add(node.recipeId);
  }
  return ids;
}

export function machineIdsForRecipeIds(
  meta: PackMeta | PackData,
  recipeIds: Iterable<string>,
): Set<string> {
  const wanted = new Set(recipeIds);
  const machineIds = new Set<string>();
  for (const machine of meta.machines) {
    for (const id of machine.recipeIds) {
      if (wanted.has(id)) machineIds.add(machine.id);
    }
  }
  return machineIds;
}

export function mergeRecipeLists(lists: Recipe[][]): Recipe[] {
  const byId = new Map<string, Recipe>();
  for (const list of lists) {
    for (const recipe of list) {
      byId.set(recipe.id, recipe);
    }
  }
  return [...byId.values()];
}
