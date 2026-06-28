import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PackData, PackMeta, Recipe, RecipeShardIndex } from '../../../src/data/types.js';
import { sliceAsPackData } from '../../../src/data/pack-slice.js';

const packDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'public',
  'data',
  'packs',
  '0.12.8',
);

function loadMergedPack(): PackData {
  const metaPath = join(packDir, 'pack.meta.json');
  const monolithPath = join(packDir, 'pack.json');
  if (existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as PackMeta;
    const index = JSON.parse(
      readFileSync(join(packDir, 'recipes', 'index.json'), 'utf8'),
    ) as RecipeShardIndex;
    const recipes: Recipe[] = [];
    for (const entry of Object.values(index.shards)) {
      recipes.push(
        ...JSON.parse(readFileSync(join(packDir, 'recipes', entry.file), 'utf8')),
      );
    }
    return sliceAsPackData({ meta, recipes });
  }
  if (!existsSync(monolithPath)) {
    throw new Error(`Pack not found under ${packDir}. Run npm run build-pack -- 0.12.8`);
  }
  return JSON.parse(readFileSync(monolithPath, 'utf8')) as PackData;
}

export { loadMergedPack as loadTestPack0128, packDir };
