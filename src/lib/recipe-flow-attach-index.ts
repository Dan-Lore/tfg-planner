import { inputPortId, outputPortId } from '@/canvas/ports';
import type { PackLike } from '@/data/pack-registry';
import type { Flow, Recipe, RecipeFlowAttachIndex, RecipeFlowAttachRef } from '@/data/types';
import { flowLookupKeys } from '@/lib/flow-match';
import { formatRecipeLabel } from '@/lib/recipe-label';
import type { AttachCandidate } from '@/lib/recipe-index';
import type { TagIndex } from '@/lib/tag-index';
import { dedupeAttachCandidates } from '@/lib/recipe-canon';

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

export function findAttachCandidatesFromIndex(
  pack: PackLike,
  attachIndex: RecipeFlowAttachIndex,
  recipesById: Map<string, Recipe>,
  flow: Flow,
  direction: 'upstream' | 'downstream',
  lang: 'ru' | 'en',
  tags: TagIndex,
): AttachCandidate[] {
  const map =
    direction === 'downstream' ? attachIndex.byInputKey : attachIndex.byOutputKey;
  const portIdFn = direction === 'downstream' ? inputPortId : outputPortId;
  const seen = new Set<string>();
  const candidates: AttachCandidate[] = [];

  for (const key of flowLookupKeys(flow, tags)) {
    for (const ref of map[key] ?? []) {
      const dedupe = `${ref.recipeId}:${ref.portIndex}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const recipe = recipesById.get(ref.recipeId);
      if (!recipe) continue;
      candidates.push({
        machineId: ref.machineId,
        recipeId: ref.recipeId,
        portId: portIdFn(ref.portIndex),
        recipe,
        label: formatRecipeLabel(pack, recipe, lang),
      });
    }
  }

  return dedupeAttachCandidates(candidates).sort((a, b) => {
    const cmp = a.label.localeCompare(b.label, lang);
    if (cmp !== 0) return cmp;
    return a.recipeId.localeCompare(b.recipeId, lang);
  });
}
