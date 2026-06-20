import { describe, expect, it } from 'vitest';
import { normalizeNodeScaling } from './node-scaling';

describe('node-scaling', () => {
  it('merges legacy parallel into machine count', () => {
    const normalized = normalizeNodeScaling({
      id: 'n1',
      machineId: 'm',
      recipeId: 'r',
      position: { x: 0, y: 0 },
      machineCount: 2,
      parallel: 3,
      overclock: 1,
    });
    expect(normalized.machineCount).toBe(6);
    expect(normalized.parallel).toBe(1);
    expect(normalized).not.toHaveProperty('outputMultiplier');
  });

  it('migrates legacy outputMultiplier into machineCount', () => {
    const normalized = normalizeNodeScaling({
      id: 'n1',
      machineId: 'm',
      recipeId: 'r',
      position: { x: 0, y: 0 },
      machineCount: 2,
      parallel: 1,
      overclock: 1,
      outputMultiplier: 1.5,
    });
    expect(normalized.machineCount).toBe(3);
    expect(normalized).not.toHaveProperty('outputMultiplier');
  });

  it('ignores outputMultiplier when it equals 1', () => {
    const normalized = normalizeNodeScaling({
      id: 'n1',
      machineId: 'm',
      recipeId: 'r',
      position: { x: 0, y: 0 },
      machineCount: 4,
      parallel: 1,
      overclock: 1,
      outputMultiplier: 1,
    });
    expect(normalized.machineCount).toBe(4);
    expect(normalized).not.toHaveProperty('outputMultiplier');
  });
});
