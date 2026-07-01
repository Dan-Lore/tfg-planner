import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyTfgp } from '@/schema/tfgp';
import type { TfgpMachineNode } from '@/schema/tfgp';
import { useEditorStore } from '@/stores/editor-store';

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
  parallel: 1,
  voltageTier: 'LV',
  position: { x: 0, y: 0 },
};

describe('editor-store selection', () => {
  beforeEach(() => {
    const scheme = createEmptyTfgp('test-pack', 1);
    scheme.nodes = [machineNode];
    useEditorStore.setState({
      scheme,
      activePackKey: 'test-pack:1',
      schemesByPack: { 'test-pack:1': scheme },
      flowsByPack: {},
      selectedNodeIds: ['node_1'],
      selectedEdgeIds: [],
      flowResult: null,
      schemeCheckResult: null,
      flowComputeState: 'idle',
      past: [],
      future: [],
    });
  });

  it('keeps selectedNodeIds when updateNode changes machine settings', () => {
    useEditorStore.getState().updateNode('node_1', { machineCount: 3 });

    expect(useEditorStore.getState().selectedNodeIds).toEqual(['node_1']);
    expect(useEditorStore.getState().scheme.nodes[0]).toMatchObject({
      id: 'node_1',
      machineCount: 3,
    });
  });

  it('keeps selectedNodeIds when updateNode changes overclock', () => {
    useEditorStore.getState().updateNode('node_1', { overclock: 2 });

    expect(useEditorStore.getState().selectedNodeIds).toEqual(['node_1']);
    expect(useEditorStore.getState().scheme.nodes[0]).toMatchObject({
      id: 'node_1',
      overclock: 2,
    });
  });
});
