import { describe, expect, it } from 'vitest';
import type { Recipe } from '@/data/types';
import { R } from '@/calculator/rational';
import { computeEffectivePortRates } from '@/calculator/flow-convergence';

describe('computeEffectivePortRates', () => {
  const recipe = {
    id: 'proc',
    machineId: 'proc',
    durationTicks: 100,
    inputs: [{ fluidId: 'gas', amount: 100 }],
    outputs: [
      { itemId: 'byproduct', amount: 1 },
      { fluidId: 'main', amount: 10 },
    ],
  } as Recipe;

  it('uses non-zero primary output port for input-limited scaling', () => {
    const theoretical = { out_0: R.from(2), out_1: R.from(10) };
    const inflows = { in_0: R.from(25) };
    const connected = new Set(['in_0']);

    const primaryOut = computeEffectivePortRates(
      recipe,
      theoretical,
      inflows,
      connected,
      undefined,
      1,
    );
    const legacyOut0 = computeEffectivePortRates(
      recipe,
      theoretical,
      inflows,
      connected,
      undefined,
      0,
    );

    expect(primaryOut.out_1!.toNumber()).toBeCloseTo(2.5);
    expect(legacyOut0.out_1!.toNumber()).toBeCloseTo(1.25);
  });
});
