import { flowKey, inputPortId, outputPortId } from '@/canvas/ports';
import { getMachineName } from '@/data/pack-registry';
import type { Flow, PackData, Recipe } from '@/data/types';
import { formatRecipeLabel } from '@/lib/recipe-label';

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
  const byInputKey = new Map<string, RecipePortRef[]>();
  const byOutputKey = new Map<string, RecipePortRef[]>();

  for (const recipe of pack.recipes) {
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
  pack: PackData,
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
  pack: PackData,
  index: RecipeFlowIndex,
  flow: Flow,
  lang: 'ru' | 'en',
): AttachCandidate[] {
  const refs = index.byInputKey.get(flowKey(flow)) ?? [];
  const candidates = refs.map(({ recipe, portIndex }) => ({
    machineId: recipe.machineId,
    recipeId: recipe.id,
    portId: inputPortId(portIndex),
    recipe,
    label: formatRecipeLabel(pack, recipe, lang),
  }));
  return sortCandidates(pack, candidates, lang);
}

export function findUpstreamCandidates(
  pack: PackData,
  index: RecipeFlowIndex,
  flow: Flow,
  lang: 'ru' | 'en',
): AttachCandidate[] {
  const refs = index.byOutputKey.get(flowKey(flow)) ?? [];
  const candidates = refs.map(({ recipe, portIndex }) => ({
    machineId: recipe.machineId,
    recipeId: recipe.id,
    portId: outputPortId(portIndex),
    recipe,
    label: formatRecipeLabel(pack, recipe, lang),
  }));
  return sortCandidates(pack, candidates, lang);
}
