import type { Recipe } from '@/data/types';
import type { TagIndex } from '@/lib/tag-index';
import { Rational, R } from '@/calculator/rational';
import {
  type SchemeEdge,
  type SchemeNode,
} from '@/calculator/flow-solver-types';
import {
  resolveSourceOutputPort,
  resolveTargetInputPort,
} from '@/calculator/port-resolution';

import {
  assignStartBufferInitialFlows,
  isSchemeBufferNode,
  isSchemeStartBuffer,
} from '@/calculator/buffer-solver';
export function assignEdgeFlowsFromPorts(
  edges: SchemeEdge[],
  outgoing: Map<string, SchemeEdge[]>,
  nodePortOutputRates: Record<string, Record<string, Rational>>,
  nodeById: Map<string, SchemeNode>,
  recipes: Map<string, Recipe>,
  edgeFlows: Record<string, Rational>,
): void {
  for (const edge of edges) {
    edgeFlows[edge.id] = R.zero;
  }
  for (const [nodeId, nodeEdges] of outgoing) {
    const node = nodeById.get(nodeId);
    if (!node) continue;

    if (isSchemeStartBuffer(node)) {
      assignStartBufferInitialFlows(nodeEdges, node, edgeFlows);
      continue;
    }
    if (isSchemeBufferNode(node)) continue;

    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;
    const byPort = new Map<string, SchemeEdge[]>();
    for (const edge of nodeEdges) {
      const portId = resolveSourceOutputPort(edge, recipe);
      if (!portId) continue;
      if (!byPort.has(portId)) byPort.set(portId, []);
      byPort.get(portId)!.push(edge);
    }
    for (const [portId, portEdges] of byPort) {
      const portRate = nodePortOutputRates[nodeId]?.[portId] ?? R.zero;
      if (portEdges.length === 0) continue;
      const share = portRate.div(R.from(portEdges.length));
      for (const edge of portEdges) {
        edgeFlows[edge.id] = share;
      }
    }
  }
}

export function collectInflowsByPort(
  recipe: Recipe,
  nodeIncoming: SchemeEdge[],
  edgeFlows: Record<string, Rational>,
  tags: TagIndex,
): Record<string, Rational> {
  const inflows: Record<string, Rational> = {};
  for (let i = 0; i < recipe.inputs.length; i++) {
    inflows[`in_${i}`] = R.zero;
  }
  for (const edge of nodeIncoming) {
    const portId = resolveTargetInputPort(edge, recipe, tags);
    if (!portId) continue;
    const flow = edgeFlows[edge.id] ?? R.zero;
    inflows[portId] = (inflows[portId] ?? R.zero).add(flow);
  }
  return inflows;
}
