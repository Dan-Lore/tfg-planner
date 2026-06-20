import { describe, expect, it, beforeEach } from 'vitest';
import type { FlowResult } from '@/calculator/flow-solver';
import type { TfgpNode } from '@/schema/tfgp';
import {
  allocateNodeId,
  applyFlowResult,
  dedupeNodeIds,
  resetIdCounter,
  seedIdCounter,
} from './editor-utils';

const node: TfgpNode = {
  id: 'n1',
  machineId: 'm1',
  recipeId: 'r1',
  position: { x: 0, y: 0 },
  machineCount: 4,
  overclock: 1,
  parallel: 1,
};

const result: FlowResult = {
  edgeFlows: {},
  edgeTargetFlows: {},
  nodeOutputRates: {},
  nodePortOutputRates: {},
  nodeInputRates: {},
  nodeSurplus: {},
  nodeMachineCounts: { n1: 9 },
};

describe('applyFlowResult', () => {
  it('preserve mode keeps manual machine counts', () => {
    const out = applyFlowResult([node], result, 'preserve');
    expect(out[0]!.machineCount).toBe(4);
  });

  it('full mode applies solver machine counts across scheme', () => {
    const out = applyFlowResult([node], result, 'full');
    expect(out[0]!.machineCount).toBe(9);
  });
});

describe('nextId', () => {
  beforeEach(() => resetIdCounter());

  it('seeds counter from existing scheme ids after reload', () => {
    const nodes: TfgpNode[] = [
      { ...node, id: 'node_19' },
    ];
    const edges = [{ id: 'edge_20', source: 'node_19', sourcePort: 'out_0', target: 'node_19', targetPort: 'in_0' }];
    seedIdCounter(nodes, edges);
    expect(allocateNodeId(nodes, edges)).toBe('node_21');
  });

  it('skips ids already taken in the scheme', () => {
    const existing: TfgpNode[] = [
      { ...node, id: 'node_3' },
    ];
    seedIdCounter(existing, []);
    expect(allocateNodeId(existing, [])).toBe('node_4');
  });
});

describe('dedupeNodeIds', () => {
  beforeEach(() => resetIdCounter());

  it('reassigns duplicate node ids on import', () => {
    const base = {
      machineId: 'm',
      recipeId: 'r',
      position: { x: 0, y: 0 },
      machineCount: 1,
      overclock: 1,
      parallel: 1,
    };
    const nodes: TfgpNode[] = [
      { id: 'node_3', ...base, machineId: 'reactor' },
      { id: 'node_3', ...base, machineId: 'tower' },
    ];
    const out = dedupeNodeIds(nodes, []);
    expect(out.map((n) => n.id)).toEqual(['node_3', 'node_4']);
    expect(out[1]!.machineId).toBe('tower');
  });
});
