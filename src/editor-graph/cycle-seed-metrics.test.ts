import { describe, expect, it } from 'vitest';
import { R } from '@/calculator/rational';
import type { CycleSeedInfo, SchemeEdge, SchemeNode } from '@/calculator/flow-solver-types';
import {
  catalystAttemptRate,
  computeCatalystReproductionPercent,
  computeCatalystSeedCapacity,
  computeReproductionPercent,
  computeRecommendedBufferCapacity,
  computeStochasticCatalystBuffer,
  formatReproductionPercent,
  isProductExternallySuppliedToScc,
  normalizeCycleSeedInfo,
  resolveBufferMaintainAmount,
} from '@/editor-graph/cycle-seed-metrics';

describe('cycle-seed-metrics', () => {
  it('computes reproduction percent from produce and consume', () => {
    expect(computeReproductionPercent(R.from(85), R.from(100))).toBe(85);
    expect(computeReproductionPercent(R.from(100), R.from(100))).toBe(100);
  });

  it('formats stable reproduction as ~100', () => {
    expect(formatReproductionPercent(100, true)).toBe('~100');
    expect(formatReproductionPercent(99.8, true)).toBe('~100');
  });

  it('detects steam fed from infinite start buffer into SCC', () => {
    const nodes: SchemeNode[] = [
      {
        id: 'steam',
        kind: 'start_buffer',
        machineId: '',
        recipeId: '',
        machineCount: 1,
        overclock: 1,
        voltageTier: 'LV',
        fluidId: 'gtceu:steam',
        autoSupplyRate: true,
        supplyMode: 'rate',
      },
      {
        id: 'cracker',
        kind: 'machine',
        machineId: 'gtceu:cracker',
        recipeId: 'r',
        machineCount: 1,
        overclock: 1,
        voltageTier: 'HV',
      },
    ];
    const edges: SchemeEdge[] = [
      {
        id: 'e1',
        source: 'steam',
        target: 'cracker',
        sourcePort: 'out_0',
        targetPort: 'in_1',
        fluidId: 'gtceu:steam',
      },
    ];
    const scc = new Set(['cracker']);
    expect(isProductExternallySuppliedToScc(scc, 'gtceu:steam', nodes, edges)).toBe(true);
    expect(isProductExternallySuppliedToScc(scc, 'gtceu:tiny_rhenium_dust', nodes, edges)).toBe(
      false,
    );
  });

  it('uses intermediate buffer capacity as maintain stock', () => {
    const node: SchemeNode = {
      id: 'buf',
      kind: 'intermediate_buffer',
      machineId: '',
      recipeId: '',
      machineCount: 1,
      overclock: 1,
      voltageTier: 'LV',
      itemId: 'gtceu:tiny_rhenium_dust',
      capacity: 300,
    };
    expect(resolveBufferMaintainAmount(node)).toBe(300);
  });

  it('computes recommended buffer capacity from cycle balance', () => {
    expect(computeRecommendedBufferCapacity('stable', 0, 0.1)).toBe(360);
    expect(computeRecommendedBufferCapacity('deficit', -0.05, 0.1)).toBe(
      Math.ceil(0.05 * 3600 + 0.1 * 3600),
    );
    expect(computeRecommendedBufferCapacity('surplus', 0.02, 0.1)).toBe(
      Math.ceil(0.02 * 3600),
    );
  });

  it('derives catalyst attempt rate from expected consumption and chance', () => {
    expect(catalystAttemptRate(0.025, 1000)).toBeCloseTo(0.25, 8);
    expect(catalystAttemptRate(0.025, undefined)).toBeCloseTo(0.025, 8);
  });

  it('computes reproduction from attempt rates (~100% for matched catalyst loop)', () => {
    expect(computeCatalystReproductionPercent(0.25, 0.25)).toBe(100);
  });

  it('computes 99% stochastic buffer capacity for rhenium-like catalyst', () => {
    const result = computeStochasticCatalystBuffer({
      attemptsPerSec: 0.25,
      chance: 1000,
    });
    expect(result.attemptsPerHour).toBe(900);
    expect(result.chancePercent).toBe(10);
    expect(result.mean).toBeCloseTo(90, 5);
    expect(result.stdDev).toBeCloseTo(9, 5);
    expect(result.capacity).toBe(111);
  });

  it('uses stochastic capacity for chanced catalyst seeds', () => {
    const { capacity, detail } = computeCatalystSeedCapacity({
      mode: 'stable',
      expectedNetPerSecond: 0,
      expectedConsumePerSecond: 0.025,
      consumeAttemptPerSecond: 0.25,
      consumerChance: 1000,
      theoreticalDemandPerSecond: 0.025,
    });
    expect(capacity).toBe(111);
    expect(detail?.attemptsPerHour).toBe(900);
  });

  it('backfills missing theoreticalDemandPerSecond from seed flow', () => {
    const normalized = normalizeCycleSeedInfo({
      edgeId: 'edge_1',
      sccIndex: 0,
      seedFlowPerSecond: 0.0267,
      productId: 'gtceu:tiny_rhenium_dust',
      netPerSecond: -1.72,
      producePerSecond: 10,
      consumePerSecond: 11.72,
      mode: 'deficit',
    } as CycleSeedInfo);
    expect(normalized.theoreticalDemandPerSecond).toBeCloseTo(0.0267, 8);
    expect(normalized.recommendedCapacity).toBeGreaterThan(0);
  });
});
