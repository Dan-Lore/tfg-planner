import { getSmoothStepPath, Position, type XYPosition } from '@xyflow/react';
import type { NodeRect } from '@/canvas/node-bounds';
import { pointOnBezierEdge } from '@/lib/bezier-edge-label';

export { pointOnPolyline } from '@/lib/edge-geometry';

export const DEFAULT_EDGE_OFFSET = 20;
export const ROUTE_LANE_INSET = 10;
export const HANDLE_EXIT_GRACE = 28;
/** Min vertical space between stacked cards to route through the gap corridor. */
export const MIN_STACK_GAP_LANE = 48;

export interface EdgeRouteEndpoints {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition?: Position;
  targetPosition?: Position;
  offset?: number;
}

export interface EdgeRouteCenter {
  centerX?: number;
  centerY?: number;
}

export interface RoutingObstacle {
  nodeId: string;
  rect: NodeRect;
}

export interface EdgeRoutingOptions {
  sourceId: string;
  targetId: string;
}

function gappedHandle(
  x: number,
  y: number,
  position: Position,
  offset: number,
): XYPosition {
  switch (position) {
    case Position.Left:
      return { x: x - offset, y };
    case Position.Right:
      return { x: x + offset, y };
    case Position.Top:
      return { x, y: y - offset };
    case Position.Bottom:
      return { x, y: y + offset };
    default:
      return { x, y };
  }
}

function defaultRouteCenter(
  params: EdgeRouteEndpoints,
  offset: number,
): EdgeRouteCenter {
  const sourcePosition = params.sourcePosition ?? Position.Bottom;
  const targetPosition = params.targetPosition ?? Position.Top;
  const sourceGapped = gappedHandle(
    params.sourceX,
    params.sourceY,
    sourcePosition,
    offset,
  );
  const targetGapped = gappedHandle(
    params.targetX,
    params.targetY,
    targetPosition,
    offset,
  );

  return {
    centerX: sourceGapped.x + (targetGapped.x - sourceGapped.x) * 0.5,
    centerY: (sourceGapped.y + targetGapped.y) / 2,
  };
}

function segmentIntersectsRect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rect: NodeRect,
): boolean {
  if (ax === bx && ay === by) {
    return (
      ax >= rect.left &&
      ax <= rect.right &&
      ay >= rect.top &&
      ay <= rect.bottom
    );
  }

  const minX = Math.min(ax, bx);
  const maxX = Math.max(ax, bx);
  const minY = Math.min(ay, by);
  const maxY = Math.max(ay, by);

  if (maxX < rect.left || minX > rect.right || maxY < rect.top || minY > rect.bottom) {
    return false;
  }

  const crossesVertical =
    (ax <= rect.left && bx >= rect.left) || (bx <= rect.left && ax >= rect.left) ||
    (ax <= rect.right && bx >= rect.right) || (bx <= rect.right && ax >= rect.right);
  const crossesHorizontal =
    (ay <= rect.top && by >= rect.top) || (by <= rect.top && ay >= rect.top) ||
    (ay <= rect.bottom && by >= rect.bottom) || (by <= rect.bottom && ay >= rect.bottom);

  if (ax === bx) return crossesHorizontal;
  if (ay === by) return crossesVertical;

  return true;
}

function nearHandle(
  hx: number,
  hy: number,
  x: number,
  y: number,
  grace: number,
): boolean {
  return Math.hypot(x - hx, y - hy) <= grace;
}

function bezierHitsObstacles(
  params: EdgeRouteEndpoints,
  obstacles: RoutingObstacle[],
  options: EdgeRoutingOptions,
): boolean {
  const samples = 32;
  let prev = pointOnBezierEdge(params, 0);

  for (let i = 1; i <= samples; i++) {
    const current = pointOnBezierEdge(params, i / samples);
    for (const obstacle of obstacles) {
      const skipSource =
        obstacle.nodeId === options.sourceId &&
        (nearHandle(params.sourceX, params.sourceY, prev.x, prev.y, HANDLE_EXIT_GRACE) ||
          nearHandle(params.sourceX, params.sourceY, current.x, current.y, HANDLE_EXIT_GRACE));
      const skipTarget =
        obstacle.nodeId === options.targetId &&
        (nearHandle(params.targetX, params.targetY, prev.x, prev.y, HANDLE_EXIT_GRACE) ||
          nearHandle(params.targetX, params.targetY, current.x, current.y, HANDLE_EXIT_GRACE));
      if (skipSource || skipTarget) continue;

      if (segmentIntersectsRect(prev.x, prev.y, current.x, current.y, obstacle.rect)) {
        return true;
      }
    }
    prev = current;
  }

  return false;
}

