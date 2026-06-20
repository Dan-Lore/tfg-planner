import { describe, expect, it } from 'vitest';
import type { Recipe } from '@/data/types';
import {
  baseEuPerTick,
  effectiveDurationTicks,
  effectiveEuPerTick,
  effectiveTotalEu,
} from './energy';

function recipeWithEnergy(
  partial: Partial<Recipe> & { energy: NonNullable<Recipe['energy']> },
): Recipe {
  return {
    id: 'test:recipe',
    machineId: 'gtceu:assembler',
    inputs: [],
    outputs: [{ itemId: 'minecraft:stone', amount: 1 }],
    durationTicks: partial.durationTicks ?? 10,
    ...partial,
  };
}

describe('energy', () => {
  it('base EU/t is V × A at min tier', () => {
    const energy = {
      minVoltageTier: 'MV' as const,
      voltage: 128,
      amperage: 0.5,
    };
    expect(baseEuPerTick(energy)).toBe(64);
  });

  it('GT voltage overclock: MV→HV doubles speed and quadruples EU/t', () => {
    const recipe = recipeWithEnergy({
      durationTicks: 10,
      energy: { minVoltageTier: 'MV', voltage: 128, amperage: 0.5 },
    });
    expect(effectiveEuPerTick(recipe, 'MV')).toBe(64);
    expect(effectiveDurationTicks(recipe, 'MV', 1)).toBe(10);
    expect(effectiveTotalEu(recipe, 'MV', 1)).toBe(640);

    expect(effectiveEuPerTick(recipe, 'HV')).toBe(256);
    expect(effectiveDurationTicks(recipe, 'HV', 1)).toBe(5);
    expect(effectiveTotalEu(recipe, 'HV', 1)).toBe(1280);
  });

  it('duration tier chain: LV 10s → MV 5s → HV 2.5s at 20 t/s', () => {
    const recipe = recipeWithEnergy({
      durationTicks: 200,
      energy: { minVoltageTier: 'LV', voltage: 32, amperage: 1 },
    });
    expect(effectiveDurationTicks(recipe, 'LV', 1)).toBe(200);
    expect(effectiveDurationTicks(recipe, 'MV', 1)).toBe(100);
    expect(effectiveDurationTicks(recipe, 'HV', 1)).toBe(50);
  });

  it('amperage does not affect duration at same tiers', () => {
    const highA = recipeWithEnergy({
      durationTicks: 100,
      energy: { minVoltageTier: 'MV', voltage: 128, amperage: 12 },
    });
    const lowA = recipeWithEnergy({
      durationTicks: 100,
      energy: { minVoltageTier: 'MV', voltage: 128, amperage: 0.75 },
    });
    expect(effectiveDurationTicks(highA, 'MV', 1)).toBe(100);
    expect(effectiveDurationTicks(lowA, 'MV', 1)).toBe(100);
    expect(effectiveDurationTicks(highA, 'HV', 1)).toBe(50);
    expect(effectiveDurationTicks(lowA, 'HV', 1)).toBe(50);
  });

  it('overclock reduces duration but not EU/t', () => {
    const recipe = recipeWithEnergy({
      durationTicks: 10,
      energy: { minVoltageTier: 'MV', voltage: 128, amperage: 0.5 },
    });
    expect(effectiveEuPerTick(recipe, 'MV')).toBe(64);
    expect(effectiveDurationTicks(recipe, 'MV', 2)).toBe(5);
    expect(effectiveTotalEu(recipe, 'MV', 2)).toBe(320);
  });

  it('recipe without energy uses overclock on duration only', () => {
    const recipe: Recipe = {
      id: 'test:no_energy',
      machineId: 'gtceu:assembler',
      inputs: [],
      outputs: [{ itemId: 'minecraft:stone', amount: 1 }],
      durationTicks: 100,
    };
    expect(effectiveEuPerTick(recipe, 'LV')).toBeUndefined();
    expect(effectiveDurationTicks(recipe, 'LV', 2)).toBe(50);
  });
});
