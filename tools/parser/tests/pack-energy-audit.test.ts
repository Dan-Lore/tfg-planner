import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PackData } from '../../../src/data/types.js';

const packPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'public',
  'data',
  'packs',
  '0.12.8',
  'pack.json',
);

describe('pack energy audit (0.12.8)', () => {
  it('all singleblock recipes with energy have amperage ≤ 1', () => {
    if (!existsSync(packPath)) {
      throw new Error(`Pack not found: ${packPath}. Run npm run build-pack -- 0.12.8`);
    }
    const pack = JSON.parse(readFileSync(packPath, 'utf8')) as PackData;
    const machineKind = new Map(pack.machines.map((m) => [m.id, m.kind]));

    const violations: string[] = [];
    for (const recipe of pack.recipes) {
      if (!recipe.energy) continue;
      if (machineKind.get(recipe.machineId) !== 'singleblock') continue;
      if (recipe.energy.amperage > 1 + 1e-6) {
        violations.push(
          `${recipe.id}: ${recipe.energy.minVoltageTier} ${recipe.energy.amperage}A`,
        );
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('pyrolyse log_to_charcoal_byproducts is not ULV 12A', () => {
    if (!existsSync(packPath)) return;
    const pack = JSON.parse(readFileSync(packPath, 'utf8')) as PackData;
    const recipe = pack.recipes.find(
      (r) => r.id === 'gtceu:pyrolyse_oven/log_to_charcoal_byproducts',
    );
    expect(recipe?.energy).toBeDefined();
    expect(recipe!.energy!.minVoltageTier).not.toBe('ULV');
    expect(recipe!.energy!.amperage).toBeLessThanOrEqual(4);
  });
});
