import type { TfgpNode, TfgpEdge } from '@/schema/tfgp';

export {
  applyFlowResult,
  runSolver,
  type EditorSnapshot,
  type FlowApplyMode,
  type RunSolverOptions,
} from '@/editor-graph/scheme-solver';

export { normalizeSchemeNodes } from '@/editor-graph/scheme-normalize';

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
}

export interface CloneSchemeFragmentResult {
  nodes: TfgpNode[];
  edges: TfgpEdge[];
  newNodeIds: string[];
}

const CLONE_OFFSET = { x: 40, y: 40 };

/** Copy selected nodes and internal edges with fresh ids and position offset. */
export function cloneSchemeFragment(
  nodes: readonly TfgpNode[],
  edges: readonly TfgpEdge[],
  selectedNodeIds: readonly string[],
  positionOffset: { x: number; y: number } = CLONE_OFFSET,
): CloneSchemeFragmentResult {
  const idSet = new Set(selectedNodeIds);
  if (idSet.size === 0) {
    return { nodes: [], edges: [], newNodeIds: [] };
  }

  const toCopy = nodes.filter((n) => idSet.has(n.id));
  const idMap = new Map<string, string>();
  const workingNodes = [...nodes];
  const workingEdges = [...edges];
  const newNodes: TfgpNode[] = [];

  for (const n of toCopy) {
    const id = allocateNodeId(workingNodes, workingEdges);
    idMap.set(n.id, id);
    const cloned: TfgpNode = {
      ...n,
      id,
      position: {
        x: n.position.x + positionOffset.x,
        y: n.position.y + positionOffset.y,
      },
    };
    newNodes.push(cloned);
    workingNodes.push(cloned);
  }

  const internalEdges = edges.filter(
    (e) => idSet.has(e.source) && idSet.has(e.target),
  );
  const newEdges: TfgpEdge[] = [];
  for (const edge of internalEdges) {
    const source = idMap.get(edge.source);
    const target = idMap.get(edge.target);
    if (!source || !target) continue;
    const id = allocateEdgeId(workingNodes, [...workingEdges, ...newEdges]);
    newEdges.push({
      ...edge,
      id,
      source,
      target,
    });
  }

  return { nodes: newNodes, edges: newEdges, newNodeIds: newNodes.map((n) => n.id) };
}

export interface SchemeClipboard {
  nodes: TfgpNode[];
  edges: TfgpEdge[];
}

/** Snapshot of a fragment for copy/paste (ids preserved). */
export function snapshotSchemeFragment(
  nodes: readonly TfgpNode[],
  edges: readonly TfgpEdge[],
  selectedNodeIds: readonly string[],
): SchemeClipboard | null {
  const idSet = new Set(selectedNodeIds);
  if (idSet.size === 0) return null;
  const fragmentNodes = nodes.filter((n) => idSet.has(n.id));
  const fragmentEdges = edges.filter(
    (e) => idSet.has(e.source) && idSet.has(e.target),
  );
  return {
    nodes: structuredClone(fragmentNodes),
    edges: structuredClone(fragmentEdges),
  };
}

/** Paste clipboard fragment with fresh ids. */
export function pasteSchemeFragment(
  _nodes: readonly TfgpNode[],
  _edges: readonly TfgpEdge[],
  clipboard: SchemeClipboard,
  positionOffset: { x: number; y: number } = CLONE_OFFSET,
): CloneSchemeFragmentResult {
  return cloneSchemeFragment(
    clipboard.nodes,
    clipboard.edges,
    clipboard.nodes.map((n) => n.id),
    positionOffset,
  );
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

/** Reassign ids for duplicate nodes and remap edges that pointed at renamed nodes. */
export function dedupeSchemeTopology(
  nodes: TfgpNode[],
  edges: TfgpEdge[],
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

  return { nodes: dedupedNodes, edges: remappedEdges };
}

/** @deprecated Use {@link dedupeSchemeTopology} — does not remap edges. */
export function dedupeNodeIds(nodes: TfgpNode[], edges: TfgpEdge[]): TfgpNode[] {
  return dedupeSchemeTopology(nodes, edges).nodes;
}
