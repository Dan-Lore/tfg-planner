import { getItemName } from '@/data/pack-registry';
import type { Flow, PackData, Recipe } from '@/data/types';
import { formatFlowQuantityLabel, isChancedFlow } from '@/lib/flow-chance';
import { formatRecipeDuration } from '@/lib/recipe-duration';

export interface RecipeFlowChip {
  text: string;
  chanced: boolean;
}

export interface RecipePickerDetail {
  durationLabel: string;
  idHint: string;
  inputs: RecipeFlowChip[];
  outputs: RecipeFlowChip[];
}

function flowChip(pack: PackData, flow: Flow, lang: 'ru' | 'en'): RecipeFlowChip {
  const id = flow.itemId ?? flow.fluidId ?? '?';
  return {
    text: formatFlowQuantityLabel(flow, getItemName(pack, id, lang)),
    chanced: isChancedFlow(flow),
  };
}

export function buildRecipePickerDetail(
  pack: PackData,
  recipe: Recipe,
  lang: 'ru' | 'en',
): RecipePickerDetail {
  const idHint = recipe.id.includes(':') ? recipe.id.slice(recipe.id.indexOf(':') + 1) : recipe.id;
  return {
    durationLabel: formatRecipeDuration(recipe.durationTicks, lang),
    idHint,
    inputs: recipe.inputs.map((f) => flowChip(pack, f, lang)),
    outputs: recipe.outputs.map((f) => flowChip(pack, f, lang)),
  };
}
