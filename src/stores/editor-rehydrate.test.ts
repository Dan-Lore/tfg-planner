import { beforeEach, describe, expect, it, vi } from 'vitest';
import { R } from '@/calculator/rational';
import type { FlowResult } from '@/calculator/flow-solver';
import { dehydrateFlowResult } from '@/calculator/flow-result-transfer';
import { createEmptyTfgp } from '@/schema/tfgp';
import type { TfgpMachineNode } from '@/schema/tfgp';
import { schemeFlowRevision } from '@/lib/scheme-flow-revision';
import '@/stores/editor-store';
import { useSchemeStore } from '@/stores/scheme-store';
import { useFlowStore } from '@/stores/flow-store';
import { editorStoresHaveHydrated } from '@/stores/editor-hydration';

vi.mock('@/lib/flow-compute', () => ({
  computeFlowsAsync: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/debounce-flow-update', () => ({
  debounceFlowUpdate: (fn: () => void) => {
    fn();
    return Object.assign(fn, { cancel: () => {} });
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

const minimalFlowResult: FlowResult = {
  edgeFlows: {},
  edgeTargetFlows: {},
  nodeOutputRates: {},
  nodePortOutputRates: {},
  nodeInputRates: {},
  nodePortDeficit: {},
  nodePortInLoad: {},
  nodePortOutRecipeLoad: {},
  nodePortOutConsumerLoad: {},
  nodePortDownstreamDemand: {},
  nodeInputLimitedPortOutputRates: {},
  nodeEffectivePortOutputRates: {},
  nodePortOutCapacityLoad: {},
  nodePortOutLoad: {},
  nodeMaxLoad: {},
  nodeCurrentLoad: {},
  nodeLoad: { node_1: R.from(0.5) },
  nodeSurplus: {},
  nodeMachineCounts: {},
};

describe('editor rehydrate coordination', () => {
  beforeEach(() => {
    const scheme = createEmptyTfgp('test-pack', 1);
    scheme.nodes = [machineNode];
    const key = 'test-pack@1';

    useSchemeStore.setState({
      scheme,
      activePackKey: key,
      schemesByPack: { [key]: scheme },
      selectedNodeIds: [],
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

  it('restoreForPack restores cached flow when revision matches', () => {
    const scheme = useSchemeStore.getState().scheme;
    const key = useSchemeStore.getState().activePackKey!;
    const revision = schemeFlowRevision(scheme);

    useFlowStore.setState({
      flowsByPack: {
        [key]: {
          revision,
          flowResult: dehydrateFlowResult(minimalFlowResult) as unknown as FlowResult,
        },
      },
    });

    useFlowStore.getState().restoreForPack(key, scheme);

    expect(useFlowStore.getState().flowResult?.nodeLoad.node_1?.toNumber()).toBe(0.5);
    expect(useFlowStore.getState().flowComputeState).toBe('idle');
  });

  it('editorStoresHaveHydrated is true after vitest store init', () => {
    expect(editorStoresHaveHydrated()).toBe(true);
  });

  it('switchToPack restores cached flows without recomputing', () => {
    const packA = createEmptyTfgp('0.12.8', 1);
    packA.nodes = [machineNode];
    const keyA = '0.12.8@1';

    const packB = createEmptyTfgp('0.13.0', 1);
    const nodeB: TfgpMachineNode = { ...machineNode, id: 'node_b' };
    packB.nodes = [nodeB];
    const keyB = '0.13.0@1';
    const revisionB = schemeFlowRevision(packB);
    const flowB: FlowResult = {
      ...minimalFlowResult,
      nodeLoad: { node_b: R.from(0.75) },
    };

    useSchemeStore.setState({
      scheme: packA,
      activePackKey: keyA,
      schemesByPack: { [keyA]: packA, [keyB]: packB },
    });
    useFlowStore.setState({
      flowsByPack: {
        [keyB]: {
          revision: revisionB,
          flowResult: dehydrateFlowResult(flowB) as unknown as FlowResult,
        },
      },
      flowResult: null,
      flowComputeState: 'idle',
    });

    useSchemeStore.getState().switchToPack('0.13.0', 1);

    expect(useSchemeStore.getState().activePackKey).toBe(keyB);
    expect(useFlowStore.getState().flowResult?.nodeLoad.node_b?.toNumber()).toBe(0.75);
    expect(useFlowStore.getState().flowComputeState).toBe('idle');
  });

  it('waitForEditorHydration resolves when both slices are hydrated', async () => {
    const { waitForEditorHydration } = await import('@/stores/editor-hydration');
    await expect(waitForEditorHydration()).resolves.toBeUndefined();
  });

  it('F5 ordering: flow flowsByPack hydrates before scheme restoreForPack', () => {
    const scheme = createEmptyTfgp('0.12.8', 1);
    scheme.nodes = [machineNode];
    const key = '0.12.8@1';
    const revision = schemeFlowRevision(scheme);

    useFlowStore.setState({
      flowsByPack: {
        [key]: {
          revision,
          flowResult: dehydrateFlowResult(minimalFlowResult) as unknown as FlowResult,
        },
      },
      flowResult: null,
      flowComputeState: 'idle',
    });
    expect(useFlowStore.getState().flowResult).toBeNull();

    useSchemeStore.setState({
      scheme,
      activePackKey: key,
      schemesByPack: { [key]: scheme },
    });
    useFlowStore.getState().restoreForPack(key, scheme);

    expect(useFlowStore.getState().flowResult?.nodeLoad.node_1?.toNumber()).toBe(0.5);
  });
});
