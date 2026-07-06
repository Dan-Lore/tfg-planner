import { describe, expect, it } from 'vitest';
import { isSchemeNonEmpty, shouldWarnVersionMismatch } from '@/lib/version-mismatch';
import { createEmptyTfgp } from '@/schema/tfgp';

describe('version-mismatch', () => {
  it('detects modpack version mismatch on import', () => {
    expect(
      shouldWarnVersionMismatch('0.12.7', 1, {
        modpackVersion: '0.12.8',
        dataVersion: 1,
        status: 'ready',
        path: 'public/data/packs/0.12.8',
      }),
    ).toBe(true);
    expect(
      shouldWarnVersionMismatch('0.12.8', 1, {
        modpackVersion: '0.12.8',
        dataVersion: 1,
        status: 'ready',
        path: 'public/data/packs/0.12.8',
      }),
    ).toBe(false);
  });

  it('detects non-empty scheme', () => {
    const empty = createEmptyTfgp('0.12.8', 1);
    expect(isSchemeNonEmpty(empty)).toBe(false);
    expect(
      isSchemeNonEmpty({
        ...empty,
        nodes: [
          {
            id: 'n1',
            machineId: 'm',
            recipeId: 'r',
            position: { x: 0, y: 0 },
            machineCount: 1,
            overclock: 1,
            voltageTier: 'LV',
          },
        ],
      }),
    ).toBe(true);
  });
});
