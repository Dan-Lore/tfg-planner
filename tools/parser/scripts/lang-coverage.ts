import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLangBundle } from '../src/lang/build-lang-bundle.js';
import { resolveLangBundleOptions } from '../src/lang/lang-bundle-options.js';
import { buildModIndex } from '../src/lockfile/parse-pakku.js';
import { buildLangCoverageReport } from '../src/lang/lang-coverage-report.js';
import type { PackMeta, Recipe } from '../../../src/data/types.js';

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
const art = JSON.parse(
  gunzipSync(readFileSync(join(packDir, 'pack.lang.json.gz'))).toString(),
) as { resolved: Record<string, { ru: string; en: string }>; bundle: { ru: Record<string, string>; en: Record<string, string> } };

const modIndex = buildModIndex(modpackRoot, tag);
const langOpts = resolveLangBundleOptions(process.argv, cacheRoot);
const { bundle: fullBundle } = await buildLangBundle(modpackRoot, modIndex, cacheRoot, langOpts);

const itemIds = meta.items.filter((d) => !d.id.startsWith('#')).map((d) => d.id);
const fluidIds = meta.fluids.filter((d) => !d.id.startsWith('#')).map((d) => d.id);
const tagIds = [...meta.items, ...meta.fluids].filter((d) => d.id.startsWith('#')).map((d) => d.id);

const report = buildLangCoverageReport(
  itemIds,
  fluidIds,
  tagIds,
  art.resolved,
  fullBundle,
);

console.log('recipeIoLocalized', `${Math.round(report.recipeIoLocalized * 100)}%`);
console.log('recipeIoTagsLocalized', `${Math.round(report.recipeIoTagsLocalized * 100)}%`);
console.log('langAchievableCeiling', `${Math.round(report.langAchievableCeiling * 100)}%`);
console.log('by namespace:');
for (const [ns, stats] of Object.entries(report.langCoverageByNamespace).sort(
  (a, b) => a[1].ratio - b[1].ratio,
)) {
  console.log(`  ${ns}: ${Math.round(stats.ratio * 100)}% (${stats.localized}/${stats.total})`);
}
console.log('miss reasons:', report.langMissByReason);

const reportPath = join(packDir, 'build-report.json');
const buildReport = existsSync(reportPath)
  ? JSON.parse(readFileSync(reportPath, 'utf8'))
  : { modpackVersion: tag, tag, stats: {}, warnings: [], unparsedFiles: [] };

buildReport.stats = {
  ...buildReport.stats,
  recipeIoLocalized: report.recipeIoLocalized,
  recipeIoTagsLocalized: report.recipeIoTagsLocalized,
  recipeIoItemsLocalized: report.recipeIoItemsLocalized,
  recipeIoFluidsLocalized: report.recipeIoFluidsLocalized,
  recipeIoTotal: report.recipeIoTotal,
  recipeIoTagsTotal: report.recipeIoTagsTotal,
};
buildReport.langCoverageByNamespace = report.langCoverageByNamespace;
buildReport.langMissByReason = report.langMissByReason;
buildReport.langMissSample = report.langMissSample;
buildReport.langUnlocalizableSample = report.langUnlocalizableSample;
buildReport.langAchievableCeiling = report.langAchievableCeiling;
buildReport.generatedAt = new Date().toISOString();

writeFileSync(reportPath, `${JSON.stringify(buildReport, null, 2)}\n`);
console.log('Updated', reportPath);
