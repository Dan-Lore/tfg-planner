import type { NodeRect } from '@/editor-graph/node-layout-constants';
import { buildSchemeObstacleRects } from '@/editor-graph/scheme-obstacles';
import type { NodeDynamicDisplay } from '@/editor-graph/node-display-types';
import type { PackLike } from '@/data/pack-registry';
import type { SchemeIssue } from '@/scheme-check/check-scheme';
import type { TfgpEdge, TfgpNode } from '@/schema/tfgp';

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasPoint {
  x: number;
  y: number;
}

function rectCenter(rect: NodeRect): CanvasPoint {
  return {
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2,
  };
}

/** React Flow viewport that places `point` at the canvas center (zoom unchanged). */
export function viewportToCenterOn(
  point: CanvasPoint,
  zoom: number,
  canvasWidth: number,
  canvasHeight: number,
): ViewportState {
  return {
    x: canvasWidth / 2 - point.x * zoom,
    y: canvasHeight / 2 - point.y * zoom,
    zoom,
  };
}

/** Flow coordinates at the center of the visible canvas for a given viewport. */
export function flowPointAtCanvasCenter(
  viewport: ViewportState,
  canvasWidth: number,
  canvasHeight: number,
): CanvasPoint {
  return {
    x: (canvasWidth / 2 - viewport.x) / viewport.zoom,
    y: (canvasHeight / 2 - viewport.y) / viewport.zoom,
  };
}

function nodeCenterById(
  nodeId: string,
  nodes: TfgpNode[],
  pack: PackLike,
  layoutWidthByNodeId: Record<string, number>,
  displayById: Readonly<Record<string, NodeDynamicDisplay>>,
): CanvasPoint | undefined {
  const obstacles = buildSchemeObstacleRects(
    nodes,
    pack,
    layoutWidthByNodeId,
    displayById,
  );
  const entry = obstacles.find((o) => o.nodeId === nodeId);
  return entry ? rectCenter(entry.rect) : undefined;
}

function centroidOfNodeIds(
  nodeIds: string[],
  nodes: TfgpNode[],
  pack: PackLike,
  layoutWidthByNodeId: Record<string, number>,
  displayById: Readonly<Record<string, NodeDynamicDisplay>>,
): CanvasPoint | undefined {
  const points: CanvasPoint[] = [];
  for (const id of nodeIds) {
    const center = nodeCenterById(id, nodes, pack, layoutWidthByNodeId, displayById);
    if (center) points.push(center);
  }
  if (points.length === 0) return undefined;
  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 },
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

export interface ResolveIssueFocusContext {
  nodes: TfgpNode[];
  edges: TfgpEdge[];
  pack: PackLike;
  layoutWidthByNodeId: Record<string, number>;
  displayById: Readonly<Record<string, NodeDynamicDisplay>>;
}

/** Canvas point to focus for a scheme-check issue. */
export function resolveIssueFocusPoint(
  issue: SchemeIssue,
  ctx: ResolveIssueFocusContext,
): CanvasPoint | undefined {
  const { nodes, edges, pack, layoutWidthByNodeId, displayById } = ctx;

  if (issue.nodeId) {
    return nodeCenterById(issue.nodeId, nodes, pack, layoutWidthByNodeId, displayById);
  }

  if (issue.edgeId) {
    const edge = edges.find((e) => e.id === issue.edgeId);
    if (!edge) return undefined;
    const source = nodeCenterById(edge.source, nodes, pack, layoutWidthByNodeId, displayById);
    const target = nodeCenterById(edge.target, nodes, pack, layoutWidthByNodeId, displayById);
    if (source && target) {
      return { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 };
    }
    return source ?? target;
  }

  const nodeIdsRaw = issue.context?.nodeIds;
  if (nodeIdsRaw) {
    const ids = nodeIdsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return centroidOfNodeIds(ids, nodes, pack, layoutWidthByNodeId, displayById);
  }

  return undefined;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function animateViewport(
  from: ViewportState,
  to: ViewportState,
  durationMs: number,
  onFrame: (viewport: ViewportState) => void,
  onComplete: (viewport: ViewportState) => void,
): () => void {
  if (durationMs <= 0) {
    onFrame(to);
    onComplete(to);
    return () => {};
  }

  const start = performance.now();
  let frameId = 0;
  let cancelled = false;

  const tick = (now: number) => {
    if (cancelled) return;
    const t = Math.min(1, (now - start) / durationMs);
    const eased = easeOutCubic(t);
    const viewport: ViewportState = {
      x: from.x + (to.x - from.x) * eased,
      y: from.y + (to.y - from.y) * eased,
      zoom: from.zoom,
    };
    onFrame(viewport);
    if (t >= 1) {
      onComplete(viewport);
      return;
    }
    frameId = requestAnimationFrame(tick);
  };

  frameId = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    cancelAnimationFrame(frameId);
  };
}
