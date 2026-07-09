import { beforeEach, describe, expect, it, vi } from 'vitest';
import { R } from '@/calculator/rational';
import type { FlowResult } from '@/calculator/flow-solver';
import { dehydrateFlowResult } from '@/calculator/flow-result-transfer';
import { createEmptyTfgp } from '@/schema/tfgp';
import type { TfgpMachineNode } from '@/schema/tfgp';
import { schemeFlowRevision } from '@/editor-graph/scheme-flow-revision';
import '@/stores/editor-store';
import { useSchemeStore } from '@/stores/scheme-store';
import { useFlowStore } from '@/stores/flow-store';

const scheduleFlowUpdate = vi.fn();
const refreshSchemeCheckAsync = vi.fn();

vi.mock('@/stores/flow-compute-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/flow-compute-runtime')>();
  return {
    ...actual,
    scheduleFlowUpdate: (...args: unknown[]) => scheduleFlowUpdate(...args),
    refreshSchemeCheckAsync: (...args: unknown[]) => refreshSchemeCheckAsync(...args),
  };
});

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

describe('flow-store updateFlows', () => {
  beforeEach(() => {
    scheduleFlowUpdate.mockClear();
    refreshSchemeCheckAsync.mockClear();

    const scheme = createEmptyTfgp('0.12.8', 1);
    scheme.nodes = [machineNode];
    const key = '0.12.8@1';
    const revision = schemeFlowRevision(scheme);

    useSchemeStore.setState({
      scheme,
      activePackKey: key,
      schemesByPack: { [key]: scheme },
    });
    useFlowStore.setState({
      flowsByPack: {
        [key]: {
          revision,
          flowResult: dehydrateFlowResult(minimalFlowResult) as unknown as FlowResult,
        },
      },
      flowResult: minimalFlowResult,
      flowComputeState: 'idle',
      schemeCheckResult: null,
    });
  });

  it('skips scheduleFlowUpdate when revision matches cached flows', () => {
    useFlowStore.getState().updateFlows();

    expect(scheduleFlowUpdate).not.toHaveBeenCalled();
    expect(refreshSchemeCheckAsync).toHaveBeenCalled();
  });

  it('schedules compute when revision does not match cache', () => {
    useSchemeStore.getState().updateNode('node_1', { machineCount: 2 });

    useFlowStore.getState().updateFlows();

    expect(scheduleFlowUpdate).toHaveBeenCalledWith('update');
  });
});
