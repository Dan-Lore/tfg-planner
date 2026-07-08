import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLangBundle } from '../src/lang/build-lang-bundle.js';
import { resolveLangBundleOptions } from '../src/lang/lang-bundle-options.js';
import { buildModIndex } from '../src/lockfile/parse-pakku.js';
import { exportPackLang } from '../src/lang/export-pack-lang.js';
import { buildLangCoverageReport } from '../src/lang/lang-coverage-report.js';
import { ProductLexicon } from '../../../src/lib/product-lexicon/index.js';
import { buildTagIndexForRecipes, buildTagIndexFromMeta } from '../../../src/lib/tag-index.js';
import type { PackData, PackMeta, Recipe } from '../../../src/data/types.js';

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
    recipes.push(
      ...JSON.parse(readFileSync(join(packDir, 'recipes', entry.file), 'utf8')),
    );
  }
  return recipes;
}

let modpackRoot: string | null = null;
for (const entry of readdirSync(join(cacheRoot, 'modpack'))) {
  const candidate = join(cacheRoot, 'modpack', entry, `Modpack-Modern-${tag}`);
  try {
    readFileSync(join(candidate, 'pakku-lock.json'));
    modpackRoot = candidate;
    break;
  } catch {
    /* next */
  }
}
if (!modpackRoot) throw new Error(`Modpack ${tag} not in cache`);

const meta = JSON.parse(readFileSync(join(packDir, 'pack.meta.json'), 'utf8')) as PackMeta;
const recipes = loadRecipesFromShards(packDir);
const modIndex = buildModIndex(modpackRoot, tag);
const langOpts = resolveLangBundleOptions(process.argv, cacheRoot);
const { bundle } = await buildLangBundle(modpackRoot, modIndex, cacheRoot, langOpts);

const tagIndex = buildTagIndexForRecipes(
  { items: meta.items, fluids: meta.fluids },
  recipes,
  buildTagIndexFromMeta({ items: meta.items, fluids: meta.fluids }),
);
const resolveOpts = { tagIndex };
const lexicon = new ProductLexicon(bundle);

for (const def of [...meta.items, ...meta.fluids]) {
  def.names = lexicon.resolvePair(def.id, resolveOpts);
}

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

writeFileSync(join(packDir, 'pack.meta.json'), JSON.stringify(meta));

const langExport = exportPackLang(pack, bundle);
writeFileSync(join(packDir, 'pack.lang.json.gz'), langExport.gzipBytes);

const coverage = buildLangCoverageReport(
  pack.items.filter((d) => !d.id.startsWith('#')).map((d) => d.id),
  pack.fluids.filter((d) => !d.id.startsWith('#')).map((d) => d.id),
  [...pack.items, ...pack.fluids].filter((d) => d.id.startsWith('#')).map((d) => d.id),
  langExport.artifact.resolved ?? {},
  bundle,
);

const manifestPath = join(packDir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.langSha256 = langExport.sha256;
manifest.langBytes = langExport.gzipBytes.length;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const reportPath = join(packDir, 'build-report.json');
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
report.langCoverageByNamespace = coverage.langCoverageByNamespace;
report.langMissByReason = coverage.langMissByReason;
report.langMissSample = coverage.langMissSample;
report.langUnlocalizableSample = coverage.langUnlocalizableSample;
report.langAchievableCeiling = coverage.langAchievableCeiling;
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log('recanonicalized pack.meta names');
console.log('recipeIoLocalized', `${Math.round(coverage.recipeIoLocalized * 100)}%`);
console.log('recipeIoTagsLocalized', `${Math.round(coverage.recipeIoTagsLocalized * 100)}%`);
console.log('langAchievableCeiling', `${Math.round(coverage.langAchievableCeiling * 100)}%`);
