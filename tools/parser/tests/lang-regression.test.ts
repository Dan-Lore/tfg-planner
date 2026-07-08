import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateLangCoverageFromReport } from '../src/validate/lang-gate.js';
import type { BuildReport } from '../src/types.js';

const baselineDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'lang-baseline');

function loadBaseline(tag: string) {
  const path = join(baselineDir, `${tag}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as {
    recipeIoLocalized: number;
    recipeIoTagsLocalized: number;
  };
}

describe('lang regression baseline', () => {
  it('0.12.8 baseline file exists and matches gate floors', () => {
    const baseline = loadBaseline('0.12.8');
    expect(baseline).not.toBeNull();
    expect(baseline!.recipeIoLocalized).toBeGreaterThanOrEqual(0.749);
    expect(baseline!.recipeIoTagsLocalized).toBeGreaterThanOrEqual(0.813);
  });

  it('validateLangCoverageFromReport rejects regression below baseline', () => {
    const baseline = loadBaseline('0.12.8')!;
    const report: BuildReport = {
      modpackVersion: '0.12.8',
      tag: '0.12.8',
      generatedAt: '2026-01-01',
      stats: {
        snapshotRecipes: 0,
        snapshotFiles: 0,
        snapshotParsed: 0,
        snapshotSkipped: 0,
        finalRecipes: 1,
        machines: 1,
        items: 1,
        fluids: 0,
        recipesWithEnergy: 0,
        recipeIoLocalized: baseline.recipeIoLocalized - 0.01,
        recipeIoTagsLocalized: baseline.recipeIoTagsLocalized,
      },
      warnings: [],
      unparsedFiles: [],
      langCoverageByNamespace: { forge: { localized: 1, total: 1, ratio: 1 } },
    };
    const errors = validateLangCoverageFromReport(report);
    expect(errors.some((e) => e.includes('recipeIoLocalized'))).toBe(true);
  });
});
