import { describe, expect, it, beforeEach } from 'vitest';
import type { PackData } from '@/data/types';
import {
  clearLayoutWidthGroupCache,
  resolveMachineNodeLayoutWidths,
} from '@/lib/layout-width-store';

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
    { id: 'ore', names: { ru: 'ore', en: 'ore' } },
    { id: 'ingot', names: { ru: 'ingot', en: 'ingot' } },
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
    {
      id: 'furnace',
      machineId: 'furnace',
      durationTicks: 100,
      inputs: [{ itemId: 'ore', amount: 1 }],
      outputs: [{ itemId: 'ingot', amount: 1 }],
    },
  ],
};

const t = ((key: string, opts?: { count?: number; value?: string | number }) => {
  if (key === 'editor.machinesMeta') return `${opts?.count}×`;
  if (key === 'editor.overclockMeta') return `OC ${opts?.value}`;
  if (key === 'editor.tierMeta') return String(opts?.value);
  return key;
}) as never;

describe('layout-width-store', () => {
  beforeEach(() => {
    clearLayoutWidthGroupCache();
  });

  it('keeps mixer group width when only a furnace node is added', () => {
    const mixerNodes = [
      {
        id: 'm1',
        machineId: 'mixer',
        recipeId: 'short',
        position: { x: 0, y: 0 },
        machineCount: 1,
        overclock: 1,
        parallel: 1,
        voltageTier: 'LV' as const,
      },
      {
        id: 'm2',
        machineId: 'mixer',
        recipeId: 'long',
        position: { x: 200, y: 0 },
        machineCount: 1,
        overclock: 1,
        parallel: 1,
        voltageTier: 'LV' as const,
      },
    ];
    const baseInput = {
      nodes: [
        ...mixerNodes,
        {
          id: 'f1',
          machineId: 'furnace',
          recipeId: 'furnace',
          position: { x: 0, y: 200 },
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV' as const,
        },
      ],
      edges: [],
      pack,
      lang: 'en' as const,
      connectedIn: new Map(),
      connectedOut: new Map(),
      t,
      packEpoch: 1,
    };

    const before = resolveMachineNodeLayoutWidths(baseInput);
    const after = resolveMachineNodeLayoutWidths({
      ...baseInput,
      nodes: [
        ...baseInput.nodes,
        {
          id: 'f2',
          machineId: 'furnace',
          recipeId: 'furnace',
          position: { x: 200, y: 200 },
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV' as const,
        },
      ],
    });

    expect(after.m1).toBe(before.m1);
    expect(after.m2).toBe(before.m2);
    expect(after.f1).toBe(before.f1);
    expect(after.f2).toBe(after.f1);
  });

  it('assigns unified width within a machineId group', () => {
    const widths = resolveMachineNodeLayoutWidths({
      nodes: [
        {
          id: 'm1',
          machineId: 'mixer',
          recipeId: 'short',
          position: { x: 0, y: 0 },
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV' as const,
        },
        {
          id: 'm2',
          machineId: 'mixer',
          recipeId: 'long',
          position: { x: 200, y: 0 },
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV' as const,
        },
      ],
      edges: [],
      pack,
      lang: 'en',
      connectedIn: new Map(),
      connectedOut: new Map(),
      t,
      packEpoch: 1,
    });

    expect(widths.m1).toBe(widths.m2);
    expect(widths.m1).toBeGreaterThan(200);
  });
});
