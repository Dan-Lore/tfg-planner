import type { Edge, Node } from '@xyflow/react';
import { machineNodeRfStyle } from '@/editor-graph/node-layout-constants';
import type { FlowEdgeData } from '@/editor-graph/flow-edge-types';

const LAYOUT_WIDTH_EPS = 0.5;

function nodeStyleEqual(
  a: Node['style'] | undefined,
  b: Node['style'] | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return a.width === b.width && a.height === b.height;
}

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

    if (
      !widthChanged &&
      !draggingNodeIds.has(rf.id) &&
      position.x === existing.position.x &&
      position.y === existing.position.y &&
      rf.data === existing.data &&
      nodeStyleEqual(existing.style, rfStyle)
    ) {
      return existing;
    }

    return {
      ...rf,
      position,
      ...(rfStyle ? { style: rfStyle } : {}),
      measured: widthChanged ? undefined : (existing.measured ?? rf.measured),
    };
  });
}

function rfSelected(value: boolean | undefined): boolean {
  return value === true;
}

export function flowGraphArraysEqual<T>(prev: T[], next: T[]): boolean {
  return prev.length === next.length && prev.every((item, i) => item === next[i]);
}

/** Apply store selection to React Flow nodes (store is source of truth). */
export function applyFlowNodeSelection(
  nodes: Node[],
  selectedNodeIds: readonly string[],
): Node[] {
  const selected = new Set(selectedNodeIds);
  let changed = false;
  const next = nodes.map((node) => {
    const shouldSelect = selected.has(node.id);
    if (rfSelected(node.selected) === shouldSelect) return node;
    changed = true;
    return { ...node, selected: shouldSelect };
  });
  return changed ? next : nodes;
}

/** Merge store-derived edges into React Flow state, preserving in-canvas selection. */
export function mergeFlowEdges(prev: Edge[], next: Edge[]): Edge[] {
  const prevById = new Map(prev.map((e) => [e.id, e]));
  return next.map((edge) => {
    const existing = prevById.get(edge.id);
    if (!existing) return edge;
    let merged: Edge;
    if (
      edge.source === existing.source &&
      edge.target === existing.target &&
      edge.sourceHandle === existing.sourceHandle &&
      edge.targetHandle === existing.targetHandle &&
      edge.data === existing.data &&
      edge.animated === existing.animated
    ) {
      merged = existing;
    } else {
      merged = edge;
    }
    if (rfSelected(existing.selected) && !rfSelected(merged.selected)) {
      return { ...merged, selected: true };
    }
    return merged;
  });
}

/** Apply programmatic edge highlight (issues panel). Not used in canvas sync loop. */
export function applyFlowEdgeSelection(
  edges: Edge[],
  selectedEdgeIds: readonly string[],
): Edge[] {
  const selected = new Set(selectedEdgeIds);
  let changed = false;
  const next = edges.map((edge) => {
    const shouldSelect = selected.has(edge.id);
    if (rfSelected(edge.selected) === shouldSelect) return edge;
    changed = true;
    return { ...edge, selected: shouldSelect };
  });
  return changed ? next : edges;
}

/** Highlight edge opened from scheme-check issues panel (survives rfEdges data refresh). */
export function applyIssuePanelEdgeFocus(
  edges: Edge[],
  focusEdgeId: string | null,
): Edge[] {
  let changed = false;
  const next = edges.map((edge) => {
    const focused = focusEdgeId !== null && edge.id === focusEdgeId;
    const data = (edge.data ?? {}) as FlowEdgeData;
    if (data.issuePanelFocus === (focused ? true : undefined)) {
      return edge;
    }
    changed = true;
    const nextData: FlowEdgeData = { ...data };
    if (focused) {
      nextData.issuePanelFocus = true;
    } else {
      delete nextData.issuePanelFocus;
    }
    return { ...edge, data: nextData };
  });
  return changed ? next : edges;
}
