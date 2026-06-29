import type { FlowResult } from '@/calculator/flow-solver';

export function emptyFlowResult(overrides: Partial<FlowResult> = {}): FlowResult {
  return {
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
    nodeLoad: {},
    nodeSurplus: {},
    nodeMachineCounts: {},
    ...overrides,
  };
}
