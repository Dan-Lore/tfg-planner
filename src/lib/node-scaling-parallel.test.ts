import { describe, expect, it } from 'vitest';
import { normalizeNodeScaling } from '@/lib/node-scaling';
import type { TfgpMachineNode } from '@/schema/tfgp-types';

describe('parallel normalization', () => {
  it('merges parallel into machineCount on normalize', () => {
    const node: TfgpMachineNode = {
      id: 'n1',
      position: { x: 0, y: 0 },
      machineId: 'm1',
      recipeId: 'r1',
      voltageTier: 'LV',
      overclock: 1,
      parallel: 3,
      machineCount: 2,
    };
    const out = normalizeNodeScaling(node) as TfgpMachineNode;
    expect(out.machineCount).toBe(6);
    expect(out.parallel).toBe(1);
  });
});
