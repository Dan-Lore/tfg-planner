import { flowKey, inputPortId, outputPortId } from '@/canvas/ports';
import { getMachineName } from '@/data/pack-registry';
import type { PackLike } from '@/data/pack-registry';
import type { Flow, Recipe, PackData } from '@/data/types';
import { flowLookupKeys } from '@/lib/flow-match';
import { formatRecipeLabel } from '@/lib/recipe-label';
import { dedupeAttachCandidates } from '@/lib/recipe-canon';
import type { TagIndex } from '@/lib/tag-index';

export interface RecipePortRef {
  recipe: Recipe;
  portIndex: number;
}

export interface RecipeFlowIndex {
  byInputKey: Map<string, RecipePortRef[]>;
  byOutputKey: Map<string, RecipePortRef[]>;
}

export interface AttachCandidate {
  machineId: string;
  recipeId: string;
  portId: string;
  recipe: Recipe;
  label: string;
}

export function buildRecipeFlowIndex(pack: PackData): RecipeFlowIndex {
  return buildRecipeFlowIndexFromRecipes(pack.recipes);
}

export function buildRecipeFlowIndexFromRecipes(recipes: readonly Recipe[]): RecipeFlowIndex {
  const byInputKey = new Map<string, RecipePortRef[]>();
  const byOutputKey = new Map<string, RecipePortRef[]>();

  for (const recipe of recipes) {
    recipe.inputs.forEach((flow, i) => {
      const key = flowKey(flow);
      const list = byInputKey.get(key) ?? [];
      list.push({ recipe, portIndex: i });
      byInputKey.set(key, list);
    });
    recipe.outputs.forEach((flow, i) => {
      const key = flowKey(flow);
      const list = byOutputKey.get(key) ?? [];
      list.push({ recipe, portIndex: i });
      byOutputKey.set(key, list);
    });
  }

  return { byInputKey, byOutputKey };
}

function sortCandidates(
  pack: PackLike,
  candidates: AttachCandidate[],
  lang: 'ru' | 'en',
): AttachCandidate[] {
  return [...candidates].sort((a, b) => {
    const ma = getMachineName(pack, a.machineId, lang);
    const mb = getMachineName(pack, b.machineId, lang);
    const cmp = ma.localeCompare(mb, lang);
    if (cmp !== 0) return cmp;
    return a.label.localeCompare(b.label, lang);
  });
}

export function findDownstreamCandidates(
  pack: PackLike,
  index: RecipeFlowIndex,
  flow: Flow,
  lang: 'ru' | 'en',
  tags: TagIndex,
): AttachCandidate[] {
  const seen = new Set<string>();
  const refs: RecipePortRef[] = [];
  for (const key of flowLookupKeys(flow, tags)) {
    for (const ref of index.byInputKey.get(key) ?? []) {
      const dedupe = `${ref.recipe.id}:${ref.portIndex}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      refs.push(ref);
    }
  }
  const candidates = refs.map(({ recipe, portIndex }) => ({
    machineId: recipe.machineId,
    recipeId: recipe.id,
    portId: inputPortId(portIndex),
    recipe,
    label: formatRecipeLabel(pack, recipe, lang),
  }));
  return sortCandidates(pack, dedupeAttachCandidates(candidates), lang);
}

export function findUpstreamCandidates(
  pack: PackLike,
  index: RecipeFlowIndex,
  flow: Flow,
  lang: 'ru' | 'en',
  tags: TagIndex,
): AttachCandidate[] {
  const seen = new Set<string>();
  const refs: RecipePortRef[] = [];
  for (const key of flowLookupKeys(flow, tags)) {
    for (const ref of index.byOutputKey.get(key) ?? []) {
      const dedupe = `${ref.recipe.id}:${ref.portIndex}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      refs.push(ref);
    }
  }
  const candidates = refs.map(({ recipe, portIndex }) => ({
    machineId: recipe.machineId,
    recipeId: recipe.id,
    portId: outputPortId(portIndex),
    recipe,
    label: formatRecipeLabel(pack, recipe, lang),
  }));
  return sortCandidates(pack, dedupeAttachCandidates(candidates), lang);
}
