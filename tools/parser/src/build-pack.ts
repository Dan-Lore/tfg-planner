import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchModpackTag } from './fetch/modpack-fetch.js';
import { buildModIndex } from './lockfile/parse-pakku.js';
import { normalizePack } from './pipeline/normalize.js';
import { sanitizeAllFlows } from './pipeline/sanitize-flows.js';
import { sanitizeRecipeEnergy } from './pipeline/sanitize-energy.js';
import { buildLangBundle } from './lang/build-lang-bundle.js';
import { countResolved, resolveResourceName } from './lang/resolve-name.js';
import { loadTfgExcludes } from './datapack/excludes.js';
import { validatePackSchema, buildReportFromPack } from './validate/schema.js';
import { runSmokeChains } from './validate/smoke-chains.js';
import { loadGolden, diffAgainstGolden } from './validate/golden-diff.js';
import { enrichRecipeChances } from './pipeline/enrich-chances.js';
import { enrichRecipeEnergy } from './pipeline/enrich-energy.js';
import { loadRecipeSnapshot } from './snapshot/load-recipe-snapshot.js';
import { defaultSnapshotDir } from './snapshot/manifest.js';
import type { BuildReport, ParseWarning } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface BuildPackOptions {
  tag: string;
  cacheDir: string;
  outDir: string;
  dataVersion?: number;
  snapshotDir?: string;
  strictSnapshot?: boolean;
  goldenPath?: string;
}