function smoothStepWaypoints(
  params: EdgeRouteEndpoints,
  center: EdgeRouteCenter,
  offset: number,
): XYPosition[] {
  const sourcePosition = params.sourcePosition ?? Position.Bottom;
  const targetPosition = params.targetPosition ?? Position.Top;
  const sourceGapped = gappedHandle(
    params.sourceX,
    params.sourceY,
    sourcePosition,
    offset,
  );
  const targetGapped = gappedHandle(
    params.targetX,
    params.targetY,
    targetPosition,
    offset,
  );

  const centerX = center.centerX ?? sourceGapped.x + (targetGapped.x - sourceGapped.x) * 0.5;
  const centerY = center.centerY ?? (sourceGapped.y + targetGapped.y) / 2;

  const horizontalPrimary =
    sourcePosition === Position.Left || sourcePosition === Position.Right;
  const forward =
    horizontalPrimary
      ? sourceGapped.x < targetGapped.x
      : sourceGapped.y < targetGapped.y;

  const oppositeHandles =
    (sourcePosition === Position.Left && targetPosition === Position.Right) ||
    (sourcePosition === Position.Right && targetPosition === Position.Left) ||
    (sourcePosition === Position.Top && targetPosition === Position.Bottom) ||
    (sourcePosition === Position.Bottom && targetPosition === Position.Top);

  if (oppositeHandles && horizontalPrimary) {
    const useVerticalSplit = forward;
    if (useVerticalSplit) {
      return [
        { x: params.sourceX, y: params.sourceY },
        sourceGapped,
        { x: centerX, y: sourceGapped.y },
        { x: centerX, y: targetGapped.y },
        targetGapped,
        { x: params.targetX, y: params.targetY },
      ];
    }

    return [
      { x: params.sourceX, y: params.sourceY },
      sourceGapped,
      { x: sourceGapped.x, y: centerY },
      { x: targetGapped.x, y: centerY },
      targetGapped,
      { x: params.targetX, y: params.targetY },
    ];
  }

  if (oppositeHandles) {
    const useVerticalSplit = !forward;
    if (useVerticalSplit) {
      return [
        { x: params.sourceX, y: params.sourceY },
        sourceGapped,
        { x: centerX, y: sourceGapped.y },
        { x: centerX, y: targetGapped.y },
        targetGapped,
        { x: params.targetX, y: params.targetY },
      ];
    }

    return [
      { x: params.sourceX, y: params.sourceY },
      sourceGapped,
      { x: sourceGapped.x, y: centerY },
      { x: targetGapped.x, y: centerY },
      targetGapped,
      { x: params.targetX, y: params.targetY },
    ];
  }

  const corner = { x: sourceGapped.x, y: targetGapped.y };
  return [
    { x: params.sourceX, y: params.sourceY },
    sourceGapped,
    corner,
    targetGapped,
    { x: params.targetX, y: params.targetY },
  ];
}

function pathHitsObstacles(
  params: EdgeRouteEndpoints,
  center: EdgeRouteCenter,
  obstacles: RoutingObstacle[],
  offset: number,
  options: EdgeRoutingOptions,
): number {
  const points = smoothStepWaypoints(params, center, offset);
  let hits = 0;
  const lastSegment = points.length - 2;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    for (const obstacle of obstacles) {
      if (obstacle.nodeId === options.sourceId && i === 0) continue;
      if (obstacle.nodeId === options.targetId && i === lastSegment) continue;
      if (segmentIntersectsRect(a.x, a.y, b.x, b.y, obstacle.rect)) {
        hits += 1;
      }
    }
  }

  return hits;
}

function pathHitsNodeObstacle(
  params: EdgeRouteEndpoints,
  center: EdgeRouteCenter,
  nodeId: string,
  obstacles: RoutingObstacle[],
  offset: number,
  options: EdgeRoutingOptions,
): number {
  const points = smoothStepWaypoints(params, center, offset);
  const obstacle = obstacles.find((o) => o.nodeId === nodeId);
  if (!obstacle) return 0;

  let hits = 0;
  const lastSegment = points.length - 2;

  for (let i = 0; i < points.length - 1; i++) {
    if (nodeId === options.sourceId && i === 0) continue;
    if (nodeId === options.targetId && i === lastSegment) continue;
    const a = points[i]!;
    const b = points[i + 1]!;
    if (segmentIntersectsRect(a.x, a.y, b.x, b.y, obstacle.rect)) {
      hits += 1;
    }
  }

  return hits;
}

