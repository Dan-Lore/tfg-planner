import type { EnergyOp, RecipeOp } from '../types.js';
import {
  inferEnergyFromFlatEUtDetailed,
  type EnergyInferOptions,
  tierIndex,
} from '../energy-parse.js';
import { isMultiblockMachineId } from '../../../../src/calculator/gt-multiblock.js';
import { nativeTierForMachine } from '../gt-machine-tiers.js';

type LegacyEnergy = { euPerTick: number; voltageTier?: string };

export interface SanitizeEnergyStats {
  singleblockAmperageOver1: number;
  energyInferAmbiguous: number;
}

function isLegacyEnergy(energy: EnergyOp | LegacyEnergy): energy is LegacyEnergy {
  return 'euPerTick' in energy && !('voltage' in energy);
}

function isSuspiciousEnergyStack(energy: EnergyOp): boolean {
  const euPerTick = energy.voltage * energy.amperage;
  if (energy.amperage < 0.01) return true;
  if (tierIndex(energy.minVoltageTier) > tierIndex('HV') && euPerTick <= 512) return true;
  return false;
}

function inferContextForMachine(machineId: string): EnergyInferOptions {
  const kind = isMultiblockMachineId(machineId) ? 'multiblock' : 'singleblock';
  const nativeTier = nativeTierForMachine(machineId);
  return { kind, nativeTier };
}

function shouldReinferSingleblockAmperage(
  energy: EnergyOp,
  kind: EnergyInferOptions['kind'],
): boolean {
  return kind === 'singleblock' && energy.amperage > 1 + 1e-6;
}

export function normalizeRecipeEnergy(
  energy: EnergyOp | LegacyEnergy,
  machineId?: string,
): { energy: EnergyOp; ambiguous: boolean } | undefined {
  const inferOpts = machineId ? inferContextForMachine(machineId) : undefined;

  if (isLegacyEnergy(energy)) {
    const result = inferEnergyFromFlatEUtDetailed(energy.euPerTick, inferOpts);
    return result ? { energy: result.stack, ambiguous: result.ambiguous } : undefined;
  }
  if (
    energy.minVoltageTier &&
    typeof energy.voltage === 'number' &&
    typeof energy.amperage === 'number'
  ) {
    const euPerTick = energy.voltage * energy.amperage;
    if (
      isSuspiciousEnergyStack(energy) ||
      shouldReinferSingleblockAmperage(energy, inferOpts?.kind)
    ) {
      const result = inferEnergyFromFlatEUtDetailed(euPerTick, inferOpts);
      return result ? { energy: result.stack, ambiguous: result.ambiguous } : undefined;
    }
    return { energy, ambiguous: false };
  }
  return undefined;
}

export function sanitizeRecipeEnergy(recipes: RecipeOp[]): {
  recipes: RecipeOp[];
  stats: SanitizeEnergyStats;
} {
  const stats: SanitizeEnergyStats = {
    singleblockAmperageOver1: 0,
    energyInferAmbiguous: 0,
  };

  const sanitized = recipes.map((recipe) => {
    if (!recipe.energy) return recipe;
    const normalized = normalizeRecipeEnergy(
      recipe.energy as EnergyOp | LegacyEnergy,
      recipe.machineId,
    );
    if (!normalized) {
      const { energy: _e, ...rest } = recipe;
      return rest;
    }

    if (normalized.ambiguous) stats.energyInferAmbiguous += 1;

    const kind = inferContextForMachine(recipe.machineId).kind;
    if (
      kind === 'singleblock' &&
      normalized.energy.amperage > 1 + 1e-6
    ) {
      stats.singleblockAmperageOver1 += 1;
    }

    return { ...recipe, energy: normalized.energy };
  });

  return { recipes: sanitized, stats };
}
