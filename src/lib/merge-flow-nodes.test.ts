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
        position: { x: 10, y: 20 },
        data: { layoutWidth: 248, recipeId: 'updated' },
      },
    ];

    const merged = mergeFlowNodes(prev, next);
    expect(merged[0]?.measured).toEqual({ width: 248, height: 196 });
    expect(merged[0]?.position).toEqual({ x: 10, y: 20 });
    expect(merged[0]?.data).toEqual({ layoutWidth: 248, recipeId: 'updated' });
  });

  it('applies store position after undo when node is not dragging', () => {
    const prev = [
      {
        id: 'node_1',
        type: 'machine',
        position: { x: 400, y: 220 },
        data: {},
      },
    ];
    const next = [
      {
        id: 'node_1',
        type: 'machine',
        position: { x: 10, y: 20 },
        data: {},
      },
    ];

    const merged = mergeFlowNodes(prev, next);
    expect(merged[0]?.position).toEqual({ x: 10, y: 20 });
  });

  it('keeps drag position while node is dragging', () => {
    const prev = [
      {
        id: 'node_1',
        type: 'machine',
        position: { x: 400, y: 220 },
        data: {},
      },
    ];
    const next = [
      {
        id: 'node_1',
        type: 'machine',
        position: { x: 10, y: 20 },
        data: {},
      },
    ];

    const merged = mergeFlowNodes(prev, next, new Set(['node_1']));
    expect(merged[0]?.position).toEqual({ x: 400, y: 220 });
  });

  it('clears measured when layout width is first assigned', () => {
    const prev = [
      {
        id: 'node_1',
        type: 'machine',
        position: { x: 10, y: 20 },
        data: {},
        measured: { width: 220, height: 120 },
      },
    ];
    const next = [
      {
        id: 'node_1',
        type: 'machine',
        position: { x: 10, y: 20 },
        data: { layoutWidth: 340 },
      },
    ];

    const merged = mergeFlowNodes(prev, next);
    expect(merged[0]?.data).toEqual({ layoutWidth: 340 });
    expect(merged[0]?.measured).toBeUndefined();
  });

  it('clears measured when port topology changes via inputPortIds', () => {
    const prev = [
      {
        id: 'node_1',
        type: 'machine',
        position: { x: 10, y: 20 },
        data: { layoutWidth: 220, inputPortIds: ['in_0'], outputPortIds: ['out_0'] },
        measured: { width: 220, height: 120 },
      },
    ];
    const next = [
      {
        id: 'node_1',
        type: 'machine',
        position: { x: 10, y: 20 },
        data: {
          layoutWidth: 220,
          inputPortIds: ['in_0', 'in_1'],
          outputPortIds: ['out_0'],
        },
      },
    ];

    const merged = mergeFlowNodes(prev, next);
    expect(merged[0]?.measured).toBeUndefined();
  });

  it('preserves measured when layout width changes within epsilon', () => {
    const prev = [
      {
        id: 'node_1',
        type: 'machine',
        position: { x: 10, y: 20 },
        data: { layoutWidth: 220.2 },
        measured: { width: 220, height: 120 },
      },
    ];
    const next = [
      {
        id: 'node_1',
        type: 'machine',
        position: { x: 10, y: 20 },
        data: { layoutWidth: 220.4 },
      },
    ];

    const merged = mergeFlowNodes(prev, next);
    expect(merged[0]?.measured).toEqual({ width: 220, height: 120 });
  });
});
