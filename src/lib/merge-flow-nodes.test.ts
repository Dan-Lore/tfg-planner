import { describe, expect, it } from 'vitest';
import {
  applyFlowEdgeSelection,
  applyFlowNodeSelection,
  mergeFlowEdges,
  mergeFlowNodes,
} from '@/lib/merge-flow-nodes';

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

  it('preserves selected when store node data refreshes', () => {
    const prev = [
      {
        id: 'node_1',
        type: 'machine',
        position: { x: 10, y: 20 },
        selected: true,
        data: { machineCount: 1 },
      },
    ];
    const next = [
      {
        id: 'node_1',
        type: 'machine',
        position: { x: 10, y: 20 },
        data: { machineCount: 2 },
      },
    ];

    const merged = mergeFlowNodes(prev, next);
    expect(merged[0]?.selected).toBe(true);
    expect(merged[0]?.data).toEqual({ machineCount: 2 });
  });

  it('reapplies store selection after inspector-like node refresh', () => {
    const prev = [
      {
        id: 'node_1',
        type: 'machine',
        position: { x: 10, y: 20 },
        selected: true,
        data: { machineCount: 1, overclock: 1 },
      },
    ];
    const next = [
      {
        id: 'node_1',
        type: 'machine',
        position: { x: 10, y: 20 },
        data: { machineCount: 1, overclock: 2 },
      },
    ];

    const merged = applyFlowNodeSelection(mergeFlowNodes(prev, next), ['node_1']);
    expect(merged[0]?.selected).toBe(true);
    expect(merged[0]?.data).toEqual({ machineCount: 1, overclock: 2 });
  });
});

describe('applyFlowNodeSelection', () => {
  it('sets selected from store ids', () => {
    const nodes = [
      { id: 'a', type: 'machine', position: { x: 0, y: 0 }, data: {} },
      { id: 'b', type: 'machine', position: { x: 0, y: 0 }, data: {} },
    ];
    const result = applyFlowNodeSelection(nodes, ['b']);
    expect(result[0]?.selected).toBe(false);
    expect(result[1]?.selected).toBe(true);
  });

  it('clears selection when store ids are empty', () => {
    const nodes = [
      {
        id: 'a',
        type: 'machine',
        position: { x: 0, y: 0 },
        selected: true,
        data: {},
      },
    ];
    const result = applyFlowNodeSelection(nodes, []);
    expect(result[0]?.selected).toBe(false);
  });
});

describe('applyFlowEdgeSelection', () => {
  it('sets selected from store ids', () => {
    const edges = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
    ];
    const result = applyFlowEdgeSelection(edges, ['e2']);
    expect(result[0]?.selected).toBe(false);
    expect(result[1]?.selected).toBe(true);
  });
});

describe('mergeFlowEdges', () => {
  it('preserves selected when edge data refreshes', () => {
    const prev = [
      { id: 'e1', source: 'a', target: 'b', selected: true, data: { source: '1/s' } },
    ];
    const next = [
      { id: 'e1', source: 'a', target: 'b', data: { source: '2/s' } },
    ];

    const merged = mergeFlowEdges(prev, next);
    expect(merged[0]?.selected).toBe(true);
    expect(merged[0]?.data).toEqual({ source: '2/s' });
  });

  it('reapplies store selection after edge data refresh', () => {
    const prev = [
      { id: 'e1', source: 'a', target: 'b', selected: true, data: {} },
    ];
    const next = [{ id: 'e1', source: 'a', target: 'b', data: { source: '3/s' } }];

    const merged = applyFlowEdgeSelection(mergeFlowEdges(prev, next), ['e1']);
    expect(merged[0]?.selected).toBe(true);
  });
});
