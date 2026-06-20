import type { Recipe, RecipeEnergy } from '@/data/types';
import {
  GT_VOLTAGE,
  allowedTiersFrom,
  clampVoltageTier,
  tierIndex,
  type VoltageTier,
} from './gt-voltage';

export function recipeEnergyBase(recipe: Recipe): RecipeEnergy | undefined {
  return recipe.energy;
}

export function baseEuPerTick(energy: RecipeEnergy): number {
  return energy.voltage * energy.amperage;
}

export function effectiveEuPerTick(
  recipe: Recipe,
  nodeTier: VoltageTier,
): number | undefined {
  const energy = recipe.energy;
  if (!energy) return undefined;
  if (tierIndex(nodeTier) < tierIndex(energy.minVoltageTier)) return undefined;
  return GT_VOLTAGE[nodeTier] * energy.amperage;
}

export function effectiveDurationTicks(
  recipe: Recipe,
  nodeTier: VoltageTier,
  overclock: number,
): number {
  const oc = Math.max(overclock, 0.1);
  const base = recipe.durationTicks;
  const energy = recipe.energy;
  if (!energy) return base / oc;
  const delta = tierIndex(nodeTier) - tierIndex(energy.minVoltageTier);
  const tierSpeed = delta > 0 ? 2 ** delta : 1;
  return base / tierSpeed / oc;
}

export function effectiveTotalEu(
  recipe: Recipe,
  nodeTier: VoltageTier,
  overclock: number,
): number | undefined {
  const euPerTick = effectiveEuPerTick(recipe, nodeTier);
  if (euPerTick === undefined) return undefined;
  return euPerTick * effectiveDurationTicks(recipe, nodeTier, overclock);
}

export function defaultVoltageTierForRecipe(recipe: Recipe): VoltageTier {
  return recipe.energy?.minVoltageTier ?? 'LV';
}

export function allowedTiersForRecipe(recipe: Recipe): VoltageTier[] {
  const min = defaultVoltageTierForRecipe(recipe);
  return allowedTiersFrom(min);
}

export { clampVoltageTier, allowedTiersFrom };

export function formatEuPerTick(value: number): string {
  if (value >= 1000) return `${Math.round(value)} EU/t`;
  if (Number.isInteger(value)) return `${value} EU/t`;
  return `${Math.round(value * 10) / 10} EU/t`;
}
