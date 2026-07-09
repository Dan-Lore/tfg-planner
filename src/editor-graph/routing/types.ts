import type { Position } from '@xyflow/react';
import type { NodeRect } from '@/editor-graph/node-layout-constants';

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
