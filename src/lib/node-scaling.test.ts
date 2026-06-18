import { describe, expect, it } from 'vitest';
import { normalizeNodeScaling, perMachineSpeedFactor } from './node-scaling';

describe('node-scaling', () => {
  it('combines per-machine factors without parallel', () => {
    expect(perMachineSpeedFactor(2, 1.5)).toBe(3);
  });

  it('merges legacy parallel into machine count', () => {
    const normalized = normalizeNodeScaling({
      id: 'n1',
      machineId: 'm',
      recipeId: 'r',
      position: { x: 0, y: 0 },
      machineCount: 2,
      parallel: 3,
      overclock: 1,
      outputMultiplier: 1,
    });
    expect(normalized.machineCount).toBe(6);
    expect(normalized.parallel).toBe(1);
  });
});
