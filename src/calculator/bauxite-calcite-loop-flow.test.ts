import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTfgp } from '@/schema/tfgp';
import { loadTestPack } from '@/test-fixtures/load-test-pack';
import { runSolver } from '@/lib/scheme-solver';
import { checkScheme } from '@/scheme-check/check-scheme';

const BAUXITE_CALCITE_FIXTURE = path.join(
  process.cwd(),
  'src/lib/fixtures/bauxite-calcite-loop.tfgp',
);

const BAUXITE_FULL_SCHEME = path.join(
  process.cwd(),
  'Переработка руды (Бокситовый шлак) (3).tfgp',
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

describe('bauxite calcite loop cycle bootstrap', () => {
  it('bootstraps calcite and sulfuric acid buffers in one SCC', () => {
    const { result, check } = solveFixture(BAUXITE_CALCITE_FIXTURE);

    expect(result.edgeFlows.edge_119!.toNumber()).toBeGreaterThan(0);
    expect(result.edgeFlows.edge_85!.toNumber()).toBeGreaterThan(0);
    expect(result.nodeLoad.node_40!.toNumber()).toBeGreaterThan(0);
    expect(result.nodeLoad.node_44!.toNumber()).toBeGreaterThan(0);
    expect(result.nodeLoad.node_48!.toNumber()).toBeGreaterThan(0);
    expect(result.nodeLoad.node_93!.toNumber()).toBeGreaterThan(0);

    const catalystWarnings = check.issues.filter((i) => i.code === 'catalyst_imbalance');
    expect(catalystWarnings).toHaveLength(0);

    const calciteSeed = result.cycleSeeds?.find((s) => s.productId === 'gtceu:calcite_dust');
    const acidSeed = result.cycleSeeds?.find((s) => s.productId === 'gtceu:sulfuric_acid');
    expect(calciteSeed?.seedFlowPerSecond).toBeGreaterThan(0);
    expect(acidSeed?.seedFlowPerSecond).toBeGreaterThan(0);
  });

  it('sign-off full bauxite slag scheme when present', () => {
    try {
      readFileSync(BAUXITE_FULL_SCHEME, 'utf8');
    } catch {
      return;
    }
    const { result, check } = solveFixture(BAUXITE_FULL_SCHEME);

    expect(result.edgeFlows.edge_119!.toNumber()).toBeGreaterThan(0);
    expect(result.nodeLoad.node_40!.toNumber()).toBeGreaterThan(0);

    const catalystWarnings = check.issues.filter((i) => i.code === 'catalyst_imbalance');
    expect(catalystWarnings).toHaveLength(0);
  });
});
