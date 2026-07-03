import { Position, type Edge, type Node } from '@xyflow/react';
import type { BufferNodeData } from '@/canvas/BufferNode';
import type { MachineNodeData } from '@/canvas/MachineNode';
import {
  BUFFER_NODE_WIDTH,
  MACHINE_NODE_WIDTH,
  PORT_ROW_HEIGHT,
  estimateBufferNodeHeightFromData,
  estimateHeaderHeight,
  estimateMachineNodeHeight,
} from '@/canvas/node-bounds';
import { normalizePortId, parsePortId } from '@/canvas/ports';
import {
  buildEdgeRoutePlan,
  type EdgeRoutePlanEntry,
} from '@/lib/edge-route-plan';
import type { EdgeRouteEndpoints, RoutingObstacle } from '@/lib/edge-routing';

function estimateMachinePortCenter(
  node: Node,
  port: string,
): { x: number; y: number } {
  const data = node.data as MachineNodeData;
  const parsed = parsePortId(normalizePortId(port));
  if (!parsed) return { x: node.position.x, y: node.position.y };
  const portsTopY =
    estimateHeaderHeight(data.pack, data.machineId, data.recipeId) +
    node.position.y;
  const y = portsTopY + parsed.index * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2;
  const width = data.layoutWidth ?? node.measured?.width ?? MACHINE_NODE_WIDTH;
  const x =
    parsed.kind === 'in' ? node.position.x : node.position.x + width;
  return { x, y };
}

function estimateBufferPortCenter(
  node: Node,
  port: string,
): { x: number; y: number } {
  const data = node.data as BufferNodeData;
  const parsed = parsePortId(normalizePortId(port));
  if (!parsed) return { x: node.position.x, y: node.position.y };
  const header = 56;
  const fields = data.bufferKind === 'start_buffer' ? 88 : 36;
  const portsTopY = node.position.y + header + fields;
  const y = portsTopY + parsed.index * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2;
  const x =
    parsed.kind === 'in'
      ? node.position.x
      : node.position.x + BUFFER_NODE_WIDTH;
  return { x, y };
}

function estimatePortCenter(node: Node, port: string): { x: number; y: number } {
  return node.type === 'buffer'
    ? estimateBufferPortCenter(node, port)
    : estimateMachinePortCenter(node, port);
}

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
      const src = estimatePortCenter(sourceNode, sourcePort);
      const tgt = estimatePortCenter(targetNode, targetPort);
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
      const h =
        n.type === 'buffer'
          ? estimateBufferNodeHeightFromData(n.data as BufferNodeData)
          : estimateMachineNodeHeight(n.data as MachineNodeData);
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
