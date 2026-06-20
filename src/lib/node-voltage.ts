import type { Recipe } from '@/data/types';
import type { TfgpNode } from '@/schema/tfgp';
import type { VoltageTier } from '@/calculator/gt-voltage';
import { isVoltageTier } from '@/calculator/gt-voltage';
import { clampVoltageTier, defaultVoltageTierForRecipe } from '@/calculator/energy';

export function normalizeNodeVoltage(
  node: TfgpNode,
  recipe: Recipe | undefined,
): TfgpNode {
  const minTier = recipe ? defaultVoltageTierForRecipe(recipe) : 'LV';
  const rawTier = node.voltageTier;
  const voltageTier: VoltageTier =
    rawTier && isVoltageTier(rawTier)
      ? clampVoltageTier(rawTier, minTier)
      : minTier;

  return { ...node, voltageTier };
}

export function patchForRecipeChange(
  recipe: Recipe | undefined,
  current: Pick<TfgpNode, 'voltageTier'>,
): Pick<TfgpNode, 'voltageTier'> {
  const minTier = recipe ? defaultVoltageTierForRecipe(recipe) : 'LV';
  const voltageTier = clampVoltageTier(
    current.voltageTier && isVoltageTier(current.voltageTier)
      ? current.voltageTier
      : minTier,
    minTier,
  );
  return { voltageTier };
}