function stackedGapHeight(
  params: EdgeRouteEndpoints,
  obstacles: RoutingObstacle[],
  options: EdgeRoutingOptions,
): number | null {
  const sourceRect = obstacles.find((o) => o.nodeId === options.sourceId)?.rect;
  const targetRect = obstacles.find((o) => o.nodeId === options.targetId)?.rect;
  if (!sourceRect || !targetRect) return null;

  const sourceAbove = params.sourceY < params.targetY;
  const upperRect = sourceAbove ? sourceRect : targetRect;
  const lowerRect = sourceAbove ? targetRect : sourceRect;
  return lowerRect.top - upperRect.bottom;
}

/** Route below the lower card when the stack gap is too tight for a corridor lane. */
function preferTightStackBottomLane(
  params: EdgeRouteEndpoints,
  obstacles: RoutingObstacle[],
  options: EdgeRoutingOptions,
  offset: number,
): EdgeRouteCenter | null {
  if (params.targetY >= params.sourceY) return null;

  const gapHeight = stackedGapHeight(params, obstacles, options);
  if (gapHeight === null || gapHeight >= MIN_STACK_GAP_LANE) return null;

  const sourceRect = obstacles.find((o) => o.nodeId === options.sourceId)!.rect;
  const bottomY = sourceRect.bottom + ROUTE_LANE_INSET;

  if (
    pathHitsThirdPartyObstacles(
      params,
      { centerY: bottomY },
      obstacles,
      offset,
      options,
    ) > 0
  ) {
    return null;
  }

  const sourceBodyDefault = pathHitsNodeObstacle(
    params,
    {},
    options.sourceId,
    obstacles,
    offset,
    options,
  );
  if (sourceBodyDefault === 0) return null;

  const sourceBodyBottom = pathHitsNodeObstacle(
    params,
    { centerY: bottomY },
    options.sourceId,
    obstacles,
    offset,
    options,
  );
  if (sourceBodyBottom > 0) return null;

  return { centerY: bottomY };
}

function edgeBoundingBox(
  sourceGapped: XYPosition,
  targetGapped: XYPosition,
): NodeRect {
  return {
    left: Math.min(sourceGapped.x, targetGapped.x),
    top: Math.min(sourceGapped.y, targetGapped.y),
    right: Math.max(sourceGapped.x, targetGapped.x),
    bottom: Math.max(sourceGapped.y, targetGapped.y),
  };
}

function rectIntersectsRect(a: NodeRect, b: NodeRect): boolean {
  return !(
    a.right < b.left ||
    a.left > b.right ||
    a.bottom < b.top ||
    a.top > b.bottom
  );
}

function obstacleAffectsEdgeLane(
  rect: NodeRect,
  laneBox: NodeRect,
  sourceId: string,
  targetId: string,
  nodeId: string,
): boolean {
  if (nodeId === sourceId || nodeId === targetId) return true;
  return rectIntersectsRect(rect, laneBox);
}

function pushObstacleLaneCandidates(
  candidates: EdgeRouteCenter[],
  rect: NodeRect,
  nodeId: string,
  params: EdgeRouteEndpoints,
  options: EdgeRoutingOptions,
): void {
  const targetAboveSource = params.targetY < params.sourceY;
  const isSource = nodeId === options.sourceId;
  const isTarget = nodeId === options.targetId;

  candidates.push({ centerX: rect.left - ROUTE_LANE_INSET });
  candidates.push({ centerX: rect.right + ROUTE_LANE_INSET });
  candidates.push({ centerY: rect.top - ROUTE_LANE_INSET });

  const skipBottom =
    (isSource && targetAboveSource) || (isTarget && !targetAboveSource);
  if (!skipBottom) {
    candidates.push({ centerY: rect.bottom + ROUTE_LANE_INSET });
  }
}

