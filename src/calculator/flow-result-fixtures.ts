import type { FlowResult } from '@/calculator/flow-solver';

const EMPTY_FLOW_RESULT: FlowResult = {
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
};

/** Merge partial flow metrics with empty defaults (for tests and fixtures). */
export function flowResultFixture(overrides: Partial<FlowResult> = {}): FlowResult {
  return { ...EMPTY_FLOW_RESULT, ...overrides };
}
