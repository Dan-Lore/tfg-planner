import { describe, expect, it } from 'vitest';
import { buildReportFromShardedMeta } from '../src/validate/schema.js';
import { mergeExistingLangReport } from '../src/validate/merge-lang-report.js';
import type { PackMeta } from '../../../src/data/types.js';
import type { BuildReport } from '../src/types.js';

const meta: PackMeta = {
  format: 'tfg-pack-data',
  formatVersion: 2,
  modpackVersion: '0.12.8-test',
  dataVersion: 1,
  generatedAt: '2026-01-01T00:00:00Z',
  machines: [{ id: 'm1', category: 'single', recipeIds: [], names: { ru: 'M', en: 'M' } }],
  items: [],
  fluids: [],
};

describe('mergeExistingLangReport', () => {
  it('preserves lang coverage fields when validate rebuilds schema report', () => {
    const fresh = buildReportFromShardedMeta(meta, '0.12.8-test', 3);
    const existing: BuildReport = {
      ...fresh,
      stats: {
        ...fresh.stats,
        recipeIoLocalized: 0.75,
        recipeIoTagsLocalized: 0.81,
        recipeIoItemsLocalized: 0.72,
        recipeIoFluidsLocalized: 0.93,
        recipeIoTotal: 100,
        recipeIoTagsTotal: 50,
      },
      langCoverageByNamespace: { forge: { localized: 1, total: 2, ratio: 0.5 } },
      langMissByReason: { no_lang_key: 3 },
      langMissSample: ['gtceu:test'],
      langUnlocalizableSample: ['tacz:gun'],
      langAchievableCeiling: 0.78,
    };

    const merged = mergeExistingLangReport({ ...fresh }, existing);
    expect(merged.stats.recipeIoLocalized).toBe(0.75);
    expect(merged.langCoverageByNamespace?.forge?.ratio).toBe(0.5);
    expect(merged.langAchievableCeiling).toBe(0.78);
    expect(merged.langMissSample).toEqual(['gtceu:test']);
  });
});

describe('lang bundle options', () => {
  it('respects --no-download-mod-jars flag', async () => {
    const { resolveLangBundleOptions } = await import('../src/lang/lang-bundle-options.js');
    expect(resolveLangBundleOptions(['node', 'script', '--no-download-mod-jars']).downloadModJars).toBe(
      false,
    );
    expect(resolveLangBundleOptions(['node', 'script', '--download-mod-jars']).downloadModJars).toBe(
      true,
    );
  });
});
