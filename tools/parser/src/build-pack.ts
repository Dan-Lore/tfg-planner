import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchModpackTag } from './fetch/modpack-fetch.js';
import { buildModIndex } from './lockfile/parse-pakku.js';
import { normalizePack } from './pipeline/normalize.js';
import { sanitizeRecipeFlows } from './pipeline/sanitize-flows.js';
import { sanitizeRecipeEnergy } from './pipeline/sanitize-energy.js';
import { buildLangBundle } from './lang/build-lang-bundle.js';
import { countNamedDefs } from './lang/resolve-name.js';
import { loadTfgExcludes } from './datapack/excludes.js';
import { validatePackSchema, buildReportFromPack } from './validate/schema.js';
import { runSmokeChains } from './validate/smoke-chains.js';
import { loadGolden, diffAgainstGolden } from './validate/golden-diff.js';
import { isCircuitOnlyBrokenRecipe } from './pipeline/extract-circuit.js';
import { loadRecipeSnapshot } from './snapshot/load-recipe-snapshot.js';
import { defaultSnapshotDir } from './snapshot/manifest.js';
import { logStage, mapWithProgress } from './progress.js';
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

  logStage(`Fetching modpack tag ${tag}…`);
  const snapshot = await fetchModpackTag(tag, cacheDir);
  const modpackRoot = snapshot.rootDir;
  const indexOut = join(cacheDir, 'modpack', tag);
  logStage('Building mod index…');
  const modIndex = buildModIndex(modpackRoot, tag, indexOut);

  const excluded = loadTfgExcludes(modpackRoot);
  const parserRoot = join(__dirname, '..');
  const snapshotDir = options.snapshotDir ?? defaultSnapshotDir(parserRoot, tag);

  logStage(`Loading recipe snapshot from ${snapshotDir}…`);
  const snapshotLoad = loadRecipeSnapshot({
    snapshotDir,
    modpackTag: tag,
    strict: options.strictSnapshot,
  });
  warnings.push(...snapshotLoad.warnings);

  if (snapshotLoad.recipes.length === 0) {
    throw new Error(
      `No recipes loaded from snapshot at ${snapshotDir}. Run: npm run generate-tfg-snapshot -- ${tag}`,
    );
  }

  logStage(`Loaded ${snapshotLoad.recipes.length} recipes from snapshot`);
  let recipes = snapshotLoad.recipes.filter((r) => !excluded.has(r.id));
  if (excluded.size > 0) {
    logStage(`After excludes: ${recipes.length} recipes (${excluded.size} ids excluded)`);
  }

  const broken = recipes.filter(isCircuitOnlyBrokenRecipe);
  if (broken.length > 0) {
    warnings.push({
      file: 'snapshot',
      reason: `Dropped ${broken.length} circuit-only broken recipes (missing product I/O; re-export with GT JSON snapshot)`,
      kind: 'substrate',
    });
    const brokenIds = new Set(broken.map((r) => r.id));
    recipes = recipes.filter((r) => !brokenIds.has(r.id));
  }

  const missingOutputs = recipes.filter((r) => r.outputs.length === 0).length;
  if (missingOutputs > 0) {
    warnings.push({
      file: 'snapshot',
      reason: `${missingOutputs} recipes have no outputs after snapshot parse`,
      kind: 'substrate',
    });
  }

  recipes = mapWithProgress(recipes, 'Sanitizing flows', sanitizeRecipeFlows, {
    every: 5000,
    intervalMs: 20_000,
  });
  logStage('Sanitizing energy…');
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

  logStage('Building lang bundle…');
  const { bundle: langBundle, stats: langStats } = await buildLangBundle(
    modpackRoot,
    modIndex,
    cacheDir,
  );

  logStage(`Normalizing pack (${recipes.length} recipes)…`);
  const pack = normalizePack(recipes, tag, dataVersion, langBundle);
  logStage(`Pack normalized (${pack.recipes.length} recipes, ${pack.items.length} items)`);
  logStage('Summarizing lang coverage…');
  const allDefs = [...pack.items, ...pack.fluids];
  const itemCoverage = countNamedDefs(allDefs);
  const tagCoverage = countNamedDefs(allDefs.filter((d) => d.id.startsWith('#')));
  const gtceuCoverage = countNamedDefs(allDefs.filter((d) => d.id.startsWith('gtceu:')));
  const tfgCoverage = countNamedDefs(allDefs.filter((d) => d.id.startsWith('tfg:')));
  const mcCoverage = countNamedDefs(allDefs.filter((d) => d.id.startsWith('minecraft:')));
  const malformedIds = allDefs.filter((d) => /^\d+x\s/.test(d.id));
  warnings.push({
    file: 'lang',
    reason: `Localized ${itemCoverage.resolved}/${itemCoverage.total} resources (tags: ${tagCoverage.resolved}/${tagCoverage.total}, gtceu: ${gtceuCoverage.resolved}/${gtceuCoverage.total}, tfg: ${tfgCoverage.resolved}/${tfgCoverage.total}, minecraft: ${mcCoverage.resolved}/${mcCoverage.total}, malformed: ${malformedIds.length}; kubejs: ${langStats.kubejsFiles} files, jars: ${langStats.modJars}, mc keys ru/en: ${langStats.minecraftKeysRu}/${langStats.minecraftKeysEn}, keys ru/en: ${langStats.keysRu}/${langStats.keysEn})`,
  });

  logStage('Validating schema and smoke chains…');
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
      recipesMissingOutputs: missingOutputs,
      recipesCircuitOnlyDropped: broken.length,
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

  logStage('Serializing pack.json (may take 1–3 min)…');
  const packJson = JSON.stringify(pack, null, 2);
  logStage(`Writing ${Math.round(packJson.length / 1_048_576)} MiB to disk…`);
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
