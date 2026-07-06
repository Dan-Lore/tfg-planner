import { describe, expect, it } from 'vitest';
import { pruneInvalidEdges } from '@/lib/prune-edges';
import type { PackData, Recipe } from '@/data/types';

function miniPack(recipes: Recipe[]): PackData {
  return {
    format: 'tfg-pack-data',
    formatVersion: 1,
    modpackVersion: 'test',
    dataVersion: 1,
    generatedAt: '2026-01-01T00:00:00.000Z',
    items: [],
    fluids: [],
    machines: [],
    recipes,
  } as PackData;
}

describe('pruneInvalidEdges', () => {
  it('removes edges with missing nodes', () => {
    const pack = miniPack([]);
    const nodes = [
      {
        id: 'n1',
        kind: 'machine' as const,
        machineId: 'm1',
        recipeId: 'r1',
        position: { x: 0, y: 0 },
        voltageTier: 'LV' as const,
        overclock: 1,
        machineCount: 1,
      },
    ];
    const edges = [
      {
        id: 'e1',
        source: 'n1',
        target: 'missing',
        sourcePort: 'out_0',
        targetPort: 'in_0',
        itemId: 'x',
      },
    ];
    expect(pruneInvalidEdges(edges, nodes, pack)).toHaveLength(0);
  });

  it('keeps edges with legacy input_* / output_* port ids', () => {
    const pack = miniPack([
      {
        id: 'r1',
        machineId: 'm1',
        durationTicks: 20,
        inputs: [{ itemId: 'y', amount: 1 }],
        outputs: [{ itemId: 'y', amount: 1 }],
      } as Recipe,
    ]);
    const nodes = [
      {
        id: 'n1',
        kind: 'machine' as const,
        machineId: 'm1',
        recipeId: 'r1',
        position: { x: 0, y: 0 },
        voltageTier: 'LV' as const,
        overclock: 1,
        machineCount: 1,
      },
      {
        id: 'n2',
        kind: 'machine' as const,
        machineId: 'm1',
        recipeId: 'r1',
        position: { x: 200, y: 0 },
        voltageTier: 'LV' as const,
        overclock: 1,
        machineCount: 1,
      },
    ];
    const edges = [
      {
        id: 'e1',
        source: 'n1',
        target: 'n2',
        sourcePort: 'output_0',
        targetPort: 'input_0',
        itemId: 'y',
      },
    ];
    expect(pruneInvalidEdges(edges, nodes, pack)).toHaveLength(1);
  });
});
