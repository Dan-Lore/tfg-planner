import { pointOnBezierEdge } from '@/editor-graph/bezier-edge-label';
import type { NodeRect } from '@/editor-graph/node-layout-constants';
import { smoothStepWaypoints } from './smooth-step';
import type {
  EdgeRouteCenter,
  EdgeRouteEndpoints,
  EdgeRoutingOptions,
  RoutingObstacle,
} from './types';
import { HANDLE_EXIT_GRACE } from './types';

export function segmentIntersectsRect(
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

export function nearHandle(
  hx: number,
  hy: number,
  x: number,
  y: number,
  grace: number,
): boolean {
  return Math.hypot(x - hx, y - hy) <= grace;
}

export function bezierHitsObstacles(
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

export function pathHitsObstacles(
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

export function pathHitsNodeObstacle(
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

/** Interior segments crossing a source/target node card (excluding handle approach). */
export function pathCrossesNodeBody(
  params: EdgeRouteEndpoints,
  center: EdgeRouteCenter,
  nodeId: string,
  obstacles: RoutingObstacle[],
  offset: number,
  options: EdgeRoutingOptions,
): number {
  return pathHitsNodeObstacle(params, center, nodeId, obstacles, offset, options);
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
