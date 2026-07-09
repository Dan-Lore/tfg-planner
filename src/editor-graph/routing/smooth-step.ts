import { getSmoothStepPath, Position, type XYPosition } from '@xyflow/react';
import { stackedGapLaneCenterY } from './lane-candidates';
import {
  bezierHitsObstacles,
  bezierHitsThirdPartyObstacles,
  pathHitsNodeObstacle,
  pathHitsObstacles,
  pathHitsThirdPartyObstacles,
} from './obstacles';
import {
  computeEdgeRouteCenter,
  fallbackCenterAvoidingEndpointBodies,
} from './route-center';
import type {
  EdgeRouteCenter,
  EdgeRouteEndpoints,
  EdgeRoutingOptions,
  RoutingObstacle,
} from './types';
import { DEFAULT_EDGE_OFFSET } from './types';

export function gappedHandle(
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

export function defaultRouteCenter(
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

export function smoothStepWaypoints(
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
    const targetBodyDefault = pathHitsNodeObstacle(
      params,
      {},
      options.targetId,
      obstacles,
      offset,
      options,
    );
    if (sourceBodyDefault === 0 && targetBodyDefault === 0) return false;
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
  const center = fallbackCenterAvoidingEndpointBodies(
    params,
    computeEdgeRouteCenter(params, obstacles, options) ?? {},
    obstacles,
    options,
    offset,
  );
  return buildSmoothStepRoute(params, center);
}

/** Smooth-step path with an explicit route center (e.g. after parallel lane adjustment). */
export function buildSmoothStepRoute(
  params: EdgeRouteEndpoints,
  center: EdgeRouteCenter,
): { path: string; waypoints: XYPosition[]; center: EdgeRouteCenter } {
  const offset = params.offset ?? DEFAULT_EDGE_OFFSET;
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
