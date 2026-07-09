import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PackMeta, Recipe } from '@/data/types';
import { buildRecipeFlowAttachIndex } from '@/lib/recipe-flow-attach-index';
import { buildTagIndexForRecipes, buildTagIndexFromMeta } from '@/shared/tag-index';

const PACK_DIR = join(process.cwd(), 'public/data/packs/0.12.8');
const RECIPES_DIR = join(PACK_DIR, 'recipes');

describe('generate flow-index', () => {
  it(
    'writes flow-index.json from existing shards',
    () => {
      const recipes: Recipe[] = [];
      for (const file of readdirSync(RECIPES_DIR)) {
        if (!file.endsWith('.json') || file === 'index.json' || file === 'flow-index.json') {
          continue;
        }
        recipes.push(...(JSON.parse(readFileSync(join(RECIPES_DIR, file), 'utf8')) as Recipe[]));
      }
      const meta = JSON.parse(readFileSync(join(PACK_DIR, 'pack.meta.json'), 'utf8')) as PackMeta;
      const tags = buildTagIndexForRecipes(meta, recipes, buildTagIndexFromMeta(meta));
      const outDir = mkdtempSync(join(tmpdir(), 'tfg-flow-index-'));
      const outPath = join(outDir, 'flow-index.json');
      const index = buildRecipeFlowAttachIndex(recipes, tags);
      writeFileSync(outPath, JSON.stringify(index));
      expect(recipes.length).toBeGreaterThan(50_000);
      const sizeMb = Buffer.byteLength(JSON.stringify(index)) / (1024 * 1024);
      expect(sizeMb).toBeLessThan(50);
      // eslint-disable-next-line no-console
      console.log(`Wrote ${outPath} (${recipes.length} recipes, ${sizeMb.toFixed(1)} MB)`);
    },
    120_000,
  );
});
