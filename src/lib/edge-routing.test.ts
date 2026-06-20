import { describe, expect, it } from 'vitest';
import { Position } from '@xyflow/react';
import {
  computeEdgeRouteCenter,
  edgePathNeedsObstacleRouting,
  getRoutedSmoothStepPath,
  pointOnPolyline,
  type EdgeRouteEndpoints,
  type RoutingObstacle,
} from '@/lib/edge-routing';

const routing = { sourceId: 'src', targetId: 'tgt' };

const forwardEdge: EdgeRouteEndpoints = {
  sourceX: 220,
  sourceY: 120,
  targetX: 520,
  targetY: 160,
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
};

function obstacle(
  nodeId: string,
  rect: { left: number; top: number; right: number; bottom: number },
): RoutingObstacle {
  return { nodeId, rect };
}

describe('computeEdgeRouteCenter', () => {
  it('skips rerouting when no obstacles are present', () => {
    expect(computeEdgeRouteCenter(forwardEdge, [], routing)).toBeNull();
  });

  it('skips rerouting when obstacles do not intersect the default lane', () => {
    const distant = obstacle('mid', {
      left: 40,
      top: 300,
      right: 140,
      bottom: 420,
    });

    expect(computeEdgeRouteCenter(forwardEdge, [distant], routing)).toBeNull();
  });

  it('shifts the vertical lane away from a blocking node between handles', () => {
    const blocker = obstacle('mid', {
      left: 340,
      top: 90,
      right: 440,
      bottom: 190,
    });

    const center = computeEdgeRouteCenter(forwardEdge, [blocker], routing);
    const { waypoints } = getRoutedSmoothStepPath(forwardEdge, [blocker], routing);

    expect(center).not.toBeNull();
    expect(center!.centerX).toBeDefined();
    expect(center!.centerX!).toBeLessThan(blocker.rect.left);

    const verticalSegments = waypoints.slice(1, -1).filter((point, index, list) => {
      const next = list[index + 1];
      return next && point.x === next.x;
    });
    expect(verticalSegments.length).toBeGreaterThan(0);
    for (const point of verticalSegments) {
      expect(point.x <= blocker.rect.left || point.x >= blocker.rect.right).toBe(true);
    }
  });
});

describe('getRoutedSmoothStepPath', () => {
  it('routes backward edges around a central obstacle via a horizontal lane', () => {
    const backwardEdge: EdgeRouteEndpoints = {
      sourceX: 520,
      sourceY: 120,
      targetX: 220,
      targetY: 160,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
    const blocker = obstacle('mid', {
      left: 340,
      top: 110,
      right: 440,
      bottom: 170,
    });

    const { waypoints } = getRoutedSmoothStepPath(backwardEdge, [blocker], routing);
    const laneYs = new Set<number>();
    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = waypoints[i]!;
      const b = waypoints[i + 1]!;
      if (a.y === b.y) laneYs.add(a.y);
    }

    const routedAbove = [...laneYs].some((y) => y <= blocker.rect.top);
    const routedBelow = [...laneYs].some((y) => y >= blocker.rect.bottom);
    expect(routedAbove || routedBelow).toBe(true);
  });

  it('routes around the source node body when a backward link would cut through it', () => {
    const selfEdge: EdgeRouteEndpoints = {
      sourceX: 300,
      sourceY: 200,
      targetX: 120,
      targetY: 350,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
    const sourceBody = obstacle('src', {
      left: 80,
      top: 80,
      right: 300,
      bottom: 280,
    });

    const center = computeEdgeRouteCenter(selfEdge, [sourceBody], routing);
    expect(center).not.toBeNull();

    const { waypoints } = getRoutedSmoothStepPath(selfEdge, [sourceBody], routing);
    const horizontalYs = new Set<number>();
    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = waypoints[i]!;
      const b = waypoints[i + 1]!;
      if (a.y === b.y) horizontalYs.add(a.y);
    }

    const routedAbove = [...horizontalYs].some((y) => y <= sourceBody.rect.top);
    const routedBelow = [...horizontalYs].some((y) => y >= sourceBody.rect.bottom);
    expect(routedAbove || routedBelow).toBe(true);
  });
});

describe('edgePathNeedsObstacleRouting', () => {
  it('detects when the default bezier would cut through a node card', () => {
    const blocker = obstacle('mid', {
      left: 340,
      top: 90,
      right: 440,
      bottom: 190,
    });

    expect(edgePathNeedsObstacleRouting(forwardEdge, [blocker], routing)).toBe(true);
  });

  it('keeps bezier routing when the obstacle is below the bezier arc', () => {
    const blocker = obstacle('mid', {
      left: 360,
      top: 250,
      right: 400,
      bottom: 300,
    });

    expect(edgePathNeedsObstacleRouting(forwardEdge, [blocker], routing)).toBe(false);
  });

  it('keeps direct bezier routing when obstacles are out of the way', () => {
    const distant = obstacle('mid', {
      left: 40,
      top: 300,
      right: 140,
      bottom: 420,
    });

    expect(edgePathNeedsObstacleRouting(forwardEdge, [distant], routing)).toBe(false);
  });
});

describe('pointOnPolyline', () => {
  it('interpolates along the full routed path length', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];

    expect(pointOnPolyline(points, 0)).toEqual({ x: 0, y: 0 });
    expect(pointOnPolyline(points, 0.5)).toEqual({ x: 100, y: 0 });
    expect(pointOnPolyline(points, 1)).toEqual({ x: 100, y: 100 });
  });
});
