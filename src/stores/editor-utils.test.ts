import { describe, expect, it, beforeEach } from 'vitest';
import { isMachineNode } from '@/lib/node-kind';
import type { TfgpMachineNode } from '@/schema/tfgp';
import { emptyFlowResult } from '@/test/flow-result-fixture';
import {
  allocateNodeId,
  applyFlowResult,
  dedupeNodeIds,
  dedupeSchemeTopology,
  normalizeSchemeNodes,
  resetIdCounter,
  seedIdCounter,
} from './editor-utils';

const node: TfgpMachineNode = {
  id: 'n1',
  machineId: 'm1',
  recipeId: 'r1',
  position: { x: 0, y: 0 },
  machineCount: 4,
  overclock: 1,
  voltageTier: 'LV',
  parallel: 1,
};

const result = emptyFlowResult({
  nodeMachineCounts: { n1: 9 },
});

describe('applyFlowResult', () => {
  it('preserve mode keeps manual machine counts', () => {
    const out = applyFlowResult([node], result, 'preserve');
    expect(isMachineNode(out[0]) && out[0].machineCount).toBe(4);
  });

  it('full mode applies solver machine counts across scheme', () => {
    const out = applyFlowResult([node], result, 'full');
    expect(isMachineNode(out[0]) && out[0].machineCount).toBe(9);
  });
});

describe('nextId', () => {
  beforeEach(() => resetIdCounter());

  it('seeds counter from existing scheme ids after reload', () => {
    const nodes: TfgpMachineNode[] = [
      { ...node, id: 'node_19' },
    ];
    const edges = [{ id: 'edge_20', source: 'node_19', sourcePort: 'out_0', target: 'node_19', targetPort: 'in_0' }];
    seedIdCounter(nodes, edges);
    expect(allocateNodeId(nodes, edges)).toBe('node_21');
  });

  it('skips ids already taken in the scheme', () => {
    const existing: TfgpMachineNode[] = [
      { ...node, id: 'node_3' },
    ];
    seedIdCounter(existing, []);
    expect(allocateNodeId(existing, [])).toBe('node_4');
  });
});

describe('dedupeSchemeTopology', () => {
  beforeEach(() => resetIdCounter());

  it('remaps edges when a sole node id is reassigned', () => {
    const base = {
      machineId: 'm',
      recipeId: 'r',
      position: { x: 0, y: 0 },
      machineCount: 1,
      overclock: 1,
      voltageTier: 'LV' as const,
      parallel: 1,
    };
    const nodes = [
      { id: 'node_3', ...base, machineId: 'reactor' },
      { id: 'node_3', ...base, machineId: 'tower' },
    ];
    const edges = [
      {
        id: 'edge_1',
        source: 'node_3',
        sourcePort: 'out_0',
        target: 'node_5',
        targetPort: 'in_0',
      },
    ];
    const targets = [{ nodeId: 'node_3', itemId: 'ingot', ratePerSecond: 1 }];
    const out = dedupeSchemeTopology(nodes, edges, targets);
    expect(out.nodes.map((n) => n.id)).toEqual(['node_3', 'node_4']);
    expect(out.edges[0]?.source).toBe('node_3');
    expect(out.edges[0]?.target).toBe('node_5');
    expect(out.targets[0]?.nodeId).toBe('node_3');
  });

  it('remaps endpoints that uniquely identify a renamed node', () => {
    const base = {
      machineId: 'm',
      recipeId: 'r',
      position: { x: 0, y: 0 },
      machineCount: 1,
      overclock: 1,
      voltageTier: 'LV' as const,
      parallel: 1,
    };
    const nodes = [
      { id: 'node_1', ...base },
      { id: 'node_1', ...base, machineId: 'tower' },
    ];
    const edges = [
      {
        id: 'edge_1',
        source: 'node_1',
        sourcePort: 'out_0',
        target: 'node_9',
        targetPort: 'in_0',
        itemId: 'ingot',
      },
    ];
    const out = dedupeSchemeTopology(nodes, edges);
    expect(out.nodes[1]?.id).toBe('node_2');
    expect(out.edges[0]?.source).toBe('node_1');
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
      voltageTier: 'LV' as const,
      parallel: 1,
    };
    const nodes: TfgpMachineNode[] = [
      { id: 'node_3', ...base, machineId: 'reactor' },
      { id: 'node_3', ...base, machineId: 'tower' },
    ];
    const out = dedupeNodeIds(nodes, []);
    expect(out.map((n) => n.id)).toEqual(['node_3', 'node_4']);
    const tower = out[1];
    expect(isMachineNode(tower) && tower.machineId).toBe('tower');
  });
});

describe('normalizeSchemeNodes', () => {
  it('fills missing voltageTier with LV', () => {
    const legacy = {
      id: 'node_1',
      machineId: 'gtceu:assembler',
      recipeId: 'test:recipe',
      position: { x: 0, y: 0 },
      machineCount: 1,
      overclock: 1,
      parallel: 1,
    } as TfgpMachineNode;
    const [normalized] = normalizeSchemeNodes([legacy]);
    expect(isMachineNode(normalized) && normalized.voltageTier).toBe('LV');
  });
});
