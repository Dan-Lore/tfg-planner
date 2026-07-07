import type { TfgpFile, TfgpNode } from '@/schema/tfgp';
import type { FlowResult } from '@/calculator/flow-solver';
import { solveFlows } from '@/calculator/flow-solver';
import type { PackData } from '@/data/types';
import { getRecipe } from '@/data/pack-registry';
import { normalizeNodeVoltage } from '@/lib/node-voltage';
import { isBufferNode, isCustomMachineNode, isMachineNode } from '@/lib/node-kind';
import { customMachineRecipeId } from '@/calculator/custom-machine-recipe';

export interface EditorSnapshot {
  nodes: TfgpNode[];
  edges: TfgpFile['edges'];
  edgeConstraints: TfgpFile['edgeConstraints'];
  viewport: TfgpFile['viewport'];
}

export type FlowApplyMode = 'preserve' | 'full';

export interface RunSolverOptions {
  preserveManualMachineCounts?: boolean;
}

export function runSolver(
  snapshot: EditorSnapshot,
  pack: PackData,
  options: RunSolverOptions = {},
): FlowResult {
  return solveFlows({
    pack,
    preserveManualMachineCounts: options.preserveManualMachineCounts,
    nodes: snapshot.nodes.map((n) => {
      if (isBufferNode(n)) {
        return {
          id: n.id,
          kind: n.kind,
          machineId: '',
          recipeId: '',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
          itemId: n.itemId,
          fluidId: n.fluidId,
          capacity: n.capacity,
          supplyMode: n.kind === 'start_buffer' ? n.supplyMode : undefined,
          supplyRate: n.kind === 'start_buffer' ? n.supplyRate : undefined,
          initialStock: n.kind === 'start_buffer' ? n.initialStock : undefined,
          autoSupplyRate: n.kind === 'start_buffer' ? n.autoSupplyRate : undefined,
        };
      }
      if (isCustomMachineNode(n)) {
        return {
          id: n.id,
          kind: 'custom_machine' as const,
          machineId: '__custom__',
          recipeId: customMachineRecipeId(n.id),
          machineCount: n.machineCount,
          overclock: n.overclock,
          voltageTier: 'LV',
          durationTicks: n.durationTicks,
          customInputs: n.inputs,
          customOutputs: n.outputs,
          primaryOutputIndex: n.primaryOutputIndex,
        };
      }
      if (!isMachineNode(n)) {
        throw new Error(`Unexpected node kind for flow solve: ${(n as TfgpNode).id}`);
      }
      const recipe = getRecipe(pack, n.recipeId);
      const normalized = normalizeNodeVoltage(n, recipe);
      return {
        id: normalized.id,
        kind: 'machine' as const,
        machineId: normalized.machineId,
        recipeId: normalized.recipeId,
        machineCount: normalized.machineCount,
        overclock: normalized.overclock,
        voltageTier: normalized.voltageTier,
      };
    }),
    edges: snapshot.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourcePort: e.sourcePort,
      targetPort: e.targetPort,
      itemId: e.itemId,
      fluidId: e.fluidId,
    })),
    edgeConstraints: (snapshot.edgeConstraints ?? []).map((c) => ({
      edgeId: c.edgeId,
      ratePerSecond: c.ratePerSecond,
    })),
  });
}

export function applyFlowResult(
  nodes: TfgpNode[],
  result: FlowResult,
  mode: FlowApplyMode,
): TfgpNode[] {
  if (mode === 'preserve') {
    return nodes;
  }
  return nodes.map((n) => {
    if (isMachineNode(n) || isCustomMachineNode(n)) {
      return {
        ...n,
        machineCount: result.nodeMachineCounts[n.id] ?? n.machineCount,
      };
    }
    return n;
  });
}
