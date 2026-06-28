#!/usr/bin/env node
/**
 * One-off: convert monolithic pack.json → v2 sharded layout (pack.meta.json + recipes/*).
 * Usage: node tools/shard-monolith-pack.mjs [versionDirName]
 */
import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const version = process.argv[2] ?? '0.12.8';
const outDir = join('public', 'data', 'packs', version);
const monolithPath = join(outDir, 'pack.json');

if (!existsSync(monolithPath)) {
  console.error(`Missing ${monolithPath}`);
  process.exit(1);
}

const pack = JSON.parse(readFileSync(monolithPath, 'utf8'));
if (!Array.isArray(pack.recipes)) {
  console.error('Not a monolithic pack (no recipes array)');
  process.exit(1);
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function shardFileName(machineId) {
  return `${machineId.replace(/[:/\\]/g, '__')}.json`;
}

const recipesDir = join(outDir, 'recipes');
const byMachine = new Map();
for (const recipe of pack.recipes) {
  const list = byMachine.get(recipe.machineId);
  if (list) list.push(recipe);
  else byMachine.set(recipe.machineId, [recipe]);
}

const shards = {};
for (const [machineId, recipes] of byMachine) {
  const file = shardFileName(machineId);
  shards[machineId] = { file, count: recipes.length };
  writeJson(join(recipesDir, file), recipes);
}

writeJson(join(recipesDir, 'index.json'), {
  format: 'tfg-pack-recipe-index',
  formatVersion: 1,
  shards,
});

const meta = {
  format: 'tfg-pack-data',
  formatVersion: 2,
  modpackVersion: pack.modpackVersion,
  dataVersion: pack.dataVersion,
  generatedAt: pack.generatedAt,
  machines: pack.machines,
  items: pack.items,
  fluids: pack.fluids,
};
writeJson(join(outDir, 'pack.meta.json'), meta);
unlinkSync(monolithPath);

console.log(
  `Sharded ${pack.recipes.length} recipes into ${byMachine.size} files under ${recipesDir}`,
);
