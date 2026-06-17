import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchModpackTag } from './fetch/modpack-fetch.js';
import { buildModIndex } from './lockfile/parse-pakku.js';
import { listKubeJsFiles } from './kubejs/scanner.js';
import { parseKubeJsFile } from './kubejs/parse-file.js';
import { RecipeStore } from './pipeline/recipe-store.js';
import { applyRemoves } from './pipeline/apply-removes.js';
import { applyReplaces } from './pipeline/apply-replaces.js';
import { applyAdds } from './pipeline/apply-adds.js';
import { normalizePack } from './pipeline/normalize.js';
import { sanitizeAllFlows } from './pipeline/sanitize-flows.js';
import { buildLangBundle } from './lang/build-lang-bundle.js';
import { countResolved, resolveResourceName } from './lang/resolve-name.js';
import { loadDatapackRecipes } from './datapack/load-json.js';
import { loadTfgExcludes } from './datapack/excludes.js';
import { loadGtceuYaml } from './config/gtceu-yaml.js';
import { loadGtceuSubstrate } from './substrate/gtceu-jar.js';
import { validatePackSchema, buildReportFromPack } from './validate/schema.js';
import { runSmokeChains } from './validate/smoke-chains.js';
import { loadGolden, diffAgainstGolden } from './validate/golden-diff.js';
import type { BuildReport, ParseWarning, RecipeOp } from './types.js';
import type { RemoveSelector } from './kubejs/ast/extractors/remove.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface BuildPackOptions {
  tag: string;
  cacheDir: string;
  outDir: string;
  dataVersion?: number;
  skipSubstrate?: boolean;
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

export async function buildPack(options: BuildPackOptions): Promise<BuildPackResult> {
  const { tag, cacheDir, outDir } = options;
  const dataVersion = options.dataVersion ?? 1;
  const warnings: ParseWarning[] = [];
  const unparsedFiles: string[] = [];

  const snapshot = await fetchModpackTag(tag, cacheDir);
  const modpackRoot = snapshot.rootDir;
  const indexOut = join(cacheDir, 'modpack', tag);
  const modIndex = buildModIndex(modpackRoot, tag, indexOut);

  const excluded = loadTfgExcludes(modpackRoot);
  const yamlFlags = loadGtceuYaml(modpackRoot);
  if (yamlFlags.disabledRecipeGenerators.length > 0) {
    warnings.push({
      file: 'config/gtceu.yaml',
      reason: `Disabled GT generators: ${yamlFlags.disabledRecipeGenerators.length} entries`,
    });
  }

  const store = new RecipeStore();
  let substrateCount = 0;

  if (!options.skipSubstrate) {
    const substrate = await loadGtceuSubstrate(modIndex, cacheDir);
    if (substrate.warning) {
      warnings.push({ file: 'substrate/gtceu-jar', reason: substrate.warning });
    } else if (substrate.recipes.length === 0) {
      warnings.push({
        file: 'substrate/gtceu-jar',
        reason:
          'GTCEu JAR contains no static recipe JSON (runtime datagen); using KubeJS-effective recipes only',
      });
    }
    for (const r of substrate.recipes) {
      if (excluded.has(r.id)) continue;
      store.set(r);
      substrateCount++;
    }
  }

  const dataRoot = join(modpackRoot, 'kubejs', 'data');
  const datapackRecipes = loadDatapackRecipes(dataRoot);
  for (const r of datapackRecipes) {
    if (!excluded.has(r.id)) store.set(r);
  }

  const serverRoot = join(modpackRoot, 'kubejs', 'server_scripts');
  const files = listKubeJsFiles(serverRoot);

  const allRemoves: RemoveSelector[] = [];
  const allReplaces: import('./types.js').ReplaceOp[] = [];
  const kubejsAdds: RecipeOp[] = [];
  let filesScanned = 0;
  let filesUnparsed = 0;

  for (const file of files) {
    filesScanned++;
    const result = parseKubeJsFile(file);
    allRemoves.push(...result.removes);
    allReplaces.push(...result.replaces);
    kubejsAdds.push(...result.recipes);
    warnings.push(...result.warnings);
    if (result.parseFailed) {
      filesUnparsed++;
      unparsedFiles.push(file);
    }
  }

  const removeCount = applyRemoves(store, allRemoves);
  applyReplaces(store, allReplaces);
  applyAdds(store, kubejsAdds, allRemoves);

  const finalRecipes = store.values().filter((r) => !excluded.has(r.id));
  const sanitizedRecipes = sanitizeAllFlows(finalRecipes);

  const removesFile = join(serverRoot, 'gregtech', 'recipes.removes.js');
  const removesFileResult = parseKubeJsFile(removesFile);
  const removedIds = new Set<string>();
  for (const sel of removesFileResult.removes) {
    if (sel.id) removedIds.add(sel.id);
  }
  for (const id of removedIds) {
    if (finalRecipes.some((r) => r.id === id)) {
      warnings.push({
        file: 'gregtech/recipes.removes.js',
        reason: `Removed recipe id still present in pack: ${id}`,
      });
    }
  }

  const { bundle: langBundle, stats: langStats } = await buildLangBundle(
    modpackRoot,
    modIndex,
    cacheDir,
  );

  const pack = normalizePack(sanitizedRecipes, tag, dataVersion, langBundle);
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

  const report = buildReportFromPack(
    pack,
    tag,
    {
      substrateRecipes: substrateCount,
      datapackRecipes: datapackRecipes.length,
      kubejsRecipes: kubejsAdds.length,
      removes: removeCount,
      replaces: allReplaces.length,
      filesScanned,
      filesUnparsed,
      goldenMatched,
      goldenMismatched,
      goldenMissing,
    },
    warnings,
    unparsedFiles,
  );
  report.smokeResults = smokeResults;
  report.goldenDiff = goldenDiff;
  report.commitHint = snapshot.archiveUrl;

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
  });

  return { packPath, reportPath, manifestPath, report };
}
