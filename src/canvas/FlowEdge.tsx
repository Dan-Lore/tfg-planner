import { memo, useMemo, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useNodes,
  type EdgeProps,
} from '@xyflow/react';
import {
  edgeLabelPosition,
  edgeLabelPositionOnWaypoints,
} from '@/lib/bezier-edge-label';
import {
  edgePathNeedsObstacleRouting,
  getRoutedSmoothStepPath,
  type EdgeRouteEndpoints,
} from '@/lib/edge-routing';
import { getFlowNodeRect } from '@/canvas/node-bounds';

export interface FlowEdgeData {
  source?: string;
  target?: string;
  checkSeverity?: 'error' | 'warning';
  checkTitle?: string;
  [key: string]: unknown;
}

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

function edgePropsEqual(a: EdgeProps, b: EdgeProps): boolean {
  if (a.id !== b.id) return false;
  if (a.sourceX !== b.sourceX || a.sourceY !== b.sourceY) return false;
  if (a.targetX !== b.targetX || a.targetY !== b.targetY) return false;
  if (a.selected !== b.selected) return false;
  const da = a.data as FlowEdgeData | undefined;
  const db = b.data as FlowEdgeData | undefined;
  return (
    da?.source === db?.source &&
    da?.target === db?.target &&
    da?.checkSeverity === db?.checkSeverity
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
  const nodes = useNodes();
  const d = (data ?? {}) as FlowEdgeData;
  const emphasized = selected || hovered;
  const issueStroke =
    d.checkSeverity === 'error'
      ? 'var(--issue-error)'
      : d.checkSeverity === 'warning'
        ? 'var(--issue-warning)'
        : undefined;
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

  const obstacles = useMemo(
    () =>
      nodes
        .filter((node) => node.type === 'machine' || node.type === 'buffer')
        .map((node) => ({
          nodeId: node.id,
          rect: getFlowNodeRect(node),
        })),
    [nodes],
  );

  const routed = useMemo(() => {
    if (!edgePathNeedsObstacleRouting(endpoints, obstacles, routingOptions)) {
      return buildBezierRoute(endpoints, d.source, d.target);
    }

    const { path, waypoints } = getRoutedSmoothStepPath(
      endpoints,
      obstacles,
      routingOptions,
    );
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
  }, [endpoints, obstacles, routingOptions, d.source, d.target]);

  return (
    <g
      className={
        d.checkSeverity ? `flow-edge flow-edge--issue-${d.checkSeverity}` : 'flow-edge'
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {d.checkTitle ? <title>{d.checkTitle}</title> : null}
      <BaseEdge
        id={id}
        path={routed.path}
        markerEnd={markerEnd}
        interactionWidth={18}
        style={{
          ...style,
          strokeWidth: selected ? 2.5 : issueStroke ? 2.25 : hovered ? 2 : undefined,
          stroke: issueStroke ?? (emphasized ? 'var(--accent)' : undefined),
          strokeDasharray: d.checkSeverity === 'warning' ? '7 5' : undefined,
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
