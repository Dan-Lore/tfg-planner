import { describe, expect, it } from 'vitest';
import type { PackData } from '@/data/types';
import { runSchemeCheck } from '@/scheme-check/run-scheme-check';
import type { TfgpFile } from '@/schema/tfgp';

const pack: PackData = {
  format: 'tfg-pack-data',
  formatVersion: 1,
  modpackVersion: 'test',
  dataVersion: 1,
  generatedAt: '',
  machines: [],
  items: [{ id: 'charcoal', names: { ru: 'x', en: 'x' } }],
  fluids: [],
  recipes: [
    {
      id: 'tower',
      machineId: 'tower',
      durationTicks: 100,
      inputs: [
        { itemId: 'charcoal', amount: 2 },
        { itemId: 'creosote', amount: 1 },
      ],
      outputs: [{ itemId: 'tar', amount: 1 }],
    },
  ],
};

const scheme: TfgpFile = {
  format: 'tfg-planner-graph',
  formatVersion: 1,
  meta: {
    name: 'test',
    author: '',
    createdAt: '',
    updatedAt: '',
    description: '',
  },
  modpack: { version: 'test', dataVersion: 1 },
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    {
      id: 'tower',
      machineId: 'tower',
      recipeId: 'tower',
      machineCount: 1,
      overclock: 1,
      parallel: 1,
      voltageTier: 'LV',
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
  groups: [],
  targets: [],
};

describe('runSchemeCheck', () => {
  it('returns structural warnings without flowResult', () => {
    const result = runSchemeCheck(scheme, pack, null);
    expect(result.issues.some((i) => i.code === 'disconnected_input')).toBe(true);
    expect(result.issues[0]?.context?.productId).toBeDefined();
  });
});
