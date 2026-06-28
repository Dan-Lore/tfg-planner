import { describe, expect, it } from 'vitest';
import { R } from '@/calculator/rational';
import { hydrateFlowResult } from '@/calculator/flow-result-transfer';
import type { FlowResult } from '@/calculator/flow-solver';

describe('hydrateFlowResult', () => {
  it('restores Rational methods after structuredClone', () => {
    const original: FlowResult = {
      edgeFlows: { e1: R.from(2.5) },
      edgeTargetFlows: {},
      nodeOutputRates: { n1: { out: R.from(1) } },
      nodePortOutputRates: { n1: { out_0: R.from(3) } },
      nodeInputRates: {},
      nodePortDeficit: {},
      nodePortInLoad: {},
      nodePortOutRecipeLoad: {},
      nodePortOutConsumerLoad: {},
      nodePortDownstreamDemand: {},
      nodeInputLimitedPortOutputRates: {},
      nodeEffectivePortOutputRates: { n1: { out_0: R.from(2.4) } },
      nodePortOutCapacityLoad: {},
      nodePortOutLoad: {},
      nodeMaxLoad: { n1: R.from(1) },
      nodeCurrentLoad: { n1: R.from(0.8) },
      nodeLoad: { n1: R.from(0.8) },
      nodeSurplus: {},
      nodeMachineCounts: { n1: 2 },
    };

    const cloned = structuredClone(original);
    const hydrated = hydrateFlowResult(cloned);

    expect(hydrated.edgeFlows.e1!.toNumber()).toBeCloseTo(2.5);
    expect(hydrated.nodeEffectivePortOutputRates.n1!.out_0!.toNumber()).toBeCloseTo(2.4);
    expect(hydrated.nodeLoad.n1!.mul(R.from(100)).toNumber()).toBeCloseTo(80);
  });
});
