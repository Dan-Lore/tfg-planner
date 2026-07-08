import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLangBundle } from '../src/lang/build-lang-bundle.js';
import { buildModIndex } from '../src/lockfile/parse-pakku.js';
import { exportPackLang } from '../src/lang/export-pack-lang.js';
import { computeRecipeIoLocalizedByKind } from '../src/lang/lang-coverage.js';
import type { PackData, Recipe } from '../../../src/data/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..', '..');
const tag = process.argv[2] ?? '0.12.8';
const packDir = join(root, 'public/data/packs', tag);
const cacheRoot = join(root, '.cache');

function loadRecipesFromShards(packDir: string): Recipe[] {
  const index = JSON.parse(
    readFileSync(join(packDir, 'recipes/index.json'), 'utf8'),
  ) as { shards: Record<string, { file: string }> };
  const recipes: Recipe[] = [];
  for (const entry of Object.values(index.shards)) {
    const shard = JSON.parse(
      readFileSync(join(packDir, 'recipes', entry.file), 'utf8'),
    ) as Recipe[];
    recipes.push(...shard);
  }
  return recipes;
}

const modpackDirs = join(cacheRoot, 'modpack');
let modpackRoot: string | null = null;
for (const entry of readdirSync(modpackDirs)) {
  const candidate = join(modpackDirs, entry, `Modpack-Modern-${tag}`);
  try {
    readFileSync(join(candidate, 'pakku-lock.json'));
    modpackRoot = candidate;
    break;
  } catch {
    /* next */
  }
}
if (!modpackRoot) throw new Error(`Modpack ${tag} not in .cache/modpack`);

const meta = JSON.parse(readFileSync(join(packDir, 'pack.meta.json'), 'utf8'));
const recipes = loadRecipesFromShards(packDir);
const pack: PackData = {
  format: 'tfg-pack-data',
  formatVersion: 1,
  modpackVersion: meta.modpackVersion,
  dataVersion: meta.dataVersion,
  generatedAt: meta.generatedAt,
  machines: meta.machines,
  items: meta.items,
  fluids: meta.fluids,
  recipes,
};

const modIndex = buildModIndex(modpackRoot, tag);
const { bundle } = await buildLangBundle(modpackRoot, modIndex, cacheRoot, {
  downloadModJars: false,
});

const langExport = exportPackLang(pack, bundle);
writeFileSync(join(packDir, 'pack.lang.json.gz'), langExport.gzipBytes);

const coverage = computeRecipeIoLocalizedByKind(
  pack.items.filter((d) => !d.id.startsWith('#')).map((d) => d.id),
  pack.fluids.filter((d) => !d.id.startsWith('#')).map((d) => d.id),
  [...pack.items, ...pack.fluids].filter((d) => d.id.startsWith('#')).map((d) => d.id),
  langExport.artifact.resolved ?? {},
);

const manifestPath = join(packDir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.langPath = 'pack.lang.json.gz';
manifest.langSha256 = langExport.sha256;
manifest.langBytes = langExport.gzipBytes.length;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const packsManifestPath = join(root, 'public/data/packs/manifest.json');
const packsManifest = JSON.parse(readFileSync(packsManifestPath, 'utf8'));
for (const entry of packsManifest.packs) {
  if (entry.modpackVersion === tag) {
    entry.langPath = 'pack.lang.json.gz';
    entry.langSha256 = langExport.sha256;
    entry.langBytes = langExport.gzipBytes.length;
  }
}
writeFileSync(packsManifestPath, `${JSON.stringify(packsManifest, null, 2)}\n`);

const reportPath = join(packDir, 'build-report.json');
if (existsSync(reportPath)) {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  report.stats = {
    ...report.stats,
    recipeIoLocalized: coverage.recipeIoLocalized,
    recipeIoTagsLocalized: coverage.recipeIoTagsLocalized,
    recipeIoItemsLocalized: coverage.recipeIoItemsLocalized,
    recipeIoFluidsLocalized: coverage.recipeIoFluidsLocalized,
    recipeIoTotal: coverage.recipeIoTotal,
    recipeIoTagsTotal: coverage.recipeIoTagsTotal,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

console.log('pack.lang.json.gz', langExport.gzipBytes.length, 'bytes');
console.log('recipeIoLocalized', `${Math.round(coverage.recipeIoLocalized * 100)}%`);
console.log('recipeIoTagsLocalized', `${Math.round(coverage.recipeIoTagsLocalized * 100)}%`);
