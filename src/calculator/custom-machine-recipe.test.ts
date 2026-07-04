import { describe, expect, it } from 'vitest';
import {
  buildRecipeMap,
  customMachineAsRecipe,
  customMachineRecipeId,
  isSchemeCustomMachine,
  resolveNodeRecipe,
} from './custom-machine-recipe';
import type { SchemeNode } from './flow-solver-types';
import { minimalPack } from '@/test-fixtures/minimal-pack';

function customNode(overrides: Partial<SchemeNode> = {}): SchemeNode {
  return {
    id: 'cm1',
    kind: 'custom_machine',
    machineId: '__custom__',
    recipeId: customMachineRecipeId('cm1'),
    machineCount: 1,
    overclock: 1,
    voltageTier: 'LV',
    durationTicks: 20,
    customInputs: [{ itemId: 'gtceu:crushed_copper_ore', amount: 2 }],
    customOutputs: [{ itemId: 'gtceu:copper_ingot', amount: 1 }],
    ...overrides,
  };
}

describe('custom-machine-recipe', () => {
  it('builds synthetic recipe from custom node ports', () => {
    const node = customNode();
    expect(isSchemeCustomMachine(node)).toBe(true);
    const recipe = customMachineAsRecipe(node);
    expect(recipe?.id).toBe('custom:cm1');
    expect(recipe?.inputs).toEqual([{ itemId: 'gtceu:crushed_copper_ore', amount: 2 }]);
    expect(recipe?.outputs).toEqual([{ itemId: 'gtceu:copper_ingot', amount: 1 }]);
    expect(recipe?.durationTicks).toBe(20);
    expect(recipe?.energy).toBeUndefined();
  });

  it('returns undefined when custom node has no outputs', () => {
    expect(customMachineAsRecipe(customNode({ customOutputs: [] }))).toBeUndefined();
  });

  it('merges custom recipes into buildRecipeMap', () => {
    const node = customNode();
    const map = buildRecipeMap(minimalPack, [node]);
    expect(map.get('custom:cm1')).toBeDefined();
    expect(resolveNodeRecipe(node, map)?.outputs[0]?.itemId).toBe('gtceu:copper_ingot');
  });
});
