import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import type { PackMeta, Recipe } from '@/data/types';
import { buildRecipeFlowAttachIndex } from '@/lib/recipe-flow-attach-index';
import { buildTagIndexForRecipes, buildTagIndexFromMeta } from '@/lib/tag-index';

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
      const outPath = join(RECIPES_DIR, 'flow-index.json');
      writeFileSync(outPath, JSON.stringify(buildRecipeFlowAttachIndex(recipes, tags)));
      // eslint-disable-next-line no-console
      console.log(`Wrote ${outPath} (${recipes.length} recipes)`);
    },
    120_000,
  );
});
