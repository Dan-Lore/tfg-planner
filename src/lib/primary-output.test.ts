import { describe, expect, it } from 'vitest';
import { primaryOutputIndex, primaryOutputProductKey, primaryTheoreticalPortRate } from '@/lib/primary-output';
import type { Recipe } from '@/data/types';
import type { SchemeNode } from '@/calculator/flow-solver-types';
import { R } from '@/calculator/rational';

const recipe = {
  id: 'r1',
  machineId: 'm1',
  durationTicks: 100,
  inputs: [{ itemId: 'a', amount: 1 }],
  outputs: [
    { itemId: 'b', amount: 2 },
    { itemId: 'c', amount: 1 },
  ],
} as Recipe;

const node: SchemeNode = {
  id: 'n1',
  machineId: 'm1',
  recipeId: 'r1',
  machineCount: 1,
  overclock: 1,
  parallel: 1,
  voltageTier: 'LV',
  primaryOutputIndex: 1,
};

describe('primaryOutputIndex', () => {
  it('uses node primaryOutputIndex when valid', () => {
    expect(primaryOutputIndex(node, recipe)).toBe(1);
    expect(primaryOutputProductKey(node, recipe)).toBe('c');
  });

  it('falls back to 0 when index out of range', () => {
    expect(primaryOutputIndex({ ...node, primaryOutputIndex: 9 }, recipe)).toBe(0);
  });

  it('reads theoretical rate from primary output port', () => {
    const rates = { out_0: R.from(2), out_1: R.from(7) };
    expect(primaryTheoreticalPortRate(node, recipe, rates).toNumber()).toBe(7);
  });
});
