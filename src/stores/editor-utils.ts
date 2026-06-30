import type { TfgpNode, TfgpEdge, TfgpTarget } from '@/schema/tfgp';
import type { ActivePack } from '@/data/pack-runtime';
import type { PackData } from '@/data/types';
import { getRecipe } from '@/data/pack-registry';
import { normalizeNodeScaling, normalizeBufferNode, type RawTfgpNode } from '@/lib/node-scaling';
import { normalizeNodeVoltage } from '@/lib/node-voltage';
import { isBufferNode, isMachineNode } from '@/lib/node-kind';

export {
  applyFlowResult,
  runSolver,
  type EditorSnapshot,
  type FlowApplyMode,
  type RunSolverOptions,
} from '@/lib/scheme-solver';

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

export interface DedupeSchemeTopologyResult {
  nodes: TfgpNode[];
  edges: TfgpEdge[];
  targets: TfgpTarget[];
}

function remapEndpointId(
  endpoint: string,
  originalNodes: readonly TfgpNode[],
  dedupedNodes: readonly TfgpNode[],
): string {
  const indices = originalNodes
    .map((n, i) => (n.id === endpoint ? i : -1))
    .filter((i) => i >= 0);
  if (indices.length !== 1) return endpoint;
  const i = indices[0]!;
  const nextId = dedupedNodes[i]?.id;
  return nextId && nextId !== endpoint ? nextId : endpoint;
}

/** Reassign ids for duplicate nodes and remap edges/targets that pointed at renamed nodes. */
export function dedupeSchemeTopology(
  nodes: TfgpNode[],
  edges: TfgpEdge[],
  targets: TfgpTarget[] = [],
): DedupeSchemeTopologyResult {
  seedIdCounter(nodes, edges);
  const taken = new Set<string>();
  const dedupedNodes = nodes.map((node) => {
    if (!taken.has(node.id)) {
      taken.add(node.id);
      return node;
    }
    const id = nextId('node', taken);
    taken.add(id);
    return { ...node, id };
  });

  const remappedEdges = edges.map((edge) => ({
    ...edge,
    source: remapEndpointId(edge.source, nodes, dedupedNodes),
    target: remapEndpointId(edge.target, nodes, dedupedNodes),
  }));

  const remappedTargets = targets.map((target) => {
    if (!target.nodeId) return target;
    return {
      ...target,
      nodeId: remapEndpointId(target.nodeId, nodes, dedupedNodes),
    };
  });

  return { nodes: dedupedNodes, edges: remappedEdges, targets: remappedTargets };
}

/** @deprecated Use {@link dedupeSchemeTopology} — does not remap edges/targets. */
export function dedupeNodeIds(nodes: TfgpNode[], edges: TfgpEdge[]): TfgpNode[] {
  return dedupeSchemeTopology(nodes, edges).nodes;
}
