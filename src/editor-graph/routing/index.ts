export { pointOnPolyline } from '@/editor-graph/edge-geometry';

export {
  DEFAULT_EDGE_OFFSET,
  HANDLE_EXIT_GRACE,
  MIN_STACK_GAP_LANE,
  ROUTE_LANE_INSET,
  type EdgeRouteCenter,
  type EdgeRouteEndpoints,
  type EdgeRoutingOptions,
  type RoutingObstacle,
} from './types';

export {
  bezierHitsThirdPartyObstacles,
  pathCrossesNodeBody,
  pathHitsThirdPartyObstacles,
} from './obstacles';

export {
  buildSmoothStepRoute,
  edgePathNeedsObstacleRouting,
  getRoutedSmoothStepPath,
} from './smooth-step';

export { computeEdgeRouteCenter } from './route-center';
