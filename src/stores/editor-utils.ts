import type { TfgpFile, TfgpNode, TfgpEdge, TfgpTarget } from '@/schema/tfgp';
import type { FlowResult } from '@/calculator/flow-solver';
import { solveFlows } from '@/calculator/flow-solver';
import type { PackData } from '@/data/types';

export interface EditorSnapshot {
  nodes: TfgpNode[];
  edges: TfgpEdge[];
  targets: TfgpTarget[];
  viewport: TfgpFile['viewport'];
}

export function runSolver(
  snapshot: EditorSnapshot,
  pack: PackData,
): FlowResult {
  return solveFlows({
    pack,
    nodes: snapshot.nodes.map((n) => ({
      id: n.id,
      machineId: n.machineId,
      recipeId: n.recipeId,
      machineCount: n.machineCount,
      overclock: n.overclock,
      parallel: n.parallel,
      outputMultiplier: n.outputMultiplier,
    })),
    edges: snapshot.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      itemId: e.itemId,
      fluidId: e.fluidId,
    })),
    targets: snapshot.targets
      .filter((t) => t.nodeId)
      .map((t) => ({
        nodeId: t.nodeId!,
        itemId: t.itemId,
        fluidId: t.fluidId,
        ratePerSecond: t.ratePerSecond,
      })),
  });
}

export function applyFlowResult(
  nodes: TfgpNode[],
  result: FlowResult,
): TfgpNode[] {
  return nodes.map((n) => ({
    ...n,
    machineCount: result.nodeMachineCounts[n.id] ?? n.machineCount,
  }));
}

let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}
