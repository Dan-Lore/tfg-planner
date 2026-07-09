import { Position, type XYPosition } from '@xyflow/react';
import type { NodeRect } from '@/editor-graph/node-layout-constants';
import {
  bezierHitsObstacles,
  pathHitsNodeObstacle,
  pathHitsObstacles,
  pathHitsThirdPartyObstacles,
} from './obstacles';
import { defaultRouteCenter, gappedHandle, smoothStepWaypoints } from './smooth-step';
import type {
  EdgeRouteCenter,
  EdgeRouteEndpoints,
  EdgeRoutingOptions,
  RoutingObstacle,
} from './types';
import { MIN_STACK_GAP_LANE, ROUTE_LANE_INSET } from './types';

export function stackedGapHeight(
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
export function preferTightStackBottomLane(
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

export function edgeBoundingBox(
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

export function rectIntersectsRect(a: NodeRect, b: NodeRect): boolean {
  return !(
    a.right < b.left ||
    a.left > b.right ||
    a.bottom < b.top ||
    a.top > b.bottom
  );
}

export function obstacleAffectsEdgeLane(
  rect: NodeRect,
  laneBox: NodeRect,
  sourceId: string,
  targetId: string,
  nodeId: string,
): boolean {
  if (nodeId === sourceId || nodeId === targetId) return true;
  return rectIntersectsRect(rect, laneBox);
}

export function pushObstacleLaneCandidates(
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

export function stackCorridorCenterYs(
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
    if (params.targetY > params.sourceY) {
      return [Math.min(sourceRect.top, targetRect.top) - ROUTE_LANE_INSET];
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

export function buildRouteCandidates(
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

export function polylineLength(points: XYPosition[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/** Midpoint of the vertical corridor between stacked source/target cards. */
export function stackedGapLaneCenterY(
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

export function preferStackedGapLane(
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

export function endpointRects(
  obstacles: RoutingObstacle[],
  options: EdgeRoutingOptions,
): { sourceRect: NodeRect; targetRect: NodeRect } | null {
  const sourceRect = obstacles.find((o) => o.nodeId === options.sourceId)?.rect;
  const targetRect = obstacles.find((o) => o.nodeId === options.targetId)?.rect;
  if (!sourceRect || !targetRect) return null;
  return { sourceRect, targetRect };
}

export function laneAboveBothEndpointsY(
  sourceRect: NodeRect,
  targetRect: NodeRect,
): number {
  return Math.min(sourceRect.top, targetRect.top) - ROUTE_LANE_INSET;
}

export function endpointBodyHits(
  params: EdgeRouteEndpoints,
  center: EdgeRouteCenter,
  obstacles: RoutingObstacle[],
  options: EdgeRoutingOptions,
  offset: number,
): number {
  return (
    pathHitsNodeObstacle(
      params,
      center,
      options.sourceId,
      obstacles,
      offset,
      options,
    ) +
    pathHitsNodeObstacle(
      params,
      center,
      options.targetId,
      obstacles,
      offset,
      options,
    )
  );
}

/** Horizontal lane above both endpoint cards when they overlap vertically. */
export function preferOppositeHorizontalAboveLane(
  params: EdgeRouteEndpoints,
  obstacles: RoutingObstacle[],
  options: EdgeRoutingOptions,
  offset: number,
): EdgeRouteCenter | null {
  const rects = endpointRects(obstacles, options);
  if (!rects) return null;

  const sourcePosition = params.sourcePosition ?? Position.Bottom;
  const targetPosition = params.targetPosition ?? Position.Top;
  const oppositeHorizontal =
    (sourcePosition === Position.Left && targetPosition === Position.Right) ||
    (sourcePosition === Position.Right && targetPosition === Position.Left);
  if (!oppositeHorizontal) return null;

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
  if (sourceGapped.x <= targetGapped.x) return null;

  const defaultCenter = defaultRouteCenter(params, offset);
  const defaultEndpointHits = endpointBodyHits(
    params,
    defaultCenter,
    obstacles,
    options,
    offset,
  );
  if (defaultEndpointHits === 0) return null;

  const aboveY = laneAboveBothEndpointsY(rects.sourceRect, rects.targetRect);
  const candidate = { centerY: aboveY };
  if (endpointBodyHits(params, candidate, obstacles, options, offset) > 0) {
    return null;
  }
  if (
    pathHitsThirdPartyObstacles(params, candidate, obstacles, offset, options) > 0
  ) {
    return null;
  }
  return candidate;
}

export function routeCandidateScore(
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
  const targetBodyHits = pathHitsNodeObstacle(
    params,
    candidate,
    options.targetId,
    obstacles,
    offset,
    options,
  );
  const length = polylineLength(smoothStepWaypoints(params, candidate, offset));
  const centerY = candidate.centerY ?? defaults.centerY;
  const rects = endpointRects(obstacles, options);
  const aboveBothCards =
    rects !== null &&
    centerY !== undefined &&
    centerY <= laneAboveBothEndpointsY(rects.sourceRect, rects.targetRect);
  const zeroEndpointBodyHits = sourceBodyHits === 0 && targetBodyHits === 0;
  const outOfBand =
    centerY !== undefined &&
    (centerY < handleMinY || centerY > handleMaxY) &&
    !(zeroEndpointBodyHits && aboveBothCards);

  return (
    thirdPartyHits * 1_000_000 +
    sourceBodyHits * 50_000 +
    targetBodyHits * 50_000 +
    hits * 1_000 +
    (outOfBand ? 10_000 : 0) +
    length
  );
}
