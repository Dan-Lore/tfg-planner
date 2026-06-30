import { describe, expect, it, beforeEach } from 'vitest';
import type { PackData } from '@/data/types';
import {
  buildLayoutWidthInput,
  clearLayoutWidthCache,
  getCachedMachineNodeLayoutWidths,
  recipeHydrationCount,
} from '@/lib/layout-width-cache';

const pack: PackData = {
  format: 'tfg-pack-data',
  formatVersion: 1,
  modpackVersion: 'test',
  dataVersion: 1,
  generatedAt: '2026-06-17T00:00:00Z',
  machines: [],
  items: [
    { id: 'a', names: { ru: 'a', en: 'a' } },
    { id: 'very_long_ingredient_name_alpha', names: { ru: 'very_long_ingredient_name_alpha', en: 'very_long_ingredient_name_alpha' } },
    { id: 'out', names: { ru: 'out', en: 'out' } },
  ],
  fluids: [],
  recipes: [
    {
      id: 'short',
      machineId: 'mixer',
      durationTicks: 100,
      inputs: [{ itemId: 'a', amount: 1 }],
      outputs: [{ itemId: 'out', amount: 1 }],
    },
    {
      id: 'long',
      machineId: 'mixer',
      durationTicks: 100,
      inputs: [
        { itemId: 'very_long_ingredient_name_alpha', amount: 1 },
        { itemId: 'a', amount: 1 },
      ],
      outputs: [{ itemId: 'out', amount: 1 }],
    },
  ],
};

const nodes = [
  {
    id: 'm1',
    machineId: 'mixer',
    recipeId: 'long',
    position: { x: 0, y: 0 },
    machineCount: 1,
    overclock: 1,
    parallel: 1,
    voltageTier: 'LV' as const,
  },
];

const t = ((key: string, opts?: { count?: number; value?: string | number }) => {
  if (key === 'editor.machinesMeta') return `${opts?.count}×`;
  if (key === 'editor.overclockMeta') return `OC ${opts?.value}`;
  if (key === 'editor.tierMeta') return String(opts?.value);
  return key;
}) as never;

describe('layout-width-cache', () => {
  beforeEach(() => {
    clearLayoutWidthCache();
  });

  it('counts hydrated machine recipes', () => {
    expect(recipeHydrationCount(nodes, pack)).toBe(1);
  });

  it('recomputes widths when packEpoch changes', () => {
    const base = buildLayoutWidthInput(
      nodes,
      [],
      'rev',
      'en',
      pack,
      undefined,
      new Map(),
      new Map(),
      t,
      0,
    );
    const epoch0 = getCachedMachineNodeLayoutWidths(base);
    const epoch1 = getCachedMachineNodeLayoutWidths({ ...base, packEpoch: 1 });
    expect(epoch0.m1).toBeGreaterThan(200);
    expect(epoch1.m1).toBe(epoch0.m1);
  });

  it('grows width after recipe hydration signature changes', () => {
    const emptyPack: PackData = { ...pack, recipes: [] };
    const stubEdges = [
      {
        id: 'e1',
        source: 'src',
        target: 'm1',
        sourcePort: 'out_0',
        targetPort: 'in_0',
        itemId: 'very_long_ingredient_name_alpha',
      },
    ];
    const before = getCachedMachineNodeLayoutWidths(
      buildLayoutWidthInput(
        nodes,
        stubEdges,
        'rev',
        'en',
        emptyPack,
        undefined,
        new Map([['m1', new Set(['in_0'])]]),
        new Map(),
        t,
        0,
      ),
    );
    const after = getCachedMachineNodeLayoutWidths(
      buildLayoutWidthInput(
        nodes,
        [],
        'rev',
        'en',
        pack,
        undefined,
        new Map(),
        new Map(),
        t,
        1,
      ),
    );
    expect(after.m1).toBeGreaterThanOrEqual(before.m1!);
    expect(after.m1).toBeGreaterThan(200);
  });
});
