import { describe, expect, it } from 'vitest';
import { R } from '@/calculator/rational';
import { hydrateFlowResult, dehydrateFlowResult } from '@/calculator/flow-result-transfer';
import { normalizeCycleSeedInfo } from '@/lib/cycle-seed-metrics';
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

  it('restores Rational methods from string num/den after JSON persist', () => {
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

    const json = JSON.stringify(dehydrateFlowResult(original));
    const parsed = JSON.parse(json) as FlowResult;
    const hydrated = hydrateFlowResult(parsed);

    expect(hydrated.edgeFlows.e1!.toNumber()).toBeCloseTo(2.5);
    expect(hydrated.nodeEffectivePortOutputRates.n1!.out_0!.toNumber()).toBeCloseTo(2.4);
  });

  it('preserves cycleSeeds and nonConverged through dehydrate/hydrate', () => {
    const original: FlowResult = {
      edgeFlows: { e1: R.from(0.0222) },
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
      nonConverged: false,
      cycleSeeds: [
        {
          edgeId: 'edge_141',
          sccIndex: 0,
          seedFlowPerSecond: 0.0222,
          theoreticalDemandPerSecond: 0.0444,
          productId: 'gtceu:rhenium_dust',
          netPerSecond: -1.955556,
          producePerSecond: 40,
          consumePerSecond: 41.955556,
          reproductionPercent: 95.3,
          recommendedCapacity: 160,
          mode: 'deficit',
        },
      ],
    };

    const hydrated = hydrateFlowResult(dehydrateFlowResult(original));

    expect(hydrated.nonConverged).toBe(false);
    expect(hydrated.cycleSeeds).toEqual(
      original.cycleSeeds?.map((seed) => normalizeCycleSeedInfo(seed)),
    );
    expect(hydrated.edgeFlows.e1!.toNumber()).toBeCloseTo(0.0222);
  });

  it('backfills legacy cycleSeeds missing new fields on hydrate', () => {
    const legacy = {
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
      cycleSeeds: [
        {
          edgeId: 'edge_154',
          sccIndex: 0,
          seedFlowPerSecond: 0.0267,
          productId: 'gtceu:tiny_rhenium_dust',
          netPerSecond: -1.72,
          producePerSecond: 10,
          consumePerSecond: 11.72,
          mode: 'deficit' as const,
        },
      ],
    } as unknown as FlowResult;

    const hydrated = hydrateFlowResult(legacy);
    expect(hydrated.cycleSeeds![0]!.theoreticalDemandPerSecond).toBeCloseTo(0.0267, 8);
    expect(hydrated.cycleSeeds![0]!.recommendedCapacity).toBeGreaterThan(0);
  });
});
