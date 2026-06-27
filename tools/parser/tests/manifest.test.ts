import { describe, expect, it } from 'vitest';
import {
  markerPresent,
  validateManifest,
  type SnapshotManifest,
} from '../src/snapshot/manifest.js';

function baseManifest(overrides: Partial<SnapshotManifest> = {}): SnapshotManifest {
  return {
    schemaVersion: 2,
    modpackTag: '0.12.8',
    pakkuLockSha256: 'test',
    recipeCount: 45_000,
    exportedAt: new Date().toISOString(),
    markerRecipeIds: [
      'tfg:tfc_wood_sapling_pine/1',
      'tfg:raw_aromatic_mix_charcoal_hydrogen',
      'tfg:aromatic_feedstock@lcr',
      'tfg:reformed_aromatic_feedstock@lcr',
      'tfg:reformate_gas_cracker',
      'gtceu:pyrolyse_oven/log_to_charcoal_byproducts',
      'gtceu:distillation_tower/distill_wood_tar',
    ],
    typeCounts: {
      'gtceu:greenhouse': 1130,
      'gtceu:coal_liquefaction_tower': 12,
    },
    serializeStats: { primary: 40_000, fallback: 5_000, dropped: 0 },
    ...overrides,
  };
}

describe('validateManifest', () => {
  it('passes when markers, counts, and machines are present', () => {
    const ids = new Set([
      'tfg:tfc_wood_sapling_pine/1',
      'tfg:raw_aromatic_mix_charcoal_hydrogen',
      'tfg:aromatic_feedstock@lcr',
      'tfg:reformed_aromatic_feedstock@lcr',
      'tfg:reformate_gas_cracker',
      'gtceu:pyrolyse_oven/log_to_charcoal_byproducts',
      'gtceu:distillation_tower/distill_wood_tar',
      'tfg:other/1',
    ]);
    for (let i = 0; i < 3000; i++) ids.add(`tfg:dummy/${i}`);
    const recipes = [
      ...Array.from({ length: 1130 }, (_, i) => ({
        id: `tfg:greenhouse/${i}`,
        machineId: 'gtceu:greenhouse',
      })),
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `tfg:liquefaction/${i}`,
        machineId: 'gtceu:coal_liquefaction_tower',
      })),
    ];
    const errors = validateManifest(baseManifest(), ids, '0.12.8', recipes);
    expect(errors).toEqual([]);
  });

  it('fails when greenhouse recipes are missing', () => {
    const ids = new Set(['tfg:tfc_wood_sapling_pine/1']);
    const errors = validateManifest(baseManifest(), ids, '0.12.8', [
      { id: 'tfg:tfc_wood_sapling_pine/1', machineId: 'gtceu:greenhouse' },
    ]);
    expect(errors.some((e) => e.includes('gtceu:greenhouse'))).toBe(true);
  });

  it('resolves marker aliases', () => {
    expect(
      markerPresent(
        new Set(['gtceu:distillation_tower/distill_wood_tar']),
        'gtceu:distillation_tower/distill_wood_tar',
      ),
    ).toBe(true);
  });
});
