import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PackData } from '@/data/types';
import type { TfgpFile } from '@/schema/tfgp';
import { parseTfgp } from '@/schema/tfgp';
import { checkScheme } from './check-scheme';

const miniPack: PackData = {
  format: 'tfg-pack-data',
  formatVersion: 1,
  modpackVersion: 'test',
  dataVersion: 1,
  generatedAt: '2026-06-28T00:00:00Z',
  machines: [],
  items: [{ id: 'charcoal', names: { ru: 'Уголь', en: 'Charcoal' } }],
  fluids: [],
  recipes: [
    {
      id: 'pyro',
      machineId: 'pyrolyse',
      durationTicks: 100,
      inputs: [{ itemId: 'log', amount: 1 }],
      outputs: [{ itemId: 'charcoal', amount: 1 }],
    },
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

function scheme(overrides: Partial<TfgpFile>): TfgpFile {
  return {
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
    nodes: [],
    edges: [],
    groups: [],
    targets: [],
    ...overrides,
  };
}

describe('checkScheme', () => {
  it('flags invalid target port that zeroes upstream output', () => {
    const file = scheme({
      nodes: [
        {
          id: 'pyro',
          machineId: 'pyrolyse',
          recipeId: 'pyro',
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV',
          position: { x: 0, y: 0 },
        },
        {
          id: 'tower',
          machineId: 'tower',
          recipeId: 'tower',
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV',
          position: { x: 100, y: 0 },
        },
      ],
      edges: [
        {
          id: 'e_bad',
          source: 'pyro',
          target: 'tower',
          sourcePort: 'out_0',
          targetPort: 'in_2',
          itemId: 'charcoal',
        },
        {
          id: 'e_ok',
          source: 'pyro',
          target: 'tower',
          sourcePort: 'out_0',
          targetPort: 'in_0',
          itemId: 'charcoal',
        },
      ],
    });

    const result = checkScheme(file, miniPack);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'invalid_target_port' && i.edgeId === 'e_bad')).toBe(
      true,
    );
  });

  it('reports disconnected recipe inputs', () => {
    const file = scheme({
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
    });

    const result = checkScheme(file, miniPack);
    expect(result.issues.some((i) => i.code === 'disconnected_input')).toBe(true);
  });

  it(
    'checks Untitled (29).tfgp for known wiring issues',
    () => {
    const raw = readFileSync('Untitled (29).tfgp', 'utf8');
    const file = parseTfgp(raw);
    const pack = JSON.parse(
      readFileSync(`public/data/packs/${file.modpack.version}/pack.json`, 'utf8'),
    ) as PackData;

    const result = checkScheme(file, pack);
    const invalidCharcoal = result.issues.filter(
      (i) => i.code === 'invalid_target_port' && i.edgeId === 'edge_85',
    );
    expect(invalidCharcoal.length).toBe(1);
    expect(result.issues.some((i) => i.code === 'disconnected_input' && i.nodeId === 'node_49')).toBe(
      true,
    );
  }, 15_000);
});
