import { describe, expect, it } from 'vitest';
import type { PackData, Recipe } from '@/data/types';
import { buildTagIndexFromMeta } from '@/lib/tag-index';
import {
  buildRecipeFlowAttachIndex,
  findAttachCandidatesFromIndex,
  machineIdsForFlowAttach,
} from '@/lib/recipe-flow-attach-index';

function miniPack(recipes: Recipe[], fluids: PackData['fluids']): PackData {
  return {
    format: 'tfg-pack-data',
    formatVersion: 1,
    modpackVersion: 'test',
    dataVersion: 1,
    generatedAt: '',
    machines: [
      {
        id: 'gtceu:gas_collector',
        names: { ru: 'Сборщик газа', en: 'Gas Collector' },
        category: 'gt',
        recipeIds: ['gtceu:gas_collector/air'],
      },
      {
        id: 'gtceu:centrifuge',
        names: { ru: 'Центрифуга', en: 'Centrifuge' },
        category: 'gt',
        recipeIds: ['gtceu:centrifuge/air_separation'],
      },
    ],
    recipes,
    items: [],
    fluids,
  };
}

describe('recipe-flow-attach-index', () => {
  const gasCollector: Recipe = {
    id: 'gtceu:gas_collector/air',
    machineId: 'gtceu:gas_collector',
    inputs: [],
    outputs: [{ fluidId: 'gtceu:air', amount: 10_000 }],
    durationTicks: 200,
  };

  const airSeparation: Recipe = {
    id: 'gtceu:centrifuge/air_separation',
    machineId: 'gtceu:centrifuge',
    inputs: [{ fluidId: '#forge:air', amount: 10_000 }],
    outputs: [
      { fluidId: 'gtceu:nitrogen', amount: 3900 },
      { fluidId: 'gtceu:oxygen', amount: 1000 },
    ],
    durationTicks: 1600,
  };

  const fluids = [
    { id: 'gtceu:air', names: { ru: 'Земной воздух', en: 'Earth Air' } },
    { id: 'gtceu:nitrogen', names: { ru: 'Азот', en: 'Nitrogen' } },
    { id: 'gtceu:oxygen', names: { ru: 'Кислород', en: 'Oxygen' } },
    { id: '#forge:air', names: { ru: 'Воздух', en: 'Air' } },
  ];

  const fullPack = miniPack([gasCollector, airSeparation], fluids);
  const tags = buildTagIndexFromMeta(fullPack);
  const attachIndex = buildRecipeFlowAttachIndex(fullPack.recipes, tags);

  it('resolves centrifuge from gas collector earth air output', () => {
    const flow = { fluidId: 'gtceu:air', amount: 10_000 };
    const machineIds = machineIdsForFlowAttach(attachIndex, flow, 'downstream', tags);
    expect(machineIds.has('gtceu:centrifuge')).toBe(true);

    const recipesById = new Map(fullPack.recipes.map((r) => [r.id, r]));
    const candidates = findAttachCandidatesFromIndex(
      fullPack,
      attachIndex,
      recipesById,
      flow,
      'downstream',
      'ru',
      tags,
    );
    expect(candidates.some((c) => c.recipeId === 'gtceu:centrifuge/air_separation')).toBe(true);
  });

  it('resolves gas collector upstream from centrifuge air input tag', () => {
    const flow = { fluidId: '#forge:air', amount: 10_000 };
    const recipesById = new Map(fullPack.recipes.map((r) => [r.id, r]));
    const candidates = findAttachCandidatesFromIndex(
      fullPack,
      attachIndex,
      recipesById,
      flow,
      'upstream',
      'ru',
      tags,
    );
    expect(candidates.some((c) => c.recipeId === 'gtceu:gas_collector/air')).toBe(true);
  });

  it('dedupes @lcr mirror when native large chemical reactor recipe exists', () => {
    const body = {
      machineId: 'gtceu:large_chemical_reactor',
      inputs: [
        { fluidId: '#forge:air', amount: 3000 },
        { fluidId: '#forge:vinyl_acetate', amount: 144 },
      ],
      outputs: [{ fluidId: 'gtceu:polyvinyl_acetate', amount: 144 }],
      durationTicks: 200,
    };
    const native: Recipe = { id: 'gtceu:large_chemical_reactor/pva_from_air', ...body };
    const mirror: Recipe = { id: 'gtceu:chemical_reactor/pva_from_air@lcr', ...body };
    const pack = miniPack([native, mirror], fluids);
    const packTags = buildTagIndexFromMeta(pack);
    const index = buildRecipeFlowAttachIndex(pack.recipes, packTags);
    const recipesById = new Map(pack.recipes.map((r) => [r.id, r]));
    const candidates = findAttachCandidatesFromIndex(
      pack,
      index,
      recipesById,
      { fluidId: 'gtceu:polyvinyl_acetate', amount: 144 },
      'upstream',
      'ru',
      packTags,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.recipeId).toBe('gtceu:large_chemical_reactor/pva_from_air');
  });
});
