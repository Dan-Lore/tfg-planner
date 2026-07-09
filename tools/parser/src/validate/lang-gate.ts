import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { isFallbackName } from '../../../../src/shared/product-lexicon/lang-keys.js';
import type { PackLangArtifact } from '../../../../src/shared/product-lexicon/types.js';
import type { BuildReport } from '../types.js';
import { effectiveLangFloors, validateLangRegression } from './lang-baseline.js';

const LANG_SMOKE_TAGS = [
  '#forge:sulfuric_acid',
  '#forge:purified_ores/chalcopyrite',
  '#gtceu:circuits/mv',
  '#gtceu:batteries/lv',
] as const;

const DEFAULT_MIN_RECIPE_IO_LOCALIZED = 0.749;
const DEFAULT_MIN_TAG_LOCALIZED = 0.813;

export function validateLangArtifact(packDir: string): string[] {
  const errors: string[] = [];
  const manifestPath = join(packDir, 'manifest.json');
  if (!existsSync(manifestPath)) return errors;

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    langPath?: string;
    langSha256?: string;
  };
  if (!manifest.langPath) {
    errors.push('manifest.json missing langPath');
    return errors;
  }
  const langFile = join(packDir, manifest.langPath);
  if (!existsSync(langFile)) {
    errors.push(`Missing lang artifact: ${langFile}`);
  }
  return errors;
}

export function validateLangSmokeTags(packDir: string): string[] {
  const errors: string[] = [];
  const manifestPath = join(packDir, 'manifest.json');
  if (!existsSync(manifestPath)) return errors;

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { langPath?: string };
  if (!manifest.langPath) return errors;

  const langFile = join(packDir, manifest.langPath);
  if (!existsSync(langFile)) return errors;

  const artifact = JSON.parse(gunzipSync(readFileSync(langFile)).toString()) as PackLangArtifact;
  const resolved = artifact.resolved ?? {};

  for (const id of LANG_SMOKE_TAGS) {
    const names = resolved[id];
    if (!names) {
      errors.push(`lang smoke: missing resolved entry for ${id}`);
      continue;
    }
    if (isFallbackName(id, names)) {
      errors.push(`lang smoke: ${id} still fallback (${names.ru})`);
    }
  }
  return errors;
}

export function validateLangCoverageFromReport(report: BuildReport): string[] {
  const errors: string[] = [];
  const floors = effectiveLangFloors(report.modpackVersion, {
    overall: DEFAULT_MIN_RECIPE_IO_LOCALIZED,
    tags: DEFAULT_MIN_TAG_LOCALIZED,
  });

  const overall = report.stats.recipeIoLocalized;
  const tags = report.stats.recipeIoTagsLocalized;
  if (overall == null || tags == null) {
    errors.push('build-report.json missing recipeIoLocalized metrics (re-run build-pack or parser:recanonicalize-lang)');
    return errors;
  }
  if (overall < floors.overall) {
    errors.push(
      `recipeIoLocalized ${(overall * 100).toFixed(1)}% < ${(floors.overall * 100).toFixed(1)}%`,
    );
  }
  if (tags < floors.tags) {
    errors.push(`recipeIoTagsLocalized ${(tags * 100).toFixed(1)}% < ${(floors.tags * 100).toFixed(1)}%`);
  }
  if (report.langAchievableCeiling != null && overall > report.langAchievableCeiling + 0.001) {
    errors.push(
      `recipeIoLocalized ${(overall * 100).toFixed(1)}% exceeds langAchievableCeiling ${(report.langAchievableCeiling * 100).toFixed(1)}%`,
    );
  }
  if (!report.langCoverageByNamespace || Object.keys(report.langCoverageByNamespace).length === 0) {
    errors.push('build-report.json missing langCoverageByNamespace (run parser:lang-coverage)');
  }

  errors.push(...validateLangRegression(report));
  return errors;
}
