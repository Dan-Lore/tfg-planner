import type { XYPosition } from '@xyflow/react';
import {
  computeParallelLaneCenters,
  type EdgeRouteDraft,
} from '@/lib/edge-route-lanes';
import {
  buildSmoothStepRoute,
  computeEdgeRouteCenter,
  edgePathNeedsObstacleRouting,
  getRoutedSmoothStepPath,
  type EdgeRouteCenter,
  type EdgeRouteEndpoints,
  type EdgeRoutingOptions,
  type RoutingObstacle,
} from '@/lib/edge-routing';

export interface EdgeRoutePlanInput {
  edgeId: string;
  endpoints: EdgeRouteEndpoints;
  routing: EdgeRoutingOptions;
}

export interface EdgeRoutePlanEntry {
  needsRouting: boolean;
  /** Delta from base center for parallel lane spread (apply on live-routed center). */
  parallelOffset: EdgeRouteCenter;
  laneCenter: EdgeRouteCenter;
  waypoints: XYPosition[];
  path: string;
}

function parallelOffsetFromCenters(
  base: EdgeRouteCenter,
  adjusted: EdgeRouteCenter,
): EdgeRouteCenter {
  const offset: EdgeRouteCenter = {};
  if (
    adjusted.centerX !== undefined &&
    base.centerX !== undefined &&
    adjusted.centerX !== base.centerX
  ) {
    offset.centerX = adjusted.centerX - base.centerX;
  }
  if (
    adjusted.centerY !== undefined &&
    base.centerY !== undefined &&
    adjusted.centerY !== base.centerY
  ) {
    offset.centerY = adjusted.centerY - base.centerY;
  }
  return offset;
}

export function applyParallelOffset(
  base: EdgeRouteCenter,
  offset: EdgeRouteCenter,
): EdgeRouteCenter {
  const result: EdgeRouteCenter = { ...base };
  if (offset.centerX !== undefined && base.centerX !== undefined) {
    result.centerX = base.centerX + offset.centerX;
  }
  if (offset.centerY !== undefined && base.centerY !== undefined) {
    result.centerY = base.centerY + offset.centerY;
  }
  return result;
}

function mergeLaneCenter(
  base: EdgeRouteCenter,
  adjusted: EdgeRouteCenter | undefined,
): EdgeRouteCenter {
  if (!adjusted) return base;
  return {
    centerX: adjusted.centerX ?? base.centerX,
    centerY: adjusted.centerY ?? base.centerY,
  };
}

/** Batch obstacle routing with parallel lane gap for shared corridor segments. */
export function buildEdgeRoutePlan(
  edges: EdgeRoutePlanInput[],
  obstacles: RoutingObstacle[],
): Map<string, EdgeRoutePlanEntry> {
  const drafts: EdgeRouteDraft[] = [];
  const baseById = new Map<
    string,
    { endpoints: EdgeRouteEndpoints; routing: EdgeRoutingOptions; needsRouting: boolean }
  >();

  for (const edge of edges) {
    const needsRouting = edgePathNeedsObstacleRouting(
      edge.endpoints,
      obstacles,
      edge.routing,
    );
    baseById.set(edge.edgeId, {
      endpoints: edge.endpoints,
      routing: edge.routing,
      needsRouting,
    });

    if (!needsRouting) continue;

    const routed = getRoutedSmoothStepPath(
      edge.endpoints,
      obstacles,
      edge.routing,
    );
    drafts.push({
      edgeId: edge.edgeId,
      needsRouting: true,
      center: routed.center,
      waypoints: routed.waypoints,
    });
  }

  const laneCenters = computeParallelLaneCenters(drafts);
  const plan = new Map<string, EdgeRoutePlanEntry>();

  for (const edge of edges) {
    const base = baseById.get(edge.edgeId)!;
    if (!base.needsRouting) {
      plan.set(edge.edgeId, {
        needsRouting: false,
        parallelOffset: {},
        laneCenter: {},
        waypoints: [],
        path: '',
      });
      continue;
    }

    const draft = drafts.find((d) => d.edgeId === edge.edgeId)!;
    const laneCenter = mergeLaneCenter(
      draft.center,
      laneCenters.get(edge.edgeId),
    );
    const parallelOffset = parallelOffsetFromCenters(draft.center, laneCenter);
    const { path, waypoints } = buildSmoothStepRoute(edge.endpoints, laneCenter);
    plan.set(edge.edgeId, {
      needsRouting: true,
      parallelOffset,
      laneCenter,
      waypoints,
      path,
    });
  }

  return plan;
}

/** Base route center before parallel lane spread (for tests). */
export function computeBaseRouteCenter(
  endpoints: EdgeRouteEndpoints,
  obstacles: RoutingObstacle[],
  routing: EdgeRoutingOptions,
): EdgeRouteCenter | null {
  return computeEdgeRouteCenter(endpoints, obstacles, routing);
}
