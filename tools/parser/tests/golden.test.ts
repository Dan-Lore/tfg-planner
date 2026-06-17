import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGolden, diffAgainstGolden } from '../src/validate/golden-diff.js';
import { normalizePack } from '../src/pipeline/normalize.js';
import type { RecipeOp } from '../src/types.js';

const goldenDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'golden');

describe('golden diff', () => {
  it('matches fixture recipes against golden subset', () => {
    const recipes: RecipeOp[] = [
      {
        id: 'tfg:magnesium_diboride_cool_down',
        machineId: 'gtceu:chemical_bath',
        inputs: [
          { itemId: 'gtceu:hot_magnesium_diboride_ingot', amount: 1 },
          { fluidId: 'minecraft:water', amount: 100 },
        ],
        outputs: [{ itemId: 'gtceu:magnesium_diboride_ingot', amount: 1 }],
        durationTicks: 400,
        source: 'test',
      },
    ];
    const pack = normalizePack(recipes, '0.12.8', 1);
    const golden = loadGolden(join(goldenDir, '0.12.8.json'));
    expect(golden).not.toBeNull();
    const diff = diffAgainstGolden(pack, golden!);
    expect(diff.matched).toBeGreaterThanOrEqual(1);
  });
});
