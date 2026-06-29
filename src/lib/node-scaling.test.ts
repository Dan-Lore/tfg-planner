import { describe, expect, it } from 'vitest';
import { isMachineNode } from '@/lib/node-kind';
import type { TfgpMachineNode } from '@/schema/tfgp';
import { normalizeNodeScaling, type RawTfgpNode } from './node-scaling';

type LegacyMachineNode = TfgpMachineNode & { outputMultiplier?: number };

function machineInput(overrides: Partial<LegacyMachineNode> & Pick<TfgpMachineNode, 'id' | 'machineId' | 'recipeId' | 'position'>): RawTfgpNode {
  return {
    machineCount: 1,
    parallel: 1,
    overclock: 1,
    voltageTier: 'LV',
    ...overrides,
  };
}

describe('node-scaling', () => {
  it('merges legacy parallel into machine count', () => {
    const normalized = normalizeNodeScaling(
      machineInput({
        id: 'n1',
        machineId: 'm',
        recipeId: 'r',
        position: { x: 0, y: 0 },
        machineCount: 2,
        parallel: 3,
      }),
    );
    expect(isMachineNode(normalized) && normalized.machineCount).toBe(6);
    expect(isMachineNode(normalized) && normalized.parallel).toBe(1);
    expect(normalized).not.toHaveProperty('outputMultiplier');
  });

  it('migrates legacy outputMultiplier into machineCount', () => {
    const normalized = normalizeNodeScaling(
      machineInput({
        id: 'n1',
        machineId: 'm',
        recipeId: 'r',
        position: { x: 0, y: 0 },
        machineCount: 2,
        outputMultiplier: 1.5,
      }),
    );
    expect(isMachineNode(normalized) && normalized.machineCount).toBe(3);
    expect(normalized).not.toHaveProperty('outputMultiplier');
  });

  it('ignores outputMultiplier when it equals 1', () => {
    const normalized = normalizeNodeScaling(
      machineInput({
        id: 'n1',
        machineId: 'm',
        recipeId: 'r',
        position: { x: 0, y: 0 },
        machineCount: 4,
        outputMultiplier: 1,
      }),
    );
    expect(isMachineNode(normalized) && normalized.machineCount).toBe(4);
    expect(normalized).not.toHaveProperty('outputMultiplier');
  });
});
