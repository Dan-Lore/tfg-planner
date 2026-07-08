import { describe, expect, it } from 'vitest';
import { PackRuntime } from '@/data/pack-runtime';
import type { PackMeta, RecipeShardIndex } from '@/data/types';

const meta: PackMeta = {
  format: 'tfg-pack-data',
  formatVersion: 2,
  modpackVersion: '0.12.8-test',
  dataVersion: 1,
  generatedAt: '2026-01-01T00:00:00Z',
  machines: [],
  items: [],
  fluids: [],
};

const shardIndex: RecipeShardIndex = {
  format: 'tfg-pack-recipe-index',
  formatVersion: 1,
  shards: {},
};

describe('pack lang ready', () => {
  it('fires onLangReady listeners when lexicon is set', () => {
    const runtime = new PackRuntime(meta, '/recipes/', shardIndex);
    expect(runtime.langReady).toBe(false);

    let notified = false;
    const unsubscribe = runtime.onLangReady(() => {
      notified = true;
    });

    runtime.setLexicon({
      resolve: () => 'resolved',
      resolvePair: () => ({ ru: 'resolved', en: 'resolved' }),
      bundle: { ru: {}, en: {} },
      isReady: true,
    } as never);

    expect(runtime.langReady).toBe(true);
    expect(notified).toBe(true);
    unsubscribe();
  });
});
