import { describe, expect, it } from 'vitest';
import { mergeFlowNodes } from '@/lib/merge-flow-nodes';

describe('mergeFlowNodes', () => {
  it('preserves measured dimensions when store nodes refresh', () => {
    const prev = [
      {
        id: 'node_1',
        type: 'machine',
        position: { x: 10, y: 20 },
        data: { layoutWidth: 248 },
        measured: { width: 248, height: 196 },
      },
    ];
    const next = [
      {
        id: 'node_1',
        type: 'machine',
        position: { x: 0, y: 0 },
        data: { layoutWidth: 248, recipeId: 'updated' },
      },
    ];

    const merged = mergeFlowNodes(prev, next);
    expect(merged[0]?.measured).toEqual({ width: 248, height: 196 });
    expect(merged[0]?.position).toEqual({ x: 10, y: 20 });
    expect(merged[0]?.data).toEqual({ layoutWidth: 248, recipeId: 'updated' });
  });

  it('clears measured when unified layout width changes', () => {
    const prev = [
      {
        id: 'node_1',
        type: 'machine',
        position: { x: 10, y: 20 },
        data: { layoutWidth: 220 },
        measured: { width: 220, height: 120 },
      },
    ];
    const next = [
      {
        id: 'node_1',
        type: 'machine',
        position: { x: 0, y: 0 },
        data: { layoutWidth: 340 },
      },
    ];

    const merged = mergeFlowNodes(prev, next);
    expect(merged[0]?.measured).toBeUndefined();
    expect(merged[0]?.position).toEqual({ x: 10, y: 20 });
  });
});
