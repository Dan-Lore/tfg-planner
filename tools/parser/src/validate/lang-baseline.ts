import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BuildReport } from '../types.js';

export interface LangBaseline {
  modpackVersion: string;
  recipeIoLocalized: number;
  recipeIoTagsLocalized: number;
  recipeIoItemsLocalized?: number;
  recipeIoFluidsLocalized?: number;
  langAchievableCeiling?: number;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadLangBaseline(modpackVersion: string): LangBaseline | null {
  const path = join(__dirname, '..', 'lang-baseline', `${modpackVersion}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as LangBaseline;
}

export function effectiveLangFloors(
  modpackVersion: string,
  defaults: { overall: number; tags: number },
): { overall: number; tags: number } {
  const baseline = loadLangBaseline(modpackVersion);
  if (!baseline) return defaults;
  return {
    overall: Math.min(baseline.recipeIoLocalized, defaults.overall),
    tags: Math.min(baseline.recipeIoTagsLocalized, defaults.tags),
  };
}

export function validateLangRegression(report: BuildReport): string[] {
  const baseline = loadLangBaseline(report.modpackVersion);
  if (!baseline) return [];

  const errors: string[] = [];
  const overall = report.stats.recipeIoLocalized;
  const tags = report.stats.recipeIoTagsLocalized;

  if (overall != null && overall + 1e-9 < baseline.recipeIoLocalized) {
    errors.push(
      `recipeIoLocalized regression: ${(overall * 100).toFixed(2)}% < baseline ${(baseline.recipeIoLocalized * 100).toFixed(2)}%`,
    );
  }
  if (tags != null && tags + 1e-9 < baseline.recipeIoTagsLocalized) {
    errors.push(
      `recipeIoTagsLocalized regression: ${(tags * 100).toFixed(2)}% < baseline ${(baseline.recipeIoTagsLocalized * 100).toFixed(2)}%`,
    );
  }
  return errors;
}
