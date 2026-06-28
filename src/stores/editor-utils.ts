import type { TfgpFile, TfgpNode, TfgpEdge, TfgpTarget } from '@/schema/tfgp';
import type { FlowResult } from '@/calculator/flow-solver';
import { solveFlows } from '@/calculator/flow-solver';
import type { PackData } from '@/data/types';
import type { ActivePack } from '@/data/pack-runtime';
import { getRecipe } from '@/data/pack-registry';
import { normalizeNodeScaling, normalizeBufferNode, type RawTfgpNode } from '@/lib/node-scaling';
import { normalizeNodeVoltage } from '@/lib/node-voltage';
import { isBufferNode, isMachineNode } from '@/lib/node-kind';

/** Normalize legacy/missing node fields (voltage tier, scaling) after load or rehydrate. */
export function normalizeSchemeNodes(
  nodes: readonly (TfgpNode | RawTfgpNode)[],
  pack?: ActivePack | PackData | null,
): TfgpNode[] {
  return nodes.map(normalizeNodeScaling).map((n) => {
    if (isBufferNode(n)) return normalizeBufferNode(n);
    if (!pack || !isMachineNode(n)) return n;
    const recipe = getRecipe(pack, n.recipeId);
    return normalizeNodeVoltage(n, recipe);
  });
}

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
    nodes: snapshot.nodes.map((n) => {
      if (isBufferNode(n)) {
        return {
          id: n.id,
          kind: n.kind,
          machineId: '',
          recipeId: '',
          machineCount: 1,
          overclock: 1,
          parallel: 1,
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
        parallel: normalized.parallel,
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
  return nodes.map((n) => {
    if (!isMachineNode(n)) return n;
    return {
      ...n,
      machineCount: result.nodeMachineCounts[n.id] ?? n.machineCount,
    };
  });
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
