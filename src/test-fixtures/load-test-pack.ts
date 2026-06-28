import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { PackData, PackMeta, Recipe, RecipeShardIndex } from '@/data/types';
import { sliceAsPackData } from '@/data/pack-slice';

/** Load full pack for integration tests (v1 monolith or v2 merged shards). */
export function loadTestPack(version: string): PackData {
  const dir = path.join(process.cwd(), 'public', 'data', 'packs', version);
  const metaPath = path.join(dir, 'pack.meta.json');
  const monolithPath = path.join(dir, 'pack.json');

  if (existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as PackMeta;
    const index = JSON.parse(
      readFileSync(path.join(dir, 'recipes', 'index.json'), 'utf8'),
    ) as RecipeShardIndex;
    const recipes: Recipe[] = [];
    for (const entry of Object.values(index.shards)) {
      const shard = JSON.parse(
        readFileSync(path.join(dir, 'recipes', entry.file), 'utf8'),
      ) as Recipe[];
      recipes.push(...shard);
    }
    return sliceAsPackData({ meta, recipes });
  }

  if (!existsSync(monolithPath)) {
    throw new Error(`Test pack not found: ${dir} (run build-pack or shard-monolith)`);
  }
  return JSON.parse(readFileSync(monolithPath, 'utf8')) as PackData;
}

export { minimalPack } from './minimal-pack';
