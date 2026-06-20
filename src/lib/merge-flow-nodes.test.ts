import { describe, expect, it } from 'vitest';
import { mergeFlowNodes } from '@/lib/merge-flow-nodes';

describe('mergeFlowNodes', () => {
  it('preserves measured dimensions when store nodes refresh', () => {
    const prev = [
      {
        id: 'node_1',
        type: 'machine',
        position: { x: 10, y: 20 },
        data: {},
        measured: { width: 248, height: 196 },
        width: 248,
        height: 196,
      },
    ];
    const next = [
      {
        id: 'node_1',
        type: 'machine',
        position: { x: 0, y: 0 },
        data: { recipeId: 'updated' },
      },
    ];

    const merged = mergeFlowNodes(prev, next);
    expect(merged[0]?.measured).toEqual({ width: 248, height: 196 });
    expect(merged[0]?.width).toBe(248);
    expect(merged[0]?.height).toBe(196);
    expect(merged[0]?.position).toEqual({ x: 10, y: 20 });
    expect(merged[0]?.data).toEqual({ recipeId: 'updated' });
  });
});
