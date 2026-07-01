import type { Edge, Node } from '@xyflow/react';
import { machineNodeRfStyle } from '@/canvas/node-bounds';

const LAYOUT_WIDTH_EPS = 0.5;

function nodeLayoutWidth(node: Node): number | undefined {
  const w = (node.data as { layoutWidth?: number } | undefined)?.layoutWidth;
  return typeof w === 'number' ? w : undefined;
}

function portTopologySig(node: Node): string {
  const d = node.data as
    | {
        inputPortIds?: string[];
        outputPortIds?: string[];
        inputPorts?: { portId: string }[];
        outputPorts?: { portId: string }[];
      }
    | undefined;
  if (d?.inputPortIds || d?.outputPortIds) {
    return `${(d.inputPortIds ?? []).join(',')}|${(d.outputPortIds ?? []).join(',')}`;
  }
  const ins = (d?.inputPorts ?? []).map((p) => p.portId).join(',');
  const outs = (d?.outputPorts ?? []).map((p) => p.portId).join(',');
  return `${ins}|${outs}`;
}

function layoutWidthChanged(
  prevWidth: number | undefined,
  nextWidth: number | undefined,
  measuredWidth: number | undefined,
): boolean {
  if (nextWidth == null) return false;
  if (prevWidth == null) return true;
  if (Math.abs(prevWidth - nextWidth) > LAYOUT_WIDTH_EPS) return true;
  if (
    measuredWidth != null &&
    Math.abs(measuredWidth - nextWidth) > LAYOUT_WIDTH_EPS
  ) {
    return true;
  }
  return false;
}

/** Merge store-derived nodes into React Flow state, preserving in-progress drag positions. */
export function mergeFlowNodes(
  prev: Node[],
  next: Node[],
  draggingNodeIds: ReadonlySet<string> = new Set(),
): Node[] {
  const prevById = new Map(prev.map((n) => [n.id, n]));
  return next.map((rf) => {
    const existing = prevById.get(rf.id);
    if (!existing) return rf;

    const nextLayoutWidth = nodeLayoutWidth(rf);
    const prevLayoutWidth = nodeLayoutWidth(existing);
    const portsChanged = portTopologySig(existing) !== portTopologySig(rf);
    const widthChanged =
      layoutWidthChanged(
        prevLayoutWidth,
        nextLayoutWidth,
        existing.measured?.width,
      ) || portsChanged;

    const position = draggingNodeIds.has(rf.id) ? existing.position : rf.position;
    const rfStyle = machineNodeRfStyle(nextLayoutWidth);

    return {
      ...rf,
      position,
      selected: existing.selected,
      ...(rfStyle ? { style: rfStyle } : {}),
      measured: widthChanged ? undefined : (existing.measured ?? rf.measured),
    };
  });
}

/** Apply store selection to React Flow nodes (store is source of truth). */
export function applyFlowNodeSelection(
  nodes: Node[],
  selectedNodeIds: readonly string[],
): Node[] {
  const selected = new Set(selectedNodeIds);
  return nodes.map((node) => {
    const nextSelected = selected.has(node.id);
    return node.selected === nextSelected ? node : { ...node, selected: nextSelected };
  });
}

/** Apply store selection to React Flow edges (store is source of truth). */
export function applyFlowEdgeSelection(
  edges: Edge[],
  selectedEdgeIds: readonly string[],
): Edge[] {
  const selected = new Set(selectedEdgeIds);
  return edges.map((edge) => {
    const nextSelected = selected.has(edge.id);
    return edge.selected === nextSelected ? edge : { ...edge, selected: nextSelected };
  });
}
