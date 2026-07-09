import { Position, type Edge, type Node } from '@xyflow/react';
import {
  buildEdgeRoutePlan,
  type EdgeRoutePlanEntry,
} from '@/editor-graph/edge-route-plan';
import type { EdgeRouteEndpoints, RoutingObstacle } from '@/editor-graph/edge-routing';
import {
  estimatePortCenterFromRfNode,
  estimateRfNodeHeight,
} from '@/editor-graph/node-port-geometry';
import { normalizePortId, parsePortId } from '@/shared/ports';

function portSidePosition(side: 'in' | 'out'): Position {
  return side === 'in' ? Position.Left : Position.Right;
}

export function buildFlowEdgeRoutePlan(
  nodes: Node[],
  edges: Edge[],
  obstacles: RoutingObstacle[],
): Map<string, EdgeRoutePlanEntry> {
  if (edges.length === 0 || obstacles.length === 0) {
    return new Map();
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const inputs = edges
    .map((edge) => {
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      if (!sourceNode || !targetNode) return null;

      const sourcePort = edge.sourceHandle ?? 'out_0';
      const targetPort = edge.targetHandle ?? 'in_0';
      const src = estimatePortCenterFromRfNode(sourceNode, sourcePort);
      const tgt = estimatePortCenterFromRfNode(targetNode, targetPort);
      const sourceParsed = parsePortId(normalizePortId(sourcePort));
      const targetParsed = parsePortId(normalizePortId(targetPort));

      const endpoints: EdgeRouteEndpoints = {
        sourceX: src.x,
        sourceY: src.y,
        targetX: tgt.x,
        targetY: tgt.y,
        sourcePosition: portSidePosition(sourceParsed?.kind ?? 'out'),
        targetPosition: portSidePosition(targetParsed?.kind ?? 'in'),
      };

      return {
        edgeId: edge.id,
        endpoints,
        routing: { sourceId: edge.source, targetId: edge.target },
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (inputs.length === 0) return new Map();
  return buildEdgeRoutePlan(inputs, obstacles);
}

/** Stable key for recomputing route plan when node layout changes. */
export function flowRoutePlanKey(nodes: Node[], edges: Edge[]): string {
  const nodePart = nodes
    .map((n) => {
      const h = estimateRfNodeHeight(n);
      return `${n.id}:${n.position.x.toFixed(1)},${n.position.y.toFixed(1)},${h.toFixed(1)}`;
    })
    .join(';');
  const edgePart = edges
    .map(
      (e) =>
        `${e.id}:${e.source}:${e.target}:${e.sourceHandle ?? ''}:${e.targetHandle ?? ''}`,
    )
    .join(';');
  return `${nodePart}|${edgePart}`;
}
