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
  mode: FlowApplyMode,
): TfgpNode[] {
  if (mode === 'preserve') {
    return nodes;
  }
  return nodes.map((n) => ({
    ...n,
    machineCount: result.nodeMachineCounts[n.id] ?? n.machineCount,
  }));
}

const ID_NUMERIC_SUFFIX = /^(?:node|edge)_(\d+)$/;

let idCounter = 0;

/** @internal Test helper */
export function resetIdCounter(): void {
  idCounter = 0;
}

/** Align the counter with ids already present in a scheme (e.g. after import or reload). */
export function seedIdCounter(
  nodes: { id: string }[],
  edges: { id: string }[],
): void {
  let max = 0;
  for (const { id } of [...nodes, ...edges]) {
    const match = ID_NUMERIC_SUFFIX.exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  idCounter = Math.max(idCounter, max);
}

export function nextId(prefix: string, taken?: ReadonlySet<string>): string {
  for (;;) {
    idCounter += 1;
    const id = `${prefix}_${idCounter}`;
    if (!taken?.has(id)) return id;
  }
}

export function allocateNodeId(
  nodes: { id: string }[],
  edges: { id: string }[],
): string {
  seedIdCounter(nodes, edges);
  const taken = new Set(nodes.map((n) => n.id));
  return nextId('node', taken);
}

export function allocateEdgeId(
  nodes: { id: string }[],
  edges: { id: string }[],
): string {
  seedIdCounter(nodes, edges);
  const taken = new Set(edges.map((e) => e.id));
  return nextId('edge', taken);
}

/** Reassign ids for duplicate nodes so each entry is unique. */
export function dedupeNodeIds(nodes: TfgpNode[], edges: TfgpEdge[]): TfgpNode[] {
  seedIdCounter(nodes, edges);
  const taken = new Set<string>();
  return nodes.map((node) => {
    if (!taken.has(node.id)) {
      taken.add(node.id);
      return node;
    }
    const id = nextId('node', taken);
    taken.add(id);
    return { ...node, id };
  });
}
