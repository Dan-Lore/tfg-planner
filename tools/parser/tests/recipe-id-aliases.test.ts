import { describe, it, expect } from 'vitest';
import { expandRecipeSchemeAliases } from '../src/pipeline/recipe-id-aliases.js';
import type { RecipeOp } from '../src/types.js';

describe('expandRecipeSchemeAliases', () => {
  it('clones greenhouse export id to canonical scheme id', () => {
    const base: RecipeOp = {
      id: 'tfg:greenhouse/8x_tfc_wood_sapling_pine/1',
      machineId: 'gtceu:greenhouse',
      inputs: [{ itemId: 'tfc:wood/sapling/pine', amount: 8 }],
      outputs: [{ itemId: 'tfc:wood/log/pine', amount: 64 }],
      durationTicks: 12000,
      source: 'export',
    };
    const expanded = expandRecipeSchemeAliases([base]);
    expect(expanded).toHaveLength(2);
    expect(expanded.some((r) => r.id === 'tfg:tfc_wood_sapling_pine/1')).toBe(true);
  });
});
