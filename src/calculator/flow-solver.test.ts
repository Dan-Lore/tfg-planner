import { describe, expect, it } from 'vitest';
import { ceilMachineCount, idealMachineCount } from './rounding';
import { R } from './rational';
import { solveFlows } from './flow-solver';
import type { PackData } from '@/data/types';

const samplePack: PackData = {
  format: 'tfg-pack-data',
  formatVersion: 1,
  modpackVersion: '0.12.8-sample',
  dataVersion: 1,
  generatedAt: '2026-06-17T00:00:00Z',
  machines: [],
  items: [],
  fluids: [],
  recipes: [
    {
      id: 'r1',
      machineId: 'm1',
      durationTicks: 20,
      inputs: [{ itemId: 'ore', amount: 1 }],
      outputs: [{ itemId: 'crushed', amount: 2 }],
    },
    {
      id: 'r2',
      machineId: 'm2',
      durationTicks: 20,
      inputs: [{ itemId: 'crushed', amount: 2 }],
      outputs: [{ itemId: 'ingot', amount: 1 }],
    },
  ],
};

describe('rounding', () => {
  it('ceil minimum 1', () => {
    expect(ceilMachineCount(R.from(0.1))).toBe(1);
    expect(ceilMachineCount(R.from(1))).toBe(1);
    expect(ceilMachineCount(R.from(1.1))).toBe(2);
    expect(ceilMachineCount(R.of(3, 2))).toBe(2);
  });

  it('ideal machine count', () => {
    expect(idealMachineCount(R.from(3), R.from(2)).toNumber()).toBe(1.5);
  });
});

describe('solveFlows', () => {
  it('linear chain with target', () => {
    const result = solveFlows({
      pack: samplePack,
      nodes: [
        {
          id: 'a',
          machineId: 'm1',
          recipeId: 'r1',
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          outputMultiplier: 1,
        },
        {
          id: 'b',
          machineId: 'm2',
          recipeId: 'r2',
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          outputMultiplier: 1,
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'a',
          target: 'b',
          itemId: 'crushed',
        },
      ],
      targets: [{ nodeId: 'b', itemId: 'ingot', ratePerSecond: 2.5 }],
    });

    expect(result.nodeMachineCounts['b']).toBeGreaterThanOrEqual(3);
    expect(result.edgeFlows['e1'].toNumber()).toBeGreaterThan(0);
  });
});
