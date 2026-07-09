import { customMachineRecipeId } from '@/calculator/custom-machine-recipe';
import type { FlowResult } from '@/calculator/flow-solver';
import { analyzeCycles, findCycleComponents, isBalancedNet, type CycleAnalysisNode } from '@/calculator/cycle-analysis';
import type { SchemeNode } from '@/calculator/flow-solver-types';
import { findCycleSeedEdgeId, findPrimaryCycleSeedEdge } from '@/calculator/cycle-bootstrap';
import {
  isProductExternallySuppliedToScc,
  seedProductKey,
} from '@/editor-graph/cycle-seed-metrics';
import type { PackData } from '@/data/types';
import { buildTagIndex } from '@/shared/tag-index';
import {
  isCustomMachineNode,
  isIntermediateBufferNode,
  isMachineNode,
} from '@/shared/node-kind';
import type { TfgpFile, TfgpNode } from '@/schema/tfgp';
import { normalizeSchemeNodes } from '@/stores/editor-utils';
import type { SchemeIssue } from '@/scheme-check/check-scheme';

function toCycleAnalysisNodes(nodes: TfgpNode[]): CycleAnalysisNode[] {
  return nodes.map((n) => {
    if (isCustomMachineNode(n)) {
      return {
        id: n.id,
        kind: 'custom_machine' as const,
        recipeId: customMachineRecipeId(n.id),
        machineCount: n.machineCount,
        overclock: n.overclock,
        durationTicks: n.durationTicks,
        customInputs: n.inputs,
        customOutputs: n.outputs,
        primaryOutputIndex: n.primaryOutputIndex,
      };
    }
    if (isMachineNode(n)) {
      return {
        id: n.id,
        kind: 'machine' as const,
        machineId: n.machineId,
        recipeId: n.recipeId,
        machineCount: n.machineCount,
        overclock: n.overclock,
        voltageTier: n.voltageTier,
        primaryOutputIndex: n.primaryOutputIndex,
      };
    }
    if (isIntermediateBufferNode(n)) {
      return {
        id: n.id,
        kind: 'intermediate_buffer' as const,
        itemId: n.itemId,
        fluidId: n.fluidId,
      };
    }
    return { id: n.id, kind: n.kind };
  });
}

export function checkCycleBalance(
  scheme: TfgpFile,
  pack: PackData,
  flowResult: FlowResult,
  tags: ReturnType<typeof buildTagIndex>,
): SchemeIssue[] {
  const issues: SchemeIssue[] = [];
  const normalizedNodes = normalizeSchemeNodes(scheme.nodes, pack);
  const nodes = toCycleAnalysisNodes(normalizedNodes);
  const solverNodes = normalizedNodes as unknown as SchemeNode[];
  const components = findCycleComponents(solverNodes, scheme.edges);

  for (const scc of components) {
    if (!findPrimaryCycleSeedEdge(scc, solverNodes, scheme.edges)) {
      issues.push({
        severity: 'warning',
        code: 'cycle_no_seed',
        message: `Петля ${scc.index + 1} (${scc.nodeIds.join(', ')}): нет ребра buffer→кольцо для bootstrap`,
        context: {
          sccIndex: String(scc.index + 1),
          nodeIds: scc.nodeIds.join(', '),
        },
      });
    }
  }

  const analysis = analyzeCycles(nodes, scheme.edges, pack, flowResult, tags);
  const notRunningSccs = new Set(analysis.notRunning.map((n) => n.sccIndex));

  for (const { sccIndex, nodeIds } of analysis.notRunning) {
    issues.push({
      severity: 'warning',
      code: 'cycle_not_running',
      edgeId: findCycleSeedEdgeId(flowResult, sccIndex),
      message: `Петля ${sccIndex + 1} (${nodeIds.join(', ')}): потоки ≈ 0 при ненулевой теоретической мощности`,
      context: {
        sccIndex: String(sccIndex + 1),
        nodeIds: nodeIds.join(', '),
      },
    });
  }

  const seedProductKeys = new Set(
    (flowResult.cycleSeeds ?? []).map((s) => seedProductKey(s.sccIndex, s.productId)),
  );
  const sccNodeIdSets = new Map(
    components.map((scc) => [scc.index, new Set(scc.nodeIds)] as const),
  );

  for (const balance of analysis.balances) {
    if (notRunningSccs.has(balance.sccIndex)) continue;
    if (isBalancedNet(balance.net)) continue;

    const key = seedProductKey(balance.sccIndex, balance.productId);
    if (!seedProductKeys.has(key)) continue;

    const sccNodes = sccNodeIdSets.get(balance.sccIndex);
    if (
      sccNodes &&
      isProductExternallySuppliedToScc(sccNodes, balance.productId, solverNodes, scheme.edges)
    ) {
      continue;
    }

    const net = balance.net.toNumber();
    const code = net < 0 ? 'cycle_product_deficit' : 'cycle_product_surplus';
    const seed = flowResult.cycleSeeds?.find(
      (s) => s.sccIndex === balance.sccIndex && s.productId === balance.productId,
    );
    issues.push({
      severity: 'warning',
      code,
      edgeId: findCycleSeedEdgeId(flowResult, balance.sccIndex, balance.productId),
      message: `Петля ${balance.sccIndex + 1}: ${balance.productId} net ${net.toFixed(6)}/s`,
      context: {
        sccIndex: String(balance.sccIndex + 1),
        productId: balance.productId,
        netRate: net.toFixed(6),
        reproductionPercent:
          seed?.reproductionPercent !== undefined
            ? String(seed.reproductionPercent)
            : undefined,
        bufferMaintainAmount:
          seed?.bufferMaintainAmount !== undefined
            ? String(seed.bufferMaintainAmount)
            : undefined,
      },
    });
  }

  for (const imbalance of analysis.catalystImbalances) {
    issues.push({
      severity: 'warning',
      code: 'catalyst_imbalance',
      message: `Петля ${imbalance.sccIndex + 1}: катализатор ${imbalance.productId} consume/produce ≈ ${imbalance.ratio.toFixed(3)}`,
      context: {
        sccIndex: String(imbalance.sccIndex + 1),
        productId: imbalance.productId,
        balanceRatio: imbalance.ratio.toFixed(4),
        nodeIds: imbalance.nodeIds.join(', '),
      },
    });
  }

  return issues;
}
