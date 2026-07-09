import { describe, expect, it, vi } from 'vitest';
import type { Node } from '@xyflow/react';
import type { PackData } from '@/data/types';
import { wrapPackData } from '@/data/pack-runtime';
import { buildRfGraph } from '@/editor/build-rf-graph';
import type { TfgpFile } from '@/schema/tfgp';

const t = ((key: string) => key) as Parameters<typeof buildRfGraph>[0]['t'];

const emptyScheme: TfgpFile = {
  format: 'tfg-planner-graph',
  formatVersion: 1,
  meta: {
    name: 'test',
    author: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    description: '',
  },
  modpack: { version: 'test', dataVersion: 1 },
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [],
  edges: [],
  groups: [],
};

const pack: PackData = {
  format: 'tfg-pack-data',
  formatVersion: 1,
  modpackVersion: 'test',
  dataVersion: 1,
  generatedAt: '2026-06-17T00:00:00Z',
  machines: [],
  items: [{ id: 'a', names: { ru: 'a', en: 'a' } }],
  fluids: [],
  recipes: [
    {
      id: 'short',
      machineId: 'mixer',
      durationTicks: 100,
      inputs: [{ itemId: 'a', amount: 1 }],
      outputs: [{ itemId: 'a', amount: 1 }],
    },
  ],
};

const noop = vi.fn();

function baseParams(overrides: Partial<Parameters<typeof buildRfGraph>[0]> = {}) {
  return {
    scheme: emptyScheme,
    pack: null,
    flowResult: null,
    schemeCheckResult: null,
    lang: 'en' as const,
    packDisplayEpoch: 0,
    t,
    rfNodeCache: new Map<string, { sig: string; node: Node }>(),
    updateNode: noop,
    addCustomPort: noop,
    removeCustomPort: noop,
    handleRecipeChange: noop,
    handlePortContextMenu: noop,
    ...overrides,
  };
}

describe('buildRfGraph', () => {
  it('returns expected shape for empty scheme without pack', () => {
    const result = buildRfGraph(baseParams());

    expect(result.connectedPorts.inPorts).toBeInstanceOf(Map);
    expect(result.connectedPorts.outPorts).toBeInstanceOf(Map);
    expect(result.connectedPorts.inPorts.size).toBe(0);
    expect(result.connectedPorts.outPorts.size).toBe(0);
    expect(result.layoutWidthByNodeId).toEqual({});
    expect(result.flowEdgeData).toEqual({});
    expect(result.nodeDisplayById).toEqual({});
    expect(result.editorNodeActions).toMatchObject({
      onRecipeChange: noop,
      onPortContextMenu: noop,
    });
    expect(result.rfNodes).toEqual([]);
    expect(result.rfEdges).toEqual([]);
  });

  it('builds rfNodes for a single machine node when pack is present', () => {
    const scheme: TfgpFile = {
      ...emptyScheme,
      nodes: [
        {
          id: 'm1',
          machineId: 'mixer',
          recipeId: 'short',
          position: { x: 0, y: 0 },
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
        },
      ],
    };

    const result = buildRfGraph(
      baseParams({
        scheme,
        pack: wrapPackData(pack),
      }),
    );

    expect(result.rfNodes).toHaveLength(1);
    expect(result.rfNodes[0]?.id).toBe('m1');
    expect(result.nodeDisplayById.m1).toBeDefined();
    expect(result.layoutWidthByNodeId.m1).toBeGreaterThan(0);
    expect(result.rfEdges).toEqual([]);
  });
});
