#!/usr/bin/env node
/**
 * One-time bootstrap: copy recipes from an existing pack.json into snapshot format.
 * Use until generate-tfg-snapshot has been run for the tag.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..', '..');

const tag = process.argv[2] ?? '0.12.8';
const packPath = process.argv[3] ?? join(repoRoot, 'public', 'data', 'packs', tag, 'pack.json');
const snapshotDir = join(repoRoot, 'tools', 'parser', 'snapshots', tag);

const pack = JSON.parse(readFileSync(packPath, 'utf-8'));
const recipes = pack.recipes.map((r) => ({
  id: r.id,
  machineId: r.machineId,
  inputs: r.inputs,
  outputs: r.outputs,
  durationTicks: r.durationTicks,
  ...(r.energy ? { energy: r.energy } : {}),
  source: `bootstrap:${packPath}`,
}));

mkdirSync(snapshotDir, { recursive: true });
const recipesPath = join(snapshotDir, 'recipes.json');
writeFileSync(recipesPath, JSON.stringify(recipes, null, 2));

const pakkuLockPath = join(repoRoot, '.cache', 'modpack', tag, `Modpack-Modern-${tag}`, 'pakku-lock.json');
let pakkuLockSha256 = 'bootstrap';
try {
  pakkuLockSha256 = createHash('sha256').update(readFileSync(pakkuLockPath)).digest('hex');
} catch {
  /* modpack not fetched yet */
}

const markerRecipeIds = [
  'gtceu:pyrolyse_oven/log_to_charcoal_byproducts',
  'gtceu:distill_charcoal_byproducts',
  'gtceu:distill_wood_tar',
].filter((id) => recipes.some((r) => r.id === id));

const manifest = {
  schemaVersion: 1,
  modpackTag: tag,
  pakkuLockSha256,
  recipeCount: recipes.length,
  exportedAt: new Date().toISOString(),
  markerRecipeIds,
  snapshotSha256: createHash('sha256').update(readFileSync(recipesPath)).digest('hex'),
  source: 'bootstrap-from-pack',
};

writeFileSync(join(snapshotDir, 'snapshot-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Bootstrap snapshot: ${snapshotDir} (${recipes.length} recipes)`);
