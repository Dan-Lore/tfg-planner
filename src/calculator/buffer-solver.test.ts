import { describe, expect, it } from 'vitest';
import { solveFlows } from '@/calculator/flow-solver';
import type { PackData } from '@/data/types';

const pack: PackData = {
  format: 'tfg-pack-data',
  formatVersion: 1,
  modpackVersion: 'test',
  dataVersion: 1,
  generatedAt: '2026-06-17T00:00:00Z',
  machines: [],
  items: [],
  fluids: [],
  recipes: [
    {
      id: 'feeder',
      machineId: 'm0',
      durationTicks: 20,
      inputs: [],
      outputs: [{ itemId: 'ore', amount: 1 }],
    },
    {
      id: 'consumer',
      machineId: 'm1',
      durationTicks: 20,
      inputs: [{ itemId: 'ore', amount: 1 }],
      outputs: [{ itemId: 'ingot', amount: 1 }],
    },
  ],
};

describe('buffer nodes in solveFlows', () => {
  it('start buffer rate mode supplies downstream demand', () => {
    const result = solveFlows({
      pack,
      nodes: [
        {
          id: 'start',
          kind: 'start_buffer',
          machineId: '',
          recipeId: '',
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV',
          itemId: 'ore',
          supplyMode: 'rate',
          supplyRate: 100,
          autoSupplyRate: true,
          capacity: 3600,
        },
        {
          id: 'c',
          kind: 'machine',
          machineId: 'm1',
          recipeId: 'consumer',
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV',
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'start',
          sourcePort: 'out_0',
          target: 'c',
          targetPort: 'in_0',
          itemId: 'ore',
        },
      ],
      targets: [],
    });

    const flow = result.edgeFlows.e1?.toNumber() ?? 0;
    expect(flow).toBeCloseTo(1, 5);
  });

  it('start buffer stock mode caps at initialStock / horizon', () => {
    const result = solveFlows({
      pack,
      nodes: [
        {
          id: 'start',
          kind: 'start_buffer',
          machineId: '',
          recipeId: '',
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV',
          itemId: 'ore',
          supplyMode: 'stock',
          initialStock: 3600,
          capacity: 3600,
        },
        {
          id: 'c',
          kind: 'machine',
          machineId: 'm1',
          recipeId: 'consumer',
          machineCount: 5,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV',
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'start',
          sourcePort: 'out_0',
          target: 'c',
          targetPort: 'in_0',
          itemId: 'ore',
        },
      ],
      targets: [],
    });

    const flow = result.edgeFlows.e1?.toNumber() ?? 0;
    expect(flow).toBeCloseTo(1, 5);
  });

  it('intermediate buffer passes through up to inflow', () => {
    const result = solveFlows({
      pack,
      nodes: [
        {
          id: 'src',
          kind: 'machine',
          machineId: 'm0',
          recipeId: 'feeder',
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV',
        },
        {
          id: 'buf',
          kind: 'intermediate_buffer',
          machineId: '',
          recipeId: '',
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV',
          itemId: 'ore',
          capacity: 3600,
        },
        {
          id: 'c',
          kind: 'machine',
          machineId: 'm1',
          recipeId: 'consumer',
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV',
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'src',
          sourcePort: 'out_0',
          target: 'buf',
          targetPort: 'in_0',
          itemId: 'ore',
        },
        {
          id: 'e2',
          source: 'buf',
          sourcePort: 'out_0',
          target: 'c',
          targetPort: 'in_0',
          itemId: 'ore',
        },
      ],
      targets: [],
    });

    expect(result.edgeFlows.e2?.toNumber()).toBeCloseTo(1, 5);
  });

  it('intermediate buffer throttle limits outflow', () => {
    const result = solveFlows({
      pack,
      nodes: [
        {
          id: 'src',
          kind: 'machine',
          machineId: 'm0',
          recipeId: 'feeder',
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV',
        },
        {
          id: 'buf',
          kind: 'intermediate_buffer',
          machineId: '',
          recipeId: '',
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV',
          itemId: 'ore',
          capacity: 1800,
        },
        {
          id: 'c',
          kind: 'machine',
          machineId: 'm1',
          recipeId: 'consumer',
          machineCount: 10,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV',
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'src',
          sourcePort: 'out_0',
          target: 'buf',
          targetPort: 'in_0',
          itemId: 'ore',
        },
        {
          id: 'e2',
          source: 'buf',
          sourcePort: 'out_0',
          target: 'c',
          targetPort: 'in_0',
          itemId: 'ore',
        },
      ],
      targets: [],
    });

    const out = result.edgeFlows.e2?.toNumber() ?? 0;
    expect(out).toBeLessThanOrEqual(0.5 + 1e-6);
    expect(out).toBeGreaterThan(0);
  });

  it('end buffer accepts inflow with no outputs', () => {
    const result = solveFlows({
      pack,
      nodes: [
        {
          id: 'src',
          kind: 'machine',
          machineId: 'm0',
          recipeId: 'feeder',
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV',
        },
        {
          id: 'end',
          kind: 'end_buffer',
          machineId: '',
          recipeId: '',
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV',
          itemId: 'ore',
          capacity: 3600,
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'src',
          sourcePort: 'out_0',
          target: 'end',
          targetPort: 'in_0',
          itemId: 'ore',
        },
      ],
      targets: [],
    });

    expect(result.edgeFlows.e1?.toNumber()).toBeCloseTo(1, 5);
    expect(result.nodeSurplus.end?.ore?.toNumber()).toBeCloseTo(1, 5);
  });
});