export interface BuildPackResult {
  packPath: string;
  reportPath: string;
  manifestPath: string;
  report: BuildReport;
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function checksum(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function pakkuLockSha256(modpackRoot: string): string | undefined {
  const lockPath = join(modpackRoot, 'pakku-lock.json');
  if (!existsSync(lockPath)) return undefined;
  return createHash('sha256').update(readFileSync(lockPath)).digest('hex');
}

export async function buildPack(options: BuildPackOptions): Promise<BuildPackResult> {
  const { tag, cacheDir, outDir } = options;
  const dataVersion = options.dataVersion ?? 1;
  const warnings: ParseWarning[] = [];

  const snapshot = await fetchModpackTag(tag, cacheDir);
  const modpackRoot = snapshot.rootDir;
  const indexOut = join(cacheDir, 'modpack', tag);
  const modIndex = buildModIndex(modpackRoot, tag, indexOut);

  const excluded = loadTfgExcludes(modpackRoot);
  const parserRoot = join(__dirname, '..');
  const snapshotDir = options.snapshotDir ?? defaultSnapshotDir(parserRoot, tag);

  const snapshotLoad = loadRecipeSnapshot({
    snapshotDir,
    modpackTag: tag,
    strict: options.strictSnapshot,
  });
  warnings.push(...snapshotLoad.warnings);

  let recipes = snapshotLoad.recipes.filter((r) => !excluded.has(r.id));

  const chanceEnrich = enrichRecipeChances(recipes, modpackRoot);
  recipes = chanceEnrich.recipes;
  warnings.push({
    file: 'kubejs-chances',
    reason: `Enriched ${chanceEnrich.stats.enrichedRecipes} recipes (${chanceEnrich.stats.enrichedFlows} flows) from ${chanceEnrich.stats.kubejsRecipesWithChance} KubeJS recipes with chance data`,
  });

  const energyEnrich = enrichRecipeEnergy(recipes, modpackRoot);
  recipes = energyEnrich.recipes;
  warnings.push({
    file: 'kubejs-energy',
    reason: `Enriched ${energyEnrich.stats.enrichedRecipes} recipes from ${energyEnrich.stats.kubejsRecipesWithEnergy} KubeJS recipes with energy data`,
  });

  recipes = sanitizeAllFlows(recipes);
  const energySanitize = sanitizeRecipeEnergy(recipes);
  recipes = energySanitize.recipes;
  if (energySanitize.stats.singleblockAmperageOver1 > 0) {
    warnings.push({
      file: 'sanitize-energy',
      reason: `${energySanitize.stats.singleblockAmperageOver1} singleblock recipes with amperage > 1`,
    });
  }
  if (energySanitize.stats.energyInferAmbiguous > 0) {
    warnings.push({
      file: 'sanitize-energy',
      reason: `${energySanitize.stats.energyInferAmbiguous} recipes with ambiguous energy infer (LV fallback or non-standard amperage)`,
    });
  }

  const { bundle: langBundle, stats: langStats } = await buildLangBundle(
    modpackRoot,
    modIndex,
    cacheDir,
  );

  const pack = normalizePack(recipes, tag, dataVersion, langBundle);
  const itemIds = [...pack.items, ...pack.fluids].map((x) => x.id);
  const itemCoverage = countResolved(itemIds, langBundle, resolveResourceName);
  const tagIds = itemIds.filter((id) => id.startsWith('#'));
  const gtceuIds = itemIds.filter((id) => id.startsWith('gtceu:'));
  const tfgIds = itemIds.filter((id) => id.startsWith('tfg:'));
  const mcIds = itemIds.filter((id) => id.startsWith('minecraft:'));
  const malformedIds = itemIds.filter((id) => /^\d+x\s/.test(id));
  const tagCoverage = countResolved(tagIds, langBundle, resolveResourceName);
  const gtceuCoverage = countResolved(gtceuIds, langBundle, resolveResourceName);
  const tfgCoverage = countResolved(tfgIds, langBundle, resolveResourceName);
  const mcCoverage = countResolved(mcIds, langBundle, resolveResourceName);
  warnings.push({
    file: 'lang',
    reason: `Localized ${itemCoverage.resolved}/${itemCoverage.total} resources (tags: ${tagCoverage.resolved}/${tagCoverage.total}, gtceu: ${gtceuCoverage.resolved}/${gtceuCoverage.total}, tfg: ${tfgCoverage.resolved}/${tfgCoverage.total}, minecraft: ${mcCoverage.resolved}/${mcCoverage.total}, malformed: ${malformedIds.length}; kubejs: ${langStats.kubejsFiles} files, jars: ${langStats.modJars}, mc keys ru/en: ${langStats.minecraftKeysRu}/${langStats.minecraftKeysEn}, keys ru/en: ${langStats.keysRu}/${langStats.keysEn})`,
  });

  const schemaErrors = validatePackSchema(pack);
  for (const err of schemaErrors) {
    warnings.push({ file: 'pack.json', reason: err });
  }

  const smokeResults = runSmokeChains(pack);
  for (const s of smokeResults) {
    if (!s.ok) {
      warnings.push({ file: 'smoke-chains', reason: `${s.id}: ${s.reason}` });
    }
  }

  if (options.strictSnapshot) {
    const failed = smokeResults.filter((s) => !s.ok);
    if (failed.length > 0) {
      throw new Error(`Strict snapshot: smoke chains failed: ${failed.map((f) => f.id).join(', ')}`);
    }
    if (!snapshotLoad.manifestOk) {
      throw new Error('Strict snapshot: manifest validation failed');
    }
  }

  let goldenMatched: number | undefined;
  let goldenMismatched: number | undefined;
  let goldenMissing: number | undefined;
  let goldenDiff: BuildReport['goldenDiff'];

  const goldenPath =
    options.goldenPath ?? join(__dirname, '..', 'golden', `${tag}.json`);
  const golden = loadGolden(goldenPath);
  if (golden) {
    const diff = diffAgainstGolden(pack, golden);
    goldenMatched = diff.matched;
    goldenMismatched = diff.mismatched;
    goldenMissing = diff.missing;
    goldenDiff = diff.diffs;
    for (const d of diff.diffs.slice(0, 50)) {
      warnings.push({
        file: 'golden-diff',
        reason: `${d.id}.${d.field}: expected ${JSON.stringify(d.expected)}, got ${JSON.stringify(d.actual)}`,
      });
    }
  }

  const lockSha = pakkuLockSha256(modpackRoot);
  const report = buildReportFromPack(
    pack,
    tag,
    {
      snapshotRecipes: recipes.length,
      snapshotFiles: snapshotLoad.stats.files,
      snapshotParsed: snapshotLoad.stats.parsed,
      snapshotSkipped: snapshotLoad.stats.skipped,
      snapshotSha256: snapshotLoad.snapshotSha256 ?? snapshotLoad.manifest?.snapshotSha256,
      goldenMatched,
      goldenMismatched,
      goldenMissing,
      recipesWithChance: pack.recipes.filter((r) =>
        [...r.inputs, ...r.outputs].some(
          (f) => f.chance !== undefined && f.chance > 0 && f.chance < 10_000,
        ),
      ).length,
    },
    warnings,
    [],
  );
  report.smokeResults = smokeResults;
  report.goldenDiff = goldenDiff;
  report.commitHint = snapshot.archiveUrl;
  report.snapshotManifestOk = snapshotLoad.manifestOk;

  const packPath = join(outDir, 'pack.json');
  const reportPath = join(outDir, 'build-report.json');
  const manifestPath = join(outDir, 'manifest.json');

  const packJson = JSON.stringify(pack, null, 2);
  writeJson(packPath, pack);
  writeJson(reportPath, report);
  writeJson(manifestPath, {
    modpackVersion: tag,
    dataVersion,
    checksum: checksum(packJson),
    generatedAt: pack.generatedAt,
    source: snapshot.archiveUrl,
    snapshotSha256: snapshotLoad.snapshotSha256 ?? snapshotLoad.manifest?.snapshotSha256,
    pakkuLockSha256: lockSha,
    modpackTag: tag,
  });

  return { packPath, reportPath, manifestPath, report };
}
