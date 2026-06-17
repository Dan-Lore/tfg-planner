import { describe, it, expect } from 'vitest';
import type { PackData, Recipe } from '@/data/types';
import {
  buildRecipeFlowIndex,
  findDownstreamCandidates,
  findUpstreamCandidates,
} from './recipe-index';

function miniPack(recipes: Recipe[]): PackData {
  return {
    format: 'tfg-pack-data',
    formatVersion: 1,
    modpackVersion: 'test',
    dataVersion: 1,
    generatedAt: '',
    machines: [
      { id: 'gtceu:mixer', names: { ru: 'Миксер', en: 'Mixer' }, category: 'gt', recipeIds: [] },
      { id: 'gtceu:centrifuge', names: { ru: 'Центрифуга', en: 'Centrifuge' }, category: 'gt', recipeIds: [] },
    ],
    recipes,
    items: [],
    fluids: [],
  };
}

describe('recipe-index', () => {
  const downstreamRecipe: Recipe = {
    id: 'gtceu:mix_copper',
    machineId: 'gtceu:mixer',
    inputs: [{ itemId: '#forge:dusts/copper', amount: 1 }],
    outputs: [{ itemId: 'gtceu:copper_dust', amount: 1 }],
    durationTicks: 20,
  };

  const upstreamRecipe: Recipe = {
    id: 'gtceu:cent_copper',
    machineId: 'gtceu:centrifuge',
    inputs: [{ itemId: 'minecraft:copper_ore', amount: 1 }],
    outputs: [{ itemId: '#forge:dusts/copper', amount: 3 }],
    durationTicks: 20,
  };

  const altMixerRecipe: Recipe = {
    id: 'gtceu:mix_copper_alt',
    machineId: 'gtceu:mixer',
    inputs: [{ itemId: '#forge:dusts/copper', amount: 2 }],
    outputs: [{ itemId: 'gtceu:copper_dust', amount: 2 }],
    durationTicks: 40,
  };

  const pack = miniPack([downstreamRecipe, upstreamRecipe, altMixerRecipe]);
  const index = buildRecipeFlowIndex(pack);

  it('finds downstream candidates by matching input flow', () => {
    const flow = { itemId: '#forge:dusts/copper', amount: 3 };
    const candidates = findDownstreamCandidates(pack, index, flow, 'ru');
    expect(candidates).toHaveLength(2);
    expect(candidates.every((c) => c.machineId === 'gtceu:mixer')).toBe(true);
    expect(candidates.map((c) => c.recipeId).sort()).toEqual([
      'gtceu:mix_copper',
      'gtceu:mix_copper_alt',
    ]);
    expect(candidates[0]!.portId).toBe('in_0');
  });

  it('finds upstream candidates by matching output flow', () => {
    const flow = { itemId: '#forge:dusts/copper', amount: 1 };
    const candidates = findUpstreamCandidates(pack, index, flow, 'ru');
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.recipeId).toBe('gtceu:cent_copper');
    expect(candidates[0]!.portId).toBe('out_0');
  });
});
