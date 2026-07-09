import type { Recipe } from '@/data/types';
import type { SchemeEdge, SchemeNode } from '@/calculator/flow-solver-types';
import { R, type Rational } from '@/calculator/rational';
import type { TagIndex } from '@/shared/tag-index';
import {
  assignBufferOutgoing,
  collectBufferInflows,
  computeDownstreamDemand,
} from '@/calculator/buffers/assign';

export function computeIntermediateBufferEffectiveOut(
  _node: SchemeNode,
  inflow: Rational,
  downstreamDemand: Rational,
  bootstrapInflow?: Rational,
): Rational {
  let effectiveInflow = inflow;
  if (
    inflow.compare(R.zero) <= 0 &&
    bootstrapInflow &&
    bootstrapInflow.compare(R.zero) > 0
  ) {
    effectiveInflow = bootstrapInflow;
  }
  if (effectiveInflow.compare(R.zero) <= 0) return R.zero;
  let out = effectiveInflow;
  if (downstreamDemand.compare(out) < 0) out = downstreamDemand;
  return out;
}

export function processIntermediateBufferIteration(
  nodeId: string,
  node: SchemeNode,
  nodeIncoming: SchemeEdge[],
  nodeEdges: SchemeEdge[],
  allEdges: SchemeEdge[],
  edgeFlows: Record<string, Rational>,
  nodeById: Map<string, SchemeNode>,
  recipes: Map<string, Recipe>,
  tags: TagIndex,
  nodePortOutputRates: Record<string, Record<string, Rational>>,
  bootstrapInflowByNodeId?: ReadonlyMap<string, Rational>,
): number {
  const inflow = collectBufferInflows(nodeIncoming, edgeFlows);
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
  const bootstrapInflow = bootstrapInflowByNodeId?.get(nodeId);
  const effectiveOut = computeIntermediateBufferEffectiveOut(
    node,
    inflow,
    demand,
    bootstrapInflow,
  );
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
