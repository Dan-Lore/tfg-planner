import type { PackLike } from '@/data/pack-registry';
import { getItemName } from '@/data/pack-registry';
import type { Flow, Recipe } from '@/data/types';
import { formatFlowQuantityLabel, isChancedFlow } from '@/lib/flow-chance';
import { formatRecipeDuration } from '@/lib/recipe-duration';
import { productInputs } from '@/lib/recipe-product-flows';
import { baseEuPerTick, formatEuPerTick } from '@/calculator/energy';

export interface RecipeFlowChip {
  text: string;
  chanced: boolean;
}

export interface RecipePickerDetail {
  durationLabel: string;
  /** GT min voltage tier when recipe energy is known. */
  tierLabel?: string;
  circuitLabel?: string;
  energyLabel?: string;
  idHint: string;
  inputs: RecipeFlowChip[];
  outputs: RecipeFlowChip[];
}

function flowChip(pack: PackLike, flow: Flow, lang: 'ru' | 'en'): RecipeFlowChip {
  const id = flow.itemId ?? flow.fluidId ?? '?';
  return {
    text: formatFlowQuantityLabel(flow, getItemName(pack, id, lang)),
    chanced: isChancedFlow(flow),
  };
}

export function buildRecipePickerDetail(
  pack: PackLike,
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
    circuitLabel:
      recipe.circuitConfiguration !== undefined
        ? String(recipe.circuitConfiguration)
        : undefined,
    energyLabel,
    idHint,
    inputs: productInputs(recipe).map((f) => flowChip(pack, f, lang)),
    outputs: recipe.outputs.map((f) => flowChip(pack, f, lang)),
  };
}
