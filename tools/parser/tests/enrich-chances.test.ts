import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enrichRecipeChances } from '../src/pipeline/enrich-chances.js';
import type { RecipeOp } from '../src/types.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const modpackFixture = join(fixtures, 'modpack-chances');

describe('enrichRecipeChances', () => {
  it('merges output chance from KubeJS fixtures onto snapshot recipes', () => {
    const snapshot: RecipeOp[] = [
      {
        id: 'tfg:cracker_off_gas_recycling',
        machineId: 'gtceu:chemical_reactor',
        inputs: [{ fluidId: 'tfg:cracker_off_gas', amount: 1000 }],
        outputs: [
          { fluidId: 'gtceu:carbon_dioxide', amount: 500 },
          { fluidId: 'gtceu:hydrogen', amount: 500 },
          { itemId: 'gtceu:tiny_rhenium_dust', amount: 1 },
        ],
        durationTicks: 100,
        source: 'snapshot',
      },
    ];

    const { recipes, stats } = enrichRecipeChances(snapshot, modpackFixture);
    expect(stats.kubejsRecipesWithChance).toBeGreaterThan(0);
    expect(stats.enrichedRecipes).toBe(1);
    expect(recipes[0]?.outputs[2]).toEqual({
      itemId: 'gtceu:tiny_rhenium_dust',
      amount: 1,
      chance: 1000,
    });
  });

  it('does not overwrite existing chance on snapshot flows', () => {
    const snapshot: RecipeOp[] = [
      {
        id: 'tfg:cracker_off_gas_recycling',
        machineId: 'gtceu:chemical_reactor',
        inputs: [],
        outputs: [{ itemId: 'gtceu:tiny_rhenium_dust', amount: 1, chance: 2000 }],
        durationTicks: 100,
        source: 'snapshot',
      },
    ];

    const { recipes } = enrichRecipeChances(snapshot, fixtures);
    expect(recipes[0]?.outputs[0]?.chance).toBe(2000);
  });
});