function stackCorridorCenterYs(
  params: EdgeRouteEndpoints,
  obstacles: RoutingObstacle[],
  options: EdgeRoutingOptions,
): number[] {
  const sourceRect = obstacles.find((o) => o.nodeId === options.sourceId)?.rect;
  const targetRect = obstacles.find((o) => o.nodeId === options.targetId)?.rect;
  if (!sourceRect || !targetRect) return [];

  const sourceAbove = params.sourceY < params.targetY;
  const upperRect = sourceAbove ? sourceRect : targetRect;
  const lowerRect = sourceAbove ? targetRect : sourceRect;
  const gapHeight = lowerRect.top - upperRect.bottom;
  if (gapHeight <= 2) {
    if (params.targetY < params.sourceY) {
      return [lowerRect.bottom + ROUTE_LANE_INSET];
    }
    return [];
  }
  const ys = [
    upperRect.bottom + ROUTE_LANE_INSET,
    lowerRect.top - ROUTE_LANE_INSET,
  ];
  if (gapHeight > 0) {
    ys.unshift(upperRect.bottom + gapHeight * 0.5);
  }
  return ys;
}

function buildRouteCandidates(
  params: EdgeRouteEndpoints,
  obstacles: RoutingObstacle[],
  options: EdgeRoutingOptions,
  offset: number,
): EdgeRouteCenter[] {
  const sourcePosition = params.sourcePosition ?? Position.Bottom;
  const targetPosition = params.targetPosition ?? Position.Top;
  const sourceGapped = gappedHandle(
    params.sourceX,
    params.sourceY,
    sourcePosition,
    offset,
  );
  const targetGapped = gappedHandle(
    params.targetX,
    params.targetY,
    targetPosition,
    offset,
  );
  const defaults = defaultRouteCenter(params, offset);
  const laneBox = edgeBoundingBox(sourceGapped, targetGapped);

  const candidates: EdgeRouteCenter[] = [
    {},
    { centerX: defaults.centerX },
    { centerY: defaults.centerY },
    { centerX: sourceGapped.x + ROUTE_LANE_INSET },
    { centerX: targetGapped.x - ROUTE_LANE_INSET },
    { centerY: sourceGapped.y - ROUTE_LANE_INSET },
    { centerY: sourceGapped.y + ROUTE_LANE_INSET },
    { centerY: targetGapped.y - ROUTE_LANE_INSET },
    { centerY: targetGapped.y + ROUTE_LANE_INSET },
  ];

  for (const obstacle of obstacles) {
    if (
      !obstacleAffectsEdgeLane(
        obstacle.rect,
        laneBox,
        options.sourceId,
        options.targetId,
        obstacle.nodeId,
      )
    ) {
      continue;
    }
    const rect = obstacle.rect;
    pushObstacleLaneCandidates(candidates, rect, obstacle.nodeId, params, options);
  }

  for (const corridorY of stackCorridorCenterYs(params, obstacles, options)) {
    candidates.unshift({ centerY: corridorY });
  }

  const gapY = stackedGapLaneCenterY(
    params,
    obstacles,
    options,
  );
  if (gapY !== null) {
    candidates.unshift({ centerY: gapY });
  }

  const minX = Math.min(sourceGapped.x, targetGapped.x);
  const maxX = Math.max(sourceGapped.x, targetGapped.x);
  const minY = Math.min(sourceGapped.y, targetGapped.y);
  const maxY = Math.max(sourceGapped.y, targetGapped.y);

  for (const obstacle of obstacles) {
    if (
      !obstacleAffectsEdgeLane(
        obstacle.rect,
        laneBox,
        options.sourceId,
        options.targetId,
        obstacle.nodeId,
      )
    ) {
      continue;
    }
    const rect = obstacle.rect;
    candidates.push({
      centerX: Math.max(minX, rect.left - ROUTE_LANE_INSET),
      centerY: Math.max(minY, rect.top - ROUTE_LANE_INSET),
    });
    candidates.push({
      centerX: Math.min(maxX, rect.right + ROUTE_LANE_INSET),
      centerY: Math.min(maxY, rect.bottom + ROUTE_LANE_INSET),
    });
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.centerX ?? 'd'}:${candidate.centerY ?? 'd'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function polylineLength(points: XYPosition[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/** Midpoint of the vertical corridor between stacked source/target cards. */
function stackedGapLaneCenterY(
  params: EdgeRouteEndpoints,
  obstacles: RoutingObstacle[],
  options: EdgeRoutingOptions,
): number | null {
  const sourceRect = obstacles.find((o) => o.nodeId === options.sourceId)?.rect;
  const targetRect = obstacles.find((o) => o.nodeId === options.targetId)?.rect;
  if (!sourceRect || !targetRect) return null;

  const sourceAbove = params.sourceY < params.targetY;
  const upperRect = sourceAbove ? sourceRect : targetRect;
  const lowerRect = sourceAbove ? targetRect : sourceRect;
  const gapHeight = lowerRect.top - upperRect.bottom;
  if (gapHeight < MIN_STACK_GAP_LANE) return null;

  return upperRect.bottom + gapHeight * 0.5;
}

function preferStackedGapLane(
  params: EdgeRouteEndpoints,
  obstacles: RoutingObstacle[],
  options: EdgeRoutingOptions,
  offset: number,
  defaultHits: number,
  defaults: EdgeRouteCenter,
): EdgeRouteCenter | null {
  const gapY = stackedGapLaneCenterY(params, obstacles, options);
  if (gapY === null) return null;

  const gapHits = pathHitsObstacles(
    params,
    { centerY: gapY },
    obstacles,
    offset,
    options,
  );
  if (gapHits > 0) return null;

  const defaultCenterY = defaults.centerY;
  if (defaultCenterY === undefined) {
    return defaultHits > 0 ? { centerY: gapY } : null;
  }

  const sourceRect = obstacles.find((o) => o.nodeId === options.sourceId)!.rect;
  const targetRect = obstacles.find((o) => o.nodeId === options.targetId)!.rect;
  const sourceAbove = params.sourceY < params.targetY;
  const upperRect = sourceAbove ? sourceRect : targetRect;
  const lowerRect = sourceAbove ? targetRect : sourceRect;
  const laneOutsideGap =
    defaultCenterY <= upperRect.bottom || defaultCenterY >= lowerRect.top;
  const bezierClipsCard = bezierHitsObstacles(params, obstacles, options);

  if (defaultHits > 0 || laneOutsideGap || bezierClipsCard) {
    return { centerY: gapY };
  }

  return null;
}

function routeCandidateScore(
  params: EdgeRouteEndpoints,
  candidate: EdgeRouteCenter,
  obstacles: RoutingObstacle[],
  options: EdgeRoutingOptions,
  offset: number,
  defaults: EdgeRouteCenter,
  handleMinY: number,
  handleMaxY: number,
): number {
  const hits = pathHitsObstacles(params, candidate, obstacles, offset, options);
  const thirdPartyHits = pathHitsThirdPartyObstacles(
    params,
    candidate,
    obstacles,
    offset,
    options,
  );
  const sourceBodyHits = pathHitsNodeObstacle(
    params,
    candidate,
    options.sourceId,
    obstacles,
    offset,
    options,
  );
  const length = polylineLength(smoothStepWaypoints(params, candidate, offset));
  const centerY = candidate.centerY ?? defaults.centerY;
  const outOfBand =
    centerY !== undefined &&
    (centerY < handleMinY || centerY > handleMaxY);

  return (
    thirdPartyHits * 1_000_000 +
    sourceBodyHits * 50_000 +
    hits * 1_000 +
    (outOfBand ? 10_000 : 0) +
    length
  );
}

export function computeEdgeRouteCenter(
  params: EdgeRouteEndpoints,
  obstacles: RoutingObstacle[],
  options: EdgeRoutingOptions,
): EdgeRouteCenter | null {
  if (obstacles.length === 0) return null;

  const offset = params.offset ?? DEFAULT_EDGE_OFFSET;
  const defaults = defaultRouteCenter(params, offset);
  const defaultHits = pathHitsObstacles(params, {}, obstacles, offset, options);
  const thirdPartyDefaultHits = pathHitsThirdPartyObstacles(
    params,
    {},
    obstacles,
    offset,
    options,
  );
  const bezierHits = bezierHitsObstacles(params, obstacles, options);
  const bezierThirdPartyHits = bezierHitsThirdPartyObstacles(
    params,
    obstacles,
    options,
  );

  const gapLane = preferStackedGapLane(
    params,
    obstacles,
    options,
    offset,
    defaultHits,
    defaults,
  );
  if (gapLane) return gapLane;

  const tightBottomLane = preferTightStackBottomLane(
    params,
    obstacles,
    options,
    offset,
  );
  if (tightBottomLane) return tightBottomLane;

  if (thirdPartyDefaultHits === 0 && !bezierThirdPartyHits && !bezierHits && defaultHits === 0) {
    return null;
  }

  const sourceGapped = gappedHandle(
    params.sourceX,
    params.sourceY,
    params.sourcePosition ?? Position.Bottom,
    offset,
  );
  const targetGapped = gappedHandle(
    params.targetX,
    params.targetY,
    params.targetPosition ?? Position.Top,
    offset,
  );
  const handleMinY = Math.min(sourceGapped.y, targetGapped.y) - ROUTE_LANE_INSET;
  const handleMaxY = Math.max(sourceGapped.y, targetGapped.y) + ROUTE_LANE_INSET;

  const candidates = buildRouteCandidates(params, obstacles, options, offset);

  let best: EdgeRouteCenter = {};
  let bestScore = Number.POSITIVE_INFINITY;
  const defaultScore = routeCandidateScore(
    params,
    {},
    obstacles,
    options,
    offset,
    defaults,
    handleMinY,
    handleMaxY,
  );

  for (const candidate of candidates) {
    const score = routeCandidateScore(
      params,
      candidate,
      obstacles,
      options,
      offset,
      defaults,
      handleMinY,
      handleMaxY,
    );

    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (bestScore >= defaultScore && thirdPartyDefaultHits === 0 && !bezierThirdPartyHits) {
    return null;
  }

  return bestScore < Number.POSITIVE_INFINITY ? best : null;
}

export function pathHitsThirdPartyObstacles(
  params: EdgeRouteEndpoints,
  center: EdgeRouteCenter,
  obstacles: RoutingObstacle[],
  offset: number,
  options: EdgeRoutingOptions,
): number {
  const points = smoothStepWaypoints(params, center, offset);
  let hits = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    for (const obstacle of obstacles) {
      if (
        obstacle.nodeId === options.sourceId ||
        obstacle.nodeId === options.targetId
      ) {
        continue;
      }
      if (segmentIntersectsRect(a.x, a.y, b.x, b.y, obstacle.rect)) {
        hits += 1;
      }
    }
  }

  return hits;
}

export function bezierHitsThirdPartyObstacles(
  params: EdgeRouteEndpoints,
  obstacles: RoutingObstacle[],
  options: EdgeRoutingOptions,
): boolean {
  const samples = 32;
  let prev = pointOnBezierEdge(params, 0);

  for (let i = 1; i <= samples; i++) {
    const current = pointOnBezierEdge(params, i / samples);
    for (const obstacle of obstacles) {
      if (
        obstacle.nodeId === options.sourceId ||
        obstacle.nodeId === options.targetId
      ) {
        continue;
      }

      if (segmentIntersectsRect(prev.x, prev.y, current.x, current.y, obstacle.rect)) {
        return true;
      }
    }
    prev = current;
  }

  return false;
}

export function edgePathNeedsObstacleRouting(
  params: EdgeRouteEndpoints,
  obstacles: RoutingObstacle[],
  options: EdgeRoutingOptions,
): boolean {
  if (obstacles.length === 0) return false;

  const offset = params.offset ?? DEFAULT_EDGE_OFFSET;

  if (bezierHitsThirdPartyObstacles(params, obstacles, options)) {
    return true;
  }

  if (pathHitsThirdPartyObstacles(params, {}, obstacles, offset, options) > 0) {
    return true;
  }

  if (!bezierHitsObstacles(params, obstacles, options)) {
    const sourceBodyDefault = pathHitsNodeObstacle(
      params,
      {},
      options.sourceId,
      obstacles,
      offset,
      options,
    );
    if (sourceBodyDefault === 0) return false;
  }

  const gapY = stackedGapLaneCenterY(params, obstacles, options);
  if (
    gapY !== null &&
    pathHitsObstacles(params, { centerY: gapY }, obstacles, offset, options) === 0
  ) {
    return true;
  }

  const defaultHits = pathHitsObstacles(params, {}, obstacles, offset, options);
  return defaultHits > 0;
}

export function getRoutedSmoothStepPath(
  params: EdgeRouteEndpoints,
  obstacles: RoutingObstacle[],
  options: EdgeRoutingOptions,
): { path: string; waypoints: XYPosition[]; center: EdgeRouteCenter } {
  const offset = params.offset ?? DEFAULT_EDGE_OFFSET;
  const center = computeEdgeRouteCenter(params, obstacles, options) ?? {};
  const [path] = getSmoothStepPath({
    ...params,
    ...center,
    offset,
    borderRadius: 8,
  });

  return {
    path,
    waypoints: smoothStepWaypoints(params, center, offset),
    center,
  };
}

