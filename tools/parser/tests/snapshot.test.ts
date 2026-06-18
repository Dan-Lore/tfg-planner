import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadRecipeSnapshot } from '../src/snapshot/load-recipe-snapshot.js';
import { recipeFromSnapshotJson } from '../src/snapshot/recipe-json.js';

describe('recipeFromSnapshotJson', () => {
  it('parses flat RecipeOp export', () => {
    const { recipe } = recipeFromSnapshotJson('tfg:test', {
      id: 'tfg:test',
      machineId: 'gtceu:mixer',
      inputs: [{ fluidId: 'gtceu:wood_gas', amount: 1000 }],
      outputs: [{ fluidId: 'gtceu:methane', amount: 100 }],
      durationTicks: 100,
      energy: { euPerTick: 30 },
    }, 'test');
    expect(recipe?.machineId).toBe('gtceu:mixer');
    expect(recipe?.inputs[0].fluidId).toBe('gtceu:wood_gas');
  });

  it('parses GT 7.5 JSON with sized ingredients', () => {
    const { recipe } = recipeFromSnapshotJson(
      'gtceu:pyrolyse_oven/log_to_charcoal_byproducts',
      {
        type: 'gtceu:pyrolyse_oven',
        duration: 320,
        inputs: {
          item: [
            {
              content: {
                type: 'gtceu:sized',
                count: 16,
                ingredient: { tag: 'minecraft:logs_that_burn' },
              },
            },
          ],
          fluid: [
            {
              content: { fluid: 'gtceu:nitrogen', amount: 1000 },
            },
          ],
        },
        outputs: {
          item: [{ content: { item: 'minecraft:charcoal', amount: 20 } }],
          fluid: [{ content: { fluid: 'gtceu:charcoal_byproducts', amount: 4000 } }],
        },
        tickInputs: { eu: [{ content: 96 }] },
      },
      'fixture',
    );
    expect(recipe?.inputs).toEqual(
      expect.arrayContaining([
        { itemId: '#minecraft:logs_that_burn', amount: 16 },
        { fluidId: 'gtceu:nitrogen', amount: 1000 },
      ]),
    );
    expect(recipe?.energy?.euPerTick).toBe(96);
  });
});

describe('loadRecipeSnapshot', () => {
  it('loads recipes.json with manifest validation', () => {
    const dir = join(tmpdir(), `tfg-snap-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const recipes = [
      {
        id: 'gtceu:pyrolyse_oven/log_to_charcoal_byproducts',
        machineId: 'gtceu:pyrolyse_oven',
        inputs: [{ itemId: '#minecraft:logs_that_burn', amount: 16 }],
        outputs: [{ fluidId: 'gtceu:charcoal_byproducts', amount: 4000 }],
        durationTicks: 320,
      },
      {
        id: 'gtceu:distill_charcoal_byproducts',
        machineId: 'gtceu:distillation_tower',
        inputs: [{ fluidId: 'gtceu:charcoal_byproducts', amount: 1000 }],
        outputs: [{ fluidId: 'gtceu:wood_tar', amount: 250 }],
        durationTicks: 40,
      },
      {
        id: 'gtceu:distill_wood_tar',
        machineId: 'gtceu:distillation_tower',
        inputs: [{ fluidId: 'gtceu:wood_tar', amount: 1000 }],
        outputs: [{ fluidId: 'gtceu:creosote', amount: 300 }],
        durationTicks: 40,
      },
    ];
    writeFileSync(join(dir, 'recipes.json'), JSON.stringify(recipes));
    writeFileSync(
      join(dir, 'snapshot-manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        modpackTag: '0.12.8',
        pakkuLockSha256: 'test',
        recipeCount: recipes.length,
        exportedAt: new Date().toISOString(),
        markerRecipeIds: recipes.map((r) => r.id),
      }),
    );

    const result = loadRecipeSnapshot({
      snapshotDir: dir,
      modpackTag: '0.12.8',
    });
    expect(result.recipes).toHaveLength(3);
    expect(result.manifestOk).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});
