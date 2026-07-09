import { describe, it, expect } from 'vitest';
import { loadRecipeSnapshot, validatePackSchema } from '../src/index.js';
import { normalizePack } from '../src/pipeline/normalize.js';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

describe('parser programmatic API', () => {
  it('loadRecipeSnapshot + normalizePack on inline snapshot', () => {
    const dir = join(tmpdir(), `tfgp-parser-api-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'recipes.json'),
      JSON.stringify([
        {
          id: 'gtceu:mixer/test',
          machineId: 'gtceu:mixer',
          inputs: [{ itemId: 'minecraft:cobblestone', amount: 1 }],
          outputs: [{ itemId: 'minecraft:stone', amount: 1 }],
          durationTicks: 100,
        },
      ]),
    );

    const loaded = loadRecipeSnapshot({
      snapshotDir: dir,
      modpackTag: 'test-api',
    });
    const pack = normalizePack(loaded.recipes, 'test-api', 1);
    expect(pack.recipes.length).toBe(1);
    expect(validatePackSchema(pack)).toEqual([]);

    rmSync(dir, { recursive: true, force: true });
  });
});
