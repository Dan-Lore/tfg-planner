import type { VoltageTier } from '../data/types.js';

export type { VoltageTier };

export const VOLTAGE_TIERS = [
  'ULV',
  'LV',
  'MV',
  'HV',
  'EV',
  'IV',
  'LuV',
  'ZPM',
  'UV',
  'UHV',
  'UEV',
  'UIV',
  'UXV',
  'OpV',
  'MAX',
] as const satisfies readonly VoltageTier[];

/** GTValues.V — EU per amp packet per tier (GTCEu). */
export const GT_VOLTAGE: Record<VoltageTier, number> = {
  ULV: 8,
  LV: 32,
  MV: 128,
  HV: 512,
  EV: 2048,
  IV: 8192,
  LuV: 32768,
  ZPM: 131072,
  UV: 524288,
  UHV: 2097152,
  UEV: 8388608,
  UIV: 33554432,
  UXV: 134217728,
  OpV: 536870912,
  MAX: 2147483647,
};

export function tierIndex(tier: VoltageTier): number {
  const idx = VOLTAGE_TIERS.indexOf(tier);
  if (idx < 0) throw new Error(`Unknown voltage tier: ${tier}`);
  return idx;
}

export function allowedTiersFrom(minTier: VoltageTier): VoltageTier[] {
  return VOLTAGE_TIERS.slice(tierIndex(minTier));
}

export function clampVoltageTier(
  tier: VoltageTier,
  minTier: VoltageTier,
): VoltageTier {
  return tierIndex(tier) >= tierIndex(minTier) ? tier : minTier;
}

export function nextVoltageTier(tier: VoltageTier, delta: number): VoltageTier {
  const idx = Math.max(0, Math.min(VOLTAGE_TIERS.length - 1, tierIndex(tier) + delta));
  return VOLTAGE_TIERS[idx]!;
}

export function isVoltageTier(value: string): value is VoltageTier {
  return (VOLTAGE_TIERS as readonly string[]).includes(value);
}
