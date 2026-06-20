import {
  GT_VOLTAGE,
  VOLTAGE_TIERS,
  isVoltageTier,
  tierIndex,
} from '../../../src/calculator/gt-voltage.js';
import type { VoltageTier } from '../../../src/data/types.js';

export { GT_VOLTAGE, VOLTAGE_TIERS, isVoltageTier, tierIndex, type VoltageTier };

export interface EnergyStack {
  minVoltageTier: VoltageTier;
  voltage: number;
  amperage: number;
}

export interface EnergyInferOptions {
  kind?: 'singleblock' | 'multiblock';
  nativeTier?: VoltageTier;
}

export interface EnergyInferResult {
  stack: EnergyStack;
  /** True when no clean decomposition matched machine rules and LV fallback was used. */
  ambiguous: boolean;
}

function isCleanAmperage(amperage: number): boolean {
  if (amperage < 0.125 || amperage > 64) return false;
  for (const denom of [1, 2, 4]) {
    const scaled = amperage * denom;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-6) return true;
  }
  return false;
}

function collectCleanMatches(euPerTick: number): EnergyStack[] {
  const cleanMatches: EnergyStack[] = [];
  for (const tier of VOLTAGE_TIERS) {
    const voltage = GT_VOLTAGE[tier];
    const amperage = euPerTick / voltage;
    if (isCleanAmperage(amperage)) {
      cleanMatches.push({ minVoltageTier: tier, voltage, amperage });
    }
  }
  return cleanMatches;
}

function collectExactWithin1A(euPerTick: number): EnergyStack[] {
  const matches: EnergyStack[] = [];
  for (const tier of VOLTAGE_TIERS) {
    const voltage = GT_VOLTAGE[tier];
    const amperage = euPerTick / voltage;
    if (amperage > 1 + 1e-6) continue;
    if (Math.abs(amperage * voltage - euPerTick) > 1e-3) continue;
    matches.push({ minVoltageTier: tier, voltage, amperage });
  }
  return matches;
}

function lvFallback(euPerTick: number): EnergyStack {
  const lvVoltage = GT_VOLTAGE.LV;
  return {
    minVoltageTier: 'LV',
    voltage: lvVoltage,
    amperage: euPerTick / lvVoltage,
  };
}

/** Infer EnergyStack from flat EU/t when tier is not explicit. */
export function inferEnergyFromFlatEUt(
  euPerTick: number,
  options?: EnergyInferOptions,
): EnergyStack | undefined {
  return inferEnergyFromFlatEUtDetailed(euPerTick, options)?.stack;
}

export function inferEnergyFromFlatEUtDetailed(
  euPerTick: number,
  options?: EnergyInferOptions,
): EnergyInferResult | undefined {
  if (euPerTick <= 0 || !Number.isFinite(euPerTick)) return undefined;

  const cleanMatches = collectCleanMatches(euPerTick);
  const kind = options?.kind;

  if (kind === 'singleblock') {
    const within1A = cleanMatches.filter((m) => m.amperage <= 1);
    if (within1A.length > 0) {
      return { stack: within1A[0]!, ambiguous: false };
    }
    const exactWithin1A = collectExactWithin1A(euPerTick);
    if (exactWithin1A.length > 0) {
      return { stack: exactWithin1A[0]!, ambiguous: false };
    }
    return { stack: lvFallback(euPerTick), ambiguous: true };
  }

  if (cleanMatches.length === 1) {
    return { stack: cleanMatches[0]!, ambiguous: false };
  }

  if (kind === 'multiblock') {
    if (options.nativeTier) {
      const preferred = cleanMatches.find(
        (m) => m.minVoltageTier === options.nativeTier,
      );
      if (preferred) return { stack: preferred, ambiguous: false };
    }
    const within4A = cleanMatches.filter((m) => m.amperage <= 4);
    if (within4A.length > 0) {
      return { stack: within4A[0]!, ambiguous: false };
    }
    if (cleanMatches.length > 0) {
      return { stack: cleanMatches[0]!, ambiguous: true };
    }
    return { stack: lvFallback(euPerTick), ambiguous: true };
  }

  if (cleanMatches.length > 0) {
    return { stack: cleanMatches[0]!, ambiguous: false };
  }

  return { stack: lvFallback(euPerTick), ambiguous: true };
}

export function energyFromTierAndAmperage(
  tier: VoltageTier,
  amperage: number,
): EnergyStack {
  return {
    minVoltageTier: tier,
    voltage: GT_VOLTAGE[tier],
    amperage,
  };
}

export function energyFromVoltageAndAmperage(
  voltage: number,
  amperage: number,
  options?: EnergyInferOptions,
): EnergyStack | undefined {
  if (voltage <= 0 || amperage <= 0) return undefined;
  const euPerTick = voltage * amperage;
  const exactTier = VOLTAGE_TIERS.find((t) => GT_VOLTAGE[t] === voltage);
  if (exactTier) {
    return { minVoltageTier: exactTier, voltage, amperage };
  }
  return inferEnergyFromFlatEUt(euPerTick, options);
}

export function tierFromGtValuesMember(name: string): VoltageTier | undefined {
  if (!isVoltageTier(name)) return undefined;
  return name;
}
