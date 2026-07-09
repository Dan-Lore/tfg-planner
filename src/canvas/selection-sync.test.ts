import { describe, expect, it } from 'vitest';
import {
  applyFlowEdgeSelection,
  mergeFlowEdges,
} from '@/editor-graph/merge-flow-nodes';

/**
 * Regression: box-select on a node with incident edges caused Maximum update depth
 * when store selectedEdgeIds=[] was applied back to flowEdges via useLayoutEffect.
 * Edge merge must preserve RF-local selected; store mirror is one-way (onSelectionChange).
 */
describe('selection sync regression (box-select / setEdges loop)', () => {
  it('mergeFlowEdges preserves RF-local selected when rf data refs are unchanged', () => {
    const data1 = { source: '1/s' };
    const data2 = {};
    const prev = [
      {
        id: 'e1',
        source: 'a',
        target: 'b',
        selected: true,
        data: data1,
      },
      {
        id: 'e2',
        source: 'b',
        target: 'c',
        data: data2,
      },
    ];
    const next = [
      { id: 'e1', source: 'a', target: 'b', data: data1 },
      { id: 'e2', source: 'b', target: 'c', data: data2 },
    ];

    const merged = mergeFlowEdges(prev, next);
    expect(merged[0]).toBe(prev[0]);
    expect(merged[0]?.selected).toBe(true);
    expect(merged[1]).toBe(prev[1]);
  });

  it('edge merge without applyFlowEdgeSelection keeps RF selected state', () => {
    const data = { source: '1/s' };
    const prev = [
      { id: 'e1', source: 'a', target: 'b', selected: true, data },
    ];
    const next = [{ id: 'e1', source: 'a', target: 'b', data }];
    const merged = mergeFlowEdges(prev, next);
    expect(merged[0]?.selected).toBe(true);
  });

  it('applyFlowEdgeSelection clears only edges that were programmatically selected', () => {
    const edges = [
      { id: 'e1', source: 'a', target: 'b', selected: true },
      { id: 'e2', source: 'b', target: 'c', selected: true },
    ];
    const result = applyFlowEdgeSelection(edges, ['e2']);
    expect(result[0]?.selected).toBe(false);
    expect(result[1]?.selected).toBe(true);
  });
});
