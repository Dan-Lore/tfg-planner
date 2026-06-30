import type { Recipe } from '@/data/types';
import type { TfgpMachineNode } from '@/schema/tfgp-types';
import type { VoltageTier } from '@/calculator/gt-voltage';
import { isVoltageTier } from '@/calculator/gt-voltage';
import { clampVoltageTier, defaultVoltageTierForRecipe } from '@/calculator/energy';

export function normalizeNodeVoltage(
  node: TfgpMachineNode,
  recipe: Recipe | undefined,
): TfgpMachineNode {
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
  current: Pick<TfgpMachineNode, 'voltageTier'>,
): Pick<TfgpMachineNode, 'voltageTier'> {
  const minTier = recipe ? defaultVoltageTierForRecipe(recipe) : 'LV';
  const voltageTier = clampVoltageTier(
    current.voltageTier && isVoltageTier(current.voltageTier)
      ? current.voltageTier
      : minTier,
    minTier,
  );
  return { voltageTier };
}
