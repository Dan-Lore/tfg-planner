import { Position } from '@xyflow/react';
import { flowEdgeLabelCenterOffset } from '@/lib/flow-edge-label-metrics';

interface BezierEndpoints {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition?: Position;
  targetPosition?: Position;
  curvature?: number;
}

function controlOffset(distance: number, curvature: number): number {
  if (distance >= 0) return 0.5 * distance;
  return curvature * 25 * Math.sqrt(-distance);
}

function controlWithCurvature(
  pos: Position,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  curvature: number,
): [number, number] {
  switch (pos) {
    case Position.Left:
      return [x1 - controlOffset(x1 - x2, curvature), y1];
    case Position.Right:
      return [x1 + controlOffset(x2 - x1, curvature), y1];
    case Position.Top:
      return [x1, y1 - controlOffset(y1 - y2, curvature)];
    case Position.Bottom:
      return [x1, y1 + controlOffset(y2 - y1, curvature)];
    default:
      return [x1, y1];
  }
}

function cubicPoint(
  t: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): { x: number; y: number } {
  const u = 1 - t;
  const u2 = u * u;
  const t2 = t * t;
  return {
    x: u2 * u * x0 + 3 * u2 * t * x1 + 3 * u * t2 * x2 + t2 * t * x3,
    y: u2 * u * y0 + 3 * u2 * t * y1 + 3 * u * t2 * y2 + t2 * t * y3,
  };
}

/** Point on the same cubic bezier as @xyflow getBezierPath, at parameter t ∈ [0, 1]. */
export function pointOnBezierEdge(
  params: BezierEndpoints,
  t: number,
): { x: number; y: number } {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition = Position.Bottom,
    targetPosition = Position.Top,
    curvature = 0.25,
  } = params;
  const [c1x, c1y] = controlWithCurvature(
    sourcePosition,
    sourceX,
    sourceY,
    targetX,
    targetY,
    curvature,
  );
  const [c2x, c2y] = controlWithCurvature(
    targetPosition,
    targetX,
    targetY,
    sourceX,
    sourceY,
    curvature,
  );
  return cubicPoint(t, sourceX, sourceY, c1x, c1y, c2x, c2y, targetX, targetY);
}

/** Labels sit on the edge curve, close to the corresponding handle. */
export const EDGE_LABEL_NEAR_SOURCE = 0.1;
export const EDGE_LABEL_NEAR_TARGET = 0.9;
/** Pull label X toward the handle without shifting Y (stays on the edge). */
export const EDGE_LABEL_HORIZONTAL_PULL = 0.4;
/** Below this handle-to-handle distance, ease pull and push labels along the edge. */
export const EDGE_LABEL_SHORT_SPAN = 140;

function outwardHorizontalSign(
  params: BezierEndpoints,
  end: 'source' | 'target',
): number {
  const position =
    end === 'source'
      ? (params.sourcePosition ?? Position.Bottom)
      : (params.targetPosition ?? Position.Top);

  if (position === Position.Right) return 1;
  if (position === Position.Left) return -1;

  const handleX = end === 'source' ? params.sourceX : params.targetX;
  const otherX = end === 'source' ? params.targetX : params.sourceX;
  const dx = otherX - handleX;
  if (Math.abs(dx) < 1) return end === 'source' ? 1 : -1;
  return dx > 0 ? 1 : -1;
}

function clampLabelClearOfNode(
  x: number,
  handleX: number,
  outward: number,
  centerOffset: number,
): number {
  const limit = handleX + outward * centerOffset;
  return outward > 0 ? Math.max(x, limit) : Math.min(x, limit);
}

export function edgeLabelPosition(
  params: BezierEndpoints,
  end: 'source' | 'target',
  labelText?: string,
): { x: number; y: number } {
  const handleX = end === 'source' ? params.sourceX : params.targetX;
  const span = Math.hypot(
    params.targetX - params.sourceX,
    params.targetY - params.sourceY,
  );
  const shortFactor =
    span < EDGE_LABEL_SHORT_SPAN
      ? 1 - span / EDGE_LABEL_SHORT_SPAN
      : 0;

  let t = end === 'source' ? EDGE_LABEL_NEAR_SOURCE : EDGE_LABEL_NEAR_TARGET;
  if (shortFactor > 0) {
    const push = shortFactor * 0.22;
    t = end === 'source' ? t + push : t - push;
  }

  const onEdge = pointOnBezierEdge(params, t);
  const pull = EDGE_LABEL_HORIZONTAL_PULL * (1 - shortFactor * 0.85);
  let x = onEdge.x + (handleX - onEdge.x) * pull;
  const y = onEdge.y;

  const outward = outwardHorizontalSign(params, end);
  if (labelText) {
    const centerOffset = flowEdgeLabelCenterOffset(labelText);
    x = clampLabelClearOfNode(x, handleX, outward, centerOffset);
  }

  return { x, y };
}
