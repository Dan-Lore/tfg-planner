import { memo, useMemo, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import {
  edgeLabelPosition,
  edgeLabelPositionOnWaypoints,
} from '@/lib/bezier-edge-label';
import {
  edgePathNeedsObstacleRouting,
  buildSmoothStepRoute,
  getRoutedSmoothStepPath,
  pathCrossesNodeBody,
  pathHitsThirdPartyObstacles,
  DEFAULT_EDGE_OFFSET,
  type EdgeRouteEndpoints,
} from '@/lib/edge-routing';
import { applyParallelOffset } from '@/lib/edge-route-plan';
import { useObstacleRects } from '@/canvas/obstacle-rects-context';
import { useEdgeSelected } from '@/canvas/selection-context';
import { useEdgeRoutePlanEntry } from '@/canvas/use-edge-route-plan';
import type { FlowEdgeData } from '@/lib/flow-edge-types';

export type { FlowEdgeData } from '@/lib/flow-edge-types';

type RoutedPath = {
  path: string;
  sourceLabel: { x: number; y: number };
  targetLabel: { x: number; y: number };
};

function buildBezierRoute(
  endpoints: EdgeRouteEndpoints,
  sourceLabel: string | undefined,
  targetLabel: string | undefined,
): RoutedPath {
  const [path] = getBezierPath(endpoints);
  return {
    path,
    sourceLabel: edgeLabelPosition(endpoints, 'source', sourceLabel),
    targetLabel: edgeLabelPosition(endpoints, 'target', targetLabel),
  };
}

function edgeToneStroke(
  base: string,
  hover: string,
  selectedTone: string,
  isSelected: boolean,
  isHovered: boolean,
): string {
  if (isSelected) return selectedTone;
  if (isHovered) return hover;
  return base;
}

function edgeToneWidth(
  base: number,
  hover: number,
  selectedWidth: number,
  isSelected: boolean,
  isHovered: boolean,
): number {
  if (isSelected) return selectedWidth;
  if (isHovered) return hover;
  return base;
}

function edgePropsEqual(a: EdgeProps, b: EdgeProps): boolean {
  if (a.id !== b.id) return false;
  if (a.sourceX !== b.sourceX || a.sourceY !== b.sourceY) return false;
  if (a.targetX !== b.targetX || a.targetY !== b.targetY) return false;
  if (a.selected !== b.selected) return false;
  const da = a.data as FlowEdgeData | undefined;
  const db = b.data as FlowEdgeData | undefined;
  return (
    da?.isCycleSeed === db?.isCycleSeed &&
    da?.cycleSeedTitle === db?.cycleSeedTitle &&
    da?.source === db?.source &&
    da?.target === db?.target &&
    da?.checkSeverity === db?.checkSeverity &&
    da?.issuePanelFocus === db?.issuePanelFocus
  );
}

const FlowEdgeComponent = memo(function FlowEdgeComponent({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
  selected,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const storeSelected = useEdgeSelected(id);
  const { obstacles, skipObstacleRouting } = useObstacleRects();
  const routePlan = useEdgeRoutePlanEntry(id);
  const d = (data ?? {}) as FlowEdgeData;
  const isCycleYellow = d.isCycleSeed || d.issuePanelFocus === true;
  const isWarningEdge = d.checkSeverity === 'warning' && !isCycleYellow;
  const isErrorEdge = d.checkSeverity === 'error';
  const isPlainFlow = !isCycleYellow && !isWarningEdge && !isErrorEdge;
  const isActive = selected || storeSelected || d.issuePanelFocus === true;

  const cycleStroke = isCycleYellow
    ? edgeToneStroke(
        'var(--cycle-seed)',
        'var(--cycle-seed-hover)',
        'var(--cycle-seed-selected)',
        isActive,
        hovered,
      )
    : undefined;
  const issueStroke = isErrorEdge
    ? edgeToneStroke(
        'var(--issue-error)',
        'var(--issue-error-hover)',
        'var(--issue-error-selected)',
        isActive,
        hovered,
      )
    : isWarningEdge
      ? edgeToneStroke(
          'var(--issue-warning)',
          'var(--issue-warning-hover)',
          'var(--issue-warning-selected)',
          isActive,
          hovered,
        )
      : undefined;
  const plainStroke = isPlainFlow
    ? edgeToneStroke(
        'var(--edge-flow-stroke)',
        'var(--accent)',
        'var(--accent-hover)',
        isActive,
        hovered,
      )
    : undefined;
  const edgeStroke = cycleStroke ?? issueStroke ?? plainStroke;

  const edgeStrokeWidth = isCycleYellow
    ? edgeToneWidth(2.25, 2.75, 3, isActive, hovered)
    : issueStroke
      ? edgeToneWidth(2.25, 2.5, 2.75, isActive, hovered)
      : isPlainFlow
        ? edgeToneWidth(1.5, 2, 2.5, isActive, hovered)
        : undefined;
  const edgeTitle = d.cycleSeedTitle ?? d.checkTitle;
  const round = (value: number) => Math.round(value);

  const endpoints = useMemo(
    () => ({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
    }),
    [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition],
  );

  const routingOptions = useMemo(
    () => ({ sourceId: source, targetId: target }),
    [source, target],
  );

  const routed = useMemo(() => {
    if (skipObstacleRouting) {
      return buildBezierRoute(endpoints, d.source, d.target);
    }

    if (!edgePathNeedsObstacleRouting(endpoints, obstacles, routingOptions)) {
      return buildBezierRoute(endpoints, d.source, d.target);
    }

    const { center: liveCenter } = getRoutedSmoothStepPath(
      endpoints,
      obstacles,
      routingOptions,
    );
    let center = liveCenter;
    if (
      routePlan?.parallelOffset &&
      (routePlan.parallelOffset.centerX !== undefined ||
        routePlan.parallelOffset.centerY !== undefined)
    ) {
      const shifted = applyParallelOffset(liveCenter, routePlan.parallelOffset);
      const routeHits = (candidate: typeof liveCenter) =>
        pathHitsThirdPartyObstacles(
          endpoints,
          candidate,
          obstacles,
          DEFAULT_EDGE_OFFSET,
          routingOptions,
        ) +
        pathCrossesNodeBody(
          endpoints,
          candidate,
          source,
          obstacles,
          DEFAULT_EDGE_OFFSET,
          routingOptions,
        ) +
        pathCrossesNodeBody(
          endpoints,
          candidate,
          target,
          obstacles,
          DEFAULT_EDGE_OFFSET,
          routingOptions,
        );
      if (routeHits(shifted) <= routeHits(liveCenter)) {
        center = shifted;
      }
    }
    const { path, waypoints } = buildSmoothStepRoute(endpoints, center);
    return {
      path,
      sourceLabel: edgeLabelPositionOnWaypoints(
        waypoints,
        endpoints,
        'source',
        d.source,
      ),
      targetLabel: edgeLabelPositionOnWaypoints(
        waypoints,
        endpoints,
        'target',
        d.target,
      ),
    };
  }, [
    endpoints,
    obstacles,
    routingOptions,
    skipObstacleRouting,
    routePlan,
    d.source,
    d.target,
  ]);

  return (
    <g
      className={[
        'flow-edge',
        isCycleYellow && 'flow-edge--cycle-seed',
        isWarningEdge && 'flow-edge--issue-warning',
        isErrorEdge && 'flow-edge--issue-error',
        hovered && 'flow-edge--hovered',
        isActive && 'flow-edge--selected',
      ]
        .filter(Boolean)
        .join(' ')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {edgeTitle ? <title>{edgeTitle}</title> : null}
      <BaseEdge
        id={id}
        path={routed.path}
        markerEnd={markerEnd}
        interactionWidth={18}
        style={{
          ...style,
          strokeWidth: edgeStrokeWidth,
          stroke: edgeStroke,
          strokeDasharray: isWarningEdge ? '7 5' : undefined,
          transition: 'stroke 0.15s ease, stroke-width 0.15s ease',
        }}
      />
      <EdgeLabelRenderer>
        {d.source && (
          <div
            className="flow-edge-label flow-edge-label--source"
            style={{
              transform: `translate(-50%, -50%) translate(${round(routed.sourceLabel.x)}px, ${round(routed.sourceLabel.y)}px)`,
            }}
          >
            {d.source}
          </div>
        )}
        {d.target && (
          <div
            className="flow-edge-label flow-edge-label--target"
            style={{
              transform: `translate(-50%, -50%) translate(${round(routed.targetLabel.x)}px, ${round(routed.targetLabel.y)}px)`,
            }}
          >
            {d.target}
          </div>
        )}
      </EdgeLabelRenderer>
    </g>
  );
}, edgePropsEqual);

export const FlowEdge = FlowEdgeComponent;
