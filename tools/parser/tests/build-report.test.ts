import { describe, expect, it } from 'vitest';
import { buildReportFromShardedMeta } from '../src/validate/schema.js';
import type { PackMeta } from '../../../src/data/types.js';

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

describe('buildReportFromShardedMeta', () => {
  it('accepts recipesWithEnergy and recipesWithChance stats', () => {
    const report = buildReportFromShardedMeta(meta, '0.12.8-test', 3, {
      recipesWithEnergy: 2,
      recipesWithChance: 1,
    });
    expect(report.stats.finalRecipes).toBe(3);
    expect(report.stats.recipesWithEnergy).toBe(2);
    expect(report.stats.recipesWithChance).toBe(1);
  });
});
