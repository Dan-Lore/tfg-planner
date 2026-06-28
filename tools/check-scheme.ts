import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseTfgp } from '@/schema/tfgp';
import type { PackData, PackMeta, Recipe, RecipeShardIndex } from '@/data/types';
import { machineIdsForRecipeIds, recipeIdsFromSchemeNodes, sliceAsPackData } from '@/data/pack-slice';
import type { TfgpFile } from '@/schema/tfgp';
import { checkScheme, formatSchemeCheckReport } from '@/scheme-check/check-scheme';
import { runSolver } from '@/stores/editor-utils';

function usage(): never {
  console.error('Usage: npm run check-scheme -- <file.tfgp> [--json]');
  process.exit(2);
}

function loadMonolithPack(version: string): PackData {
  const packPath = path.join('public', 'data', 'packs', version, 'pack.json');
  if (!existsSync(packPath)) {
    console.error(`Pack data not found: ${packPath}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(packPath, 'utf8')) as PackData;
}

function loadShardedPack(version: string, scheme: TfgpFile): PackData {
  const dir = path.join('public', 'data', 'packs', version);
  const metaPath = path.join(dir, 'pack.meta.json');
  const indexPath = path.join(dir, 'recipes', 'index.json');
  if (!existsSync(metaPath) || !existsSync(indexPath)) {
    console.error(`Sharded pack not found under ${dir}`);
    process.exit(1);
  }

  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as PackMeta;
  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as RecipeShardIndex;
  const recipeIds = recipeIdsFromSchemeNodes(scheme.nodes);
  const machineIds = machineIdsForRecipeIds(meta, recipeIds);
  const recipes: Recipe[] = [];

  for (const machineId of machineIds) {
    const entry = index.shards[machineId];
    if (!entry) continue;
    const shardPath = path.join(dir, 'recipes', entry.file);
    const shard = JSON.parse(readFileSync(shardPath, 'utf8')) as Recipe[];
    for (const recipe of shard) {
      if (recipeIds.has(recipe.id)) recipes.push(recipe);
    }
  }

  return sliceAsPackData({ meta, recipes });
}

function loadPackForScheme(scheme: TfgpFile): PackData {
  const version = scheme.modpack.version;
  const metaPath = path.join('public', 'data', 'packs', version, 'pack.meta.json');
  if (existsSync(metaPath)) {
    return loadShardedPack(version, scheme);
  }
  return loadMonolithPack(version);
}

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  usage();
}

const jsonMode = args.includes('--json');
const schemePath = args.find((a) => !a.startsWith('--'));
if (!schemePath) {
  usage();
}

const resolved = path.resolve(schemePath);
const scheme = parseTfgp(readFileSync(resolved, 'utf8'));
const pack = loadPackForScheme(scheme);
const snap = {
  nodes: scheme.nodes,
  edges: scheme.edges,
  targets: scheme.targets,
  viewport: scheme.viewport,
};
const flowResult = runSolver(snap, pack, { preserveManualMachineCounts: true });
const result = checkScheme(scheme, pack, { flowResult });

if (jsonMode) {
  console.log(
    JSON.stringify(
      result,
      (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
      2,
    ),
  );
} else {
  console.log(formatSchemeCheckReport(result));
}

process.exit(result.ok ? 0 : 1);
