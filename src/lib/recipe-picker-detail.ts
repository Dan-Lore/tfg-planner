import { getItemName } from '@/data/pack-registry';
import type { Flow, PackData, Recipe } from '@/data/types';
import { formatFlowQuantityLabel, isChancedFlow } from '@/lib/flow-chance';
import { formatRecipeDuration } from '@/lib/recipe-duration';
import { baseEuPerTick, formatEuPerTick } from '@/calculator/energy';

export interface RecipeFlowChip {
  text: string;
  chanced: boolean;
}

export interface RecipePickerDetail {
  durationLabel: string;
  /** GT min voltage tier when recipe energy is known. */
  tierLabel?: string;
  energyLabel?: string;
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
  const energyLabel = recipe.energy
    ? formatEuPerTick(baseEuPerTick(recipe.energy))
    : undefined;
  return {
    durationLabel: formatRecipeDuration(recipe.durationTicks, lang),
    tierLabel: recipe.energy?.minVoltageTier,
    energyLabel,
    idHint,
    inputs: recipe.inputs.map((f) => flowChip(pack, f, lang)),
    outputs: recipe.outputs.map((f) => flowChip(pack, f, lang)),
  };
}
