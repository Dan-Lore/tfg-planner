import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyTfgp } from '@/schema/tfgp';
import type { TfgpMachineNode } from '@/schema/tfgp';
import { useSchemeStore } from '@/stores/scheme-store';
import { useFlowStore } from '@/stores/flow-store';

vi.mock('@/lib/flow-compute', () => ({
  computeFlowsAsync: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/debounce-flow-update', () => ({
  debounceFlowUpdate: (fn: () => void) => {
    fn();
    return fn;
  },
}));

vi.mock('@/scheme-check/run-scheme-check', () => ({
  runSchemeCheck: vi.fn(),
}));

const machineNode: TfgpMachineNode = {
  id: 'node_1',
  kind: 'machine',
  machineId: 'gtceu:electric_blast_furnace',
  recipeId: 'gtceu:ebf_steel',
  machineCount: 1,
  overclock: 1,
  voltageTier: 'LV',
  position: { x: 0, y: 0 },
};

describe('scheme-store selection', () => {
  beforeEach(() => {
    const scheme = createEmptyTfgp('test-pack', 1);
    scheme.nodes = [machineNode];
    useSchemeStore.setState({
      scheme,
      activePackKey: 'test-pack:1',
      schemesByPack: { 'test-pack:1': scheme },
      selectedNodeIds: ['node_1'],
      selectedEdgeIds: [],
      past: [],
      future: [],
    });
    useFlowStore.setState({
      flowsByPack: {},
      flowResult: null,
      schemeCheckResult: null,
      flowComputeState: 'idle',
    });
  });

  it('keeps selectedNodeIds when updateNode changes machine settings', () => {
    useSchemeStore.getState().updateNode('node_1', { machineCount: 3 });

    expect(useSchemeStore.getState().selectedNodeIds).toEqual(['node_1']);
    expect(useSchemeStore.getState().scheme.nodes[0]).toMatchObject({
      id: 'node_1',
      machineCount: 3,
    });
  });

  it('keeps selectedNodeIds when updateNode changes overclock', () => {
    useSchemeStore.getState().updateNode('node_1', { overclock: 2 });

    expect(useSchemeStore.getState().selectedNodeIds).toEqual(['node_1']);
    expect(useSchemeStore.getState().scheme.nodes[0]).toMatchObject({
      id: 'node_1',
      overclock: 2,
    });
  });
});
