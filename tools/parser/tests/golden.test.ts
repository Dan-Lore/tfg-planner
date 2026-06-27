import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGolden, diffAgainstGolden } from '../src/validate/golden-diff.js';
import { normalizePack } from '../src/pipeline/normalize.js';
import type { RecipeOp } from '../src/types.js';

const goldenDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'golden');

describe('golden diff', () => {
  it('matches golden marker recipes when present in pack input', () => {
    const golden = loadGolden(join(goldenDir, '0.12.8.json'));
    expect(golden).not.toBeNull();

    const recipes: RecipeOp[] = golden!.recipes.map((g) => ({
      id: g.id,
      machineId: g.machineId ?? 'gtceu:unknown',
      inputs: [{ itemId: 'minecraft:stone', amount: 1 }],
      outputs: [{ itemId: 'minecraft:cobblestone', amount: 1 }],
      durationTicks: g.durationTicks ?? 20,
      source: 'golden-test',
    }));

    const pack = normalizePack(recipes, '0.12.8', 1);
    const diff = diffAgainstGolden(pack, golden!);
    expect(diff.missing).toBe(0);
    expect(diff.matched).toBe(golden!.recipes.length);
  });
});
