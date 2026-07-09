import { Position } from '@xyflow/react';
import {
  bezierHitsObstacles,
  bezierHitsThirdPartyObstacles,
  pathHitsObstacles,
  pathHitsThirdPartyObstacles,
} from './obstacles';
import {
  buildRouteCandidates,
  endpointBodyHits,
  endpointRects,
  laneAboveBothEndpointsY,
  preferOppositeHorizontalAboveLane,
  preferStackedGapLane,
  preferTightStackBottomLane,
  routeCandidateScore,
} from './lane-candidates';
import { defaultRouteCenter, gappedHandle } from './smooth-step';
import type {
  EdgeRouteCenter,
  EdgeRouteEndpoints,
  EdgeRoutingOptions,
  RoutingObstacle,
} from './types';
import { DEFAULT_EDGE_OFFSET, ROUTE_LANE_INSET } from './types';

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

  const aboveBothLane = preferOppositeHorizontalAboveLane(
    params,
    obstacles,
    options,
    offset,
  );
  if (aboveBothLane) return aboveBothLane;

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

export function fallbackCenterAvoidingEndpointBodies(
  params: EdgeRouteEndpoints,
  center: EdgeRouteCenter,
  obstacles: RoutingObstacle[],
  options: EdgeRoutingOptions,
  offset: number,
): EdgeRouteCenter {
  if (endpointBodyHits(params, center, obstacles, options, offset) === 0) {
    return center;
  }

  const rects = endpointRects(obstacles, options);
  if (!rects) return center;

  const { sourceRect, targetRect } = rects;
  const candidateYs: number[] = [
    laneAboveBothEndpointsY(sourceRect, targetRect),
  ];

  if (params.targetY > params.sourceY) {
    candidateYs.push(
      Math.max(sourceRect.bottom, targetRect.bottom) + ROUTE_LANE_INSET,
    );
  }

  let best: EdgeRouteCenter = center;
  let bestScore = endpointBodyHits(params, center, obstacles, options, offset) * 50_000;
  for (const centerY of candidateYs) {
    const candidate = { centerY };
    const endpointHits = endpointBodyHits(
      params,
      candidate,
      obstacles,
      options,
      offset,
    );
    if (endpointHits > 0) continue;
    const thirdPartyHits = pathHitsThirdPartyObstacles(
      params,
      candidate,
      obstacles,
      offset,
      options,
    );
    const score = thirdPartyHits * 1_000_000;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}
