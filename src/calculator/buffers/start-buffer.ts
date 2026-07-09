import type { Recipe } from '@/data/types';
import type { SchemeEdge, SchemeNode } from '@/calculator/flow-solver-types';
import { R, type Rational } from '@/calculator/rational';
import type { TagIndex } from '@/shared/tag-index';
import { resolveBufferSourcePort } from '@/calculator/buffer-kind';
import {
  assignBufferOutgoing,
  computeDownstreamDemand,
  computeStartBufferEffectiveOut,
} from '@/calculator/buffers/assign';

export { BUFFER_HORIZON_SEC, configuredStartBufferCap } from '@/calculator/buffers/start-buffer-cap';

export function buildStartBufferTheoreticalRates(node: SchemeNode): Record<string, Rational> {
  const supplyRate = node.supplyRate ?? 0;
  return { out_0: R.from(Math.max(0, supplyRate)) };
}

export function processStartBufferIteration(
  nodeId: string,
  node: SchemeNode,
  nodeEdges: SchemeEdge[],
  allEdges: SchemeEdge[],
  edgeFlows: Record<string, Rational>,
  nodeById: Map<string, SchemeNode>,
  recipes: Map<string, Recipe>,
  tags: TagIndex,
  nodePortOutputRates: Record<string, Record<string, Rational>>,
): number {
  const demand = computeDownstreamDemand(
    nodeId,
    nodeEdges,
    allEdges,
    edgeFlows,
    nodeById,
    recipes,
    tags,
    nodePortOutputRates,
  );
  const effectiveOut = computeStartBufferEffectiveOut(node, demand);
  return assignBufferOutgoing(
    nodeId,
    nodeEdges,
    effectiveOut,
    edgeFlows,
    allEdges,
    nodeById,
    recipes,
    tags,
    nodePortOutputRates,
  );
}

export function assignStartBufferInitialFlows(
  nodeEdges: SchemeEdge[],
  node: SchemeNode,
  edgeFlows: Record<string, Rational>,
): void {
  const rate = buildStartBufferTheoreticalRates(node).out_0 ?? R.zero;
  const outEdges = nodeEdges.filter((e) => resolveBufferSourcePort(e) === 'out_0');
  if (outEdges.length === 0) return;
  const share = rate.div(R.from(outEdges.length));
  for (const edge of outEdges) {
    edgeFlows[edge.id] = share;
  }
}
