import { describe, it, expect } from 'vitest';
import type { PackData, Recipe } from '@/data/types';
import {
  buildRecipeFlowIndex,
  findDownstreamCandidates,
  findUpstreamCandidates,
} from './recipe-index';
import { buildTagIndex } from './tag-index';

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
  const tags = buildTagIndex(pack);

  it('finds downstream candidates by matching input flow', () => {
    const flow = { itemId: '#forge:dusts/copper', amount: 3 };
    const candidates = findDownstreamCandidates(pack, index, flow, 'ru', tags);
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
    const candidates = findUpstreamCandidates(pack, index, flow, 'ru', tags);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.recipeId).toBe('gtceu:cent_copper');
    expect(candidates[0]!.portId).toBe('out_0');
  });

  it('finds downstream pyrolyse when attaching from TFC log', () => {
    const pyrolyse: Recipe = {
      id: 'tfg:pyrolyse_oven/log_to_creosote',
      machineId: 'gtceu:pyrolyse_oven',
      inputs: [{ itemId: '#minecraft:logs_that_burn', amount: 16 }],
      outputs: [
        { itemId: 'minecraft:charcoal', amount: 20 },
        { fluidId: 'gtceu:creosote', amount: 4000 },
      ],
      durationTicks: 1280,
    };
    const logPack = miniPack([pyrolyse]);
    logPack.items.push(
      { id: 'tfc:wood/log/oak', names: { ru: 'Дуб', en: 'Oak' } },
      { id: '#minecraft:logs_that_burn', names: { ru: 'Брёвна', en: 'Logs' } },
    );
    const logIndex = buildRecipeFlowIndex(logPack);
    const logTags = buildTagIndex(logPack);
    const candidates = findDownstreamCandidates(
      logPack,
      logIndex,
      { itemId: 'tfc:wood/log/oak', amount: 16 },
      'ru',
      logTags,
    );
    expect(candidates.some((c) => c.recipeId === 'tfg:pyrolyse_oven/log_to_creosote')).toBe(true);
  });
});
