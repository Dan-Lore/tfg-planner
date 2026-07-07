import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTfgp } from '@/schema/tfgp';
import { loadTestPack } from '@/test-fixtures/load-test-pack';
import { runSolver } from '@/lib/scheme-solver';
import { checkScheme } from '@/scheme-check/check-scheme';

const RHENIUM_LOOP_FIXTURE = path.join(
  process.cwd(),
  'src/lib/fixtures/edge-routing/rebra-rhenium-loop.tfgp',
);

function solveFixture(fixturePath: string) {
  const scheme = parseTfgp(readFileSync(fixturePath, 'utf8'));
  const pack = loadTestPack(scheme.modpack.version);
  const snap = {
    nodes: scheme.nodes,
    edges: scheme.edges,
    edgeConstraints: scheme.edgeConstraints ?? [],
    viewport: scheme.viewport,
  };
  const result = runSolver(snap, pack, { preserveManualMachineCounts: true });
  const check = checkScheme(scheme, pack, { flowResult: result });
  return { scheme, result, check };
}

describe('rhenium loop cycle bootstrap', () => {
  it('bootstraps closed loop from intermediate buffer seed edge', () => {
    const { result, check } = solveFixture(RHENIUM_LOOP_FIXTURE);

    expect(result.edgeFlows.edge_141!.toNumber()).toBeGreaterThan(0);
    expect(result.edgeFlows.edge_98!.toNumber()).toBeGreaterThan(0);
    expect(result.edgeFlows.edge_132!.toNumber()).toBeGreaterThan(0);
    expect(result.edgeFlows.edge_140!.toNumber()).toBeGreaterThan(0);

    expect(result.nodeLoad.node_96!.toNumber()).toBeCloseTo(1, 3);
    expect(result.nodePortOutRecipeLoad.node_96!.out_0!.toNumber()).toBeCloseTo(1, 3);

    expect(result.cycleSeeds).toBeDefined();
    expect(result.cycleSeeds).toHaveLength(1);
    expect(result.cycleSeeds![0]!.edgeId).toBe('edge_141');
    expect(result.cycleSeeds![0]!.productId).toBe('gtceu:tiny_rhenium_dust');
    expect(result.cycleSeeds![0]!.seedFlowPerSecond).toBeGreaterThan(0);

    const notRunning = check.issues.filter((i) => i.code === 'cycle_not_running');
    expect(notRunning).toHaveLength(0);

    const cycleBalance = check.issues.filter(
      (i) => i.code === 'cycle_product_deficit' || i.code === 'cycle_product_surplus',
    );
    expect(cycleBalance.every((i) => i.context?.productId === 'gtceu:tiny_rhenium_dust')).toBe(
      true,
    );
    expect(cycleBalance.every((i) => i.edgeId === 'edge_141')).toBe(true);
    expect(
      check.issues.some(
        (i) =>
          i.code === 'cycle_product_deficit' && i.context?.productId === 'gtceu:steam',
      ),
    ).toBe(false);

    const seed = result.cycleSeeds![0]!;
    expect(seed.producePerSecond).toBeGreaterThan(0);
    expect(seed.consumePerSecond).toBeGreaterThan(0);
    expect(seed.produceAttemptPerSecond).toBeGreaterThan(seed.producePerSecond);
    expect(seed.consumeAttemptPerSecond).toBeGreaterThan(seed.consumePerSecond);
    expect(seed.catalystChance).toBe(1000);
    expect(seed.reproductionPercent).toBeDefined();
    expect(seed.reproductionPercent!).toBeGreaterThanOrEqual(99);
    expect(seed.reproductionPercent!).toBeLessThanOrEqual(101);
    expect(seed.netPerSecond).toBeCloseTo(0, 2);
    expect(seed.mode).toBe('stable');
    expect(seed.theoreticalDemandPerSecond).toBeGreaterThan(0);
    expect(seed.recommendedCapacity).toBeGreaterThanOrEqual(100);
    expect(seed.recommendedCapacity).toBeLessThanOrEqual(120);
    expect(seed.recommendedCapacityDetail).toBeDefined();
    expect(seed.bufferMaintainAmount).toBe(300);
  });

  it('bootstraps rhenium loop when intermediate buffer capacity is zero', () => {
    const { scheme } = solveFixture(RHENIUM_LOOP_FIXTURE);
    const pack = loadTestPack(scheme.modpack.version);
    const snap = {
      nodes: scheme.nodes.map((n) =>
        n.id === 'node_139' ? { ...n, capacity: 0 } : n,
      ),
      edges: scheme.edges,
      edgeConstraints: scheme.edgeConstraints ?? [],
      viewport: scheme.viewport,
    };
    const zeroCapResult = runSolver(snap, pack, { preserveManualMachineCounts: true });

    expect(zeroCapResult.edgeFlows.edge_141!.toNumber()).toBeGreaterThan(0);
    expect(zeroCapResult.nodeLoad.node_96!.toNumber()).toBeGreaterThan(0);
    expect(zeroCapResult.cycleSeeds![0]!.theoreticalDemandPerSecond).toBeGreaterThan(0);
  });
});
