import { describe, expect, it } from 'vitest';
import { buildSchemeObstacleRects, shiftObstaclesForDragging } from '@/canvas/scheme-obstacles';
import type { PackLike } from '@/data/pack-registry';
import type { TfgpMachineNode } from '@/schema/tfgp-types';

const pack = {
  getRecipe: (id: string) =>
    id === 'r1'
      ? {
          id: 'r1',
          machineId: 'mac',
          inputs: [{ itemId: 'iron', amount: 1 }],
          outputs: [{ itemId: 'plate', amount: 1 }],
        }
      : undefined,
  getMachineRecipeCount: () => 1,
} as unknown as PackLike;

describe('buildSchemeObstacleRects', () => {
  it('returns rects for machine nodes from scheme positions', () => {
    const node: TfgpMachineNode = {
      id: 'm1',
      kind: 'machine',
      machineId: 'mac',
      recipeId: 'r1',
      machineCount: 1,
      overclock: 1,
      parallel: 1,
      voltageTier: 'LV',
      position: { x: 100, y: 50 },
    };
    const rects = buildSchemeObstacleRects([node], pack, { m1: 240 }, {});
    expect(rects).toHaveLength(1);
    expect(rects[0]?.nodeId).toBe('m1');
    expect(rects[0]?.rect.left).toBeLessThan(100);
    expect(rects[0]?.rect.right).toBeGreaterThan(100 + 200);
  });
});

describe('shiftObstaclesForDragging', () => {
  const obstacles = [
    {
      nodeId: 'a',
      rect: { left: 10, top: 20, right: 110, bottom: 120 },
    },
    {
      nodeId: 'b',
      rect: { left: 200, top: 20, right: 300, bottom: 120 },
    },
  ];

  it('returns the same array when live and store positions match', () => {
    const result = shiftObstaclesForDragging(
      obstacles,
      [{ id: 'a', position: { x: 20, y: 30 } }],
      [{ id: 'a', position: { x: 20, y: 30 } }],
    );
    expect(result).toBe(obstacles);
  });

  it('shifts obstacle by live-store delta when positions differ', () => {
    const result = shiftObstaclesForDragging(
      obstacles,
      [{ id: 'a', position: { x: 50, y: 40 } }],
      [{ id: 'a', position: { x: 20, y: 30 } }],
    );
    expect(result[0]?.rect).toEqual({
      left: 40,
      top: 30,
      right: 140,
      bottom: 130,
    });
    expect(result[1]).toBe(obstacles[1]);
  });

  it('keeps shifted obstacles after drag ends until store catches up', () => {
    const live = [{ id: 'a', position: { x: 50, y: 40 } }];
    const store = [{ id: 'a', position: { x: 20, y: 30 } }];
    const duringDrag = shiftObstaclesForDragging(obstacles, live, store);
    const afterDragEnd = shiftObstaclesForDragging(obstacles, live, store);
    expect(afterDragEnd[0]?.rect).toEqual(duringDrag[0]?.rect);
  });
});
