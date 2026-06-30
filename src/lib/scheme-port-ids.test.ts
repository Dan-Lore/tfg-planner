import { describe, expect, it } from 'vitest';
import { edgeHandlesReady, mergedNodePortIds } from '@/lib/scheme-port-ids';

describe('mergedNodePortIds', () => {
  it('includes edge ports before recipe is loaded', () => {
    const edges = [
      {
        id: 'e1',
        source: 'gh',
        target: 'pyro',
        sourcePort: 'out_2',
        targetPort: 'in_0',
      },
    ];
    const ports = mergedNodePortIds('gh', edges, 0, 0);
    expect(ports.outputPortIds).toEqual(['out_2']);
    expect(mergedNodePortIds('pyro', edges, 0, 0).inputPortIds).toEqual(['in_0']);
  });

  it('unions recipe and edge ports', () => {
    const edges = [
      {
        id: 'e1',
        source: 'a',
        target: 'b',
        sourcePort: 'out_3',
        targetPort: 'in_1',
      },
    ];
    expect(mergedNodePortIds('a', edges, 1, 2).outputPortIds).toEqual([
      'out_0',
      'out_1',
      'out_3',
    ]);
    expect(mergedNodePortIds('b', edges, 2, 1).inputPortIds).toEqual(['in_0', 'in_1']);
  });
});

describe('edgeHandlesReady', () => {
  it('requires all edge handles in node port lists', () => {
    const nodes = [
      {
        id: 'a',
        data: { outputPortIds: ['out_0', 'out_2'] },
      },
      {
        id: 'b',
        data: { inputPortIds: ['in_0'] },
      },
    ];
    const ready = [
      { source: 'a', target: 'b', sourceHandle: 'out_2', targetHandle: 'in_0' },
    ];
    const missing = [
      { source: 'a', target: 'b', sourceHandle: 'out_3', targetHandle: 'in_0' },
    ];
    expect(edgeHandlesReady(nodes, ready)).toBe(true);
    expect(edgeHandlesReady(nodes, missing)).toBe(false);
  });
});
