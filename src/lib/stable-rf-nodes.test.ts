import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import type { PackData } from '@/data/types';
import { buildStableRfNodes } from '@/lib/stable-rf-nodes';

const pack: PackData = {
  format: 'tfg-pack-data',
  formatVersion: 1,
  modpackVersion: 'test',
  dataVersion: 1,
  generatedAt: '2026-06-17T00:00:00Z',
  machines: [],
  items: [{ id: 'a', names: { ru: 'a', en: 'a' } }, { id: 'out', names: { ru: 'out', en: 'out' } }],
  fluids: [],
  recipes: [
    {
      id: 'short',
      machineId: 'mixer',
      durationTicks: 100,
      inputs: [{ itemId: 'a', amount: 1 }],
      outputs: [{ itemId: 'out', amount: 1 }],
    },
  ],
};

describe('buildStableRfNodes', () => {
  it('reuses Node object identity when layout signature is unchanged', () => {
    const cache = new Map<string, { sig: string; node: Node }>();
    const nodes = [
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
        recipeId: 'short',
        position: { x: 240, y: 0 },
        machineCount: 1,
        overclock: 1,
        parallel: 1,
        voltageTier: 'LV' as const,
      },
    ];
    const ctx = {
      pack,
      edges: [],
      layoutWidthByNodeId: { m1: 280, m2: 280 },
    };

    const first = buildStableRfNodes(nodes, cache, ctx, () => ({}));
    const second = buildStableRfNodes(nodes, cache, ctx, () => ({}));

    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
  });

  it('rebuilds only nodes whose signature changed', () => {
    const cache = new Map<string, { sig: string; node: Node }>();
    const nodes = [
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
        recipeId: 'short',
        position: { x: 240, y: 0 },
        machineCount: 1,
        overclock: 1,
        parallel: 1,
        voltageTier: 'LV' as const,
      },
    ];
    const ctx = {
      pack,
      edges: [],
      layoutWidthByNodeId: { m1: 280, m2: 280 },
    };

    const first = buildStableRfNodes(nodes, cache, ctx, () => ({}));
    const moved = [
      nodes[0]!,
      { ...nodes[1]!, position: { x: 300, y: 0 } },
    ];
    const next = buildStableRfNodes(moved, cache, ctx, () => ({}));

    expect(next[0]).toBe(first[0]);
    expect(next[1]).not.toBe(first[1]);
    expect(next[1]?.position).toEqual({ x: 300, y: 0 });
  });
});
