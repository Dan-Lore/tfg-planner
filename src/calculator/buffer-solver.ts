import type { Recipe } from '@/data/types';
import type { SchemeEdge, SchemeNode } from '@/calculator/flow-solver-types';
import { R, type Rational } from '@/calculator/rational';
import type { TagIndex } from '@/lib/tag-index';
import { normalizePortId, parsePortId } from '@/lib/ports';
import { primaryOutputIndex } from '@/lib/primary-output';
import {
  portInputDemandRate,
  resolveSourceOutputPort,
  resolveTargetInputPort,
} from '@/calculator/port-resolution';

export const BUFFER_HORIZON_SEC = 3600;

export type SchemeBufferKind = 'start_buffer' | 'intermediate_buffer' | 'end_buffer';

export function getSchemeNodeKind(node: SchemeNode): string {
  return node.kind ?? 'machine';
}

export function isSchemeBufferNode(node: SchemeNode): boolean {
  const kind = getSchemeNodeKind(node);
  return (
    kind === 'start_buffer' ||
    kind === 'intermediate_buffer' ||
    kind === 'end_buffer'
  );
}

export function isSchemeStartBuffer(node: SchemeNode): boolean {
  return getSchemeNodeKind(node) === 'start_buffer';
}

export function isSchemeIntermediateBuffer(node: SchemeNode): boolean {
  return getSchemeNodeKind(node) === 'intermediate_buffer';
}

export function isSchemeEndBuffer(node: SchemeNode): boolean {
  return getSchemeNodeKind(node) === 'end_buffer';
}

export function resolveBufferTargetPort(edge: SchemeEdge): string | null {
  if (!edge.targetPort) return 'in_0';
  const portId = normalizePortId(edge.targetPort);
  return parsePortId(portId)?.kind === 'in' ? portId : null;
}

export function resolveBufferSourcePort(edge: SchemeEdge): string | null {
  if (!edge.sourcePort) return 'out_0';
  const portId = normalizePortId(edge.sourcePort);
  return parsePortId(portId)?.kind === 'out' ? portId : null;
}

function resolveMachineTargetInputPort(
  edge: SchemeEdge,
  recipe: Recipe,
  tags: TagIndex,
): string | null {
  return resolveTargetInputPort(edge, recipe, tags);
}

function resolveMachineSourceOutputPort(edge: SchemeEdge, recipe: Recipe): string | null {
  return resolveSourceOutputPort(edge, recipe);
}

export function collectBufferInflows(
  nodeIncoming: SchemeEdge[],
  edgeFlows: Record<string, Rational>,
): Rational {
  let total = R.zero;
  for (const edge of nodeIncoming) {
    const portId = resolveBufferTargetPort(edge);
    if (portId !== 'in_0') continue;
    total = total.add(edgeFlows[edge.id] ?? R.zero);
  }
  return total;
}

export function buildStartBufferTheoreticalRates(node: SchemeNode): Record<string, Rational> {
  const supplyRate = node.supplyRate ?? 0;
  return { out_0: R.from(Math.max(0, supplyRate)) };
}

export function configuredStartBufferCap(node: SchemeNode): Rational {
  if (node.supplyMode === 'stock') {
    const stock = node.initialStock ?? 0;
    return R.from(stock).div(R.from(BUFFER_HORIZON_SEC));
  }
  if (node.autoSupplyRate) {
    return R.from(Number.MAX_SAFE_INTEGER);
  }
  return R.from(node.supplyRate ?? 0);
}

function groupBufferOutEdgesByTargetPort(
  nodeEdges: SchemeEdge[],
  nodeById: Map<string, SchemeNode>,
  recipes: Map<string, Recipe>,
  tags: TagIndex,
): Map<string, SchemeEdge[]> {
  const byTargetPort = new Map<string, SchemeEdge[]>();
  const outEdges = nodeEdges.filter((e) => resolveBufferSourcePort(e) === 'out_0');
  for (const edge of outEdges) {
    const targetNode = nodeById.get(edge.target);
    if (!targetNode) continue;
    const targetPort = resolveTargetPortForNode(
      edge,
      targetNode,
      isSchemeBufferNode(targetNode) ? undefined : recipes.get(targetNode.recipeId),
      tags,
    );
    if (!targetPort) continue;
    const key = `${edge.target}\0${targetPort}`;
    if (!byTargetPort.has(key)) byTargetPort.set(key, []);
    byTargetPort.get(key)!.push(edge);
  }
  return byTargetPort;
}

function computeRemainingTargetPortDemand(
  sourceNodeId: string,
  targetId: string,
  targetPort: string,
  groupEdges: SchemeEdge[],
  allEdges: SchemeEdge[],
  edgeFlows: Record<string, Rational>,
  nodeById: Map<string, SchemeNode>,
  recipes: Map<string, Recipe>,
  tags: TagIndex,
  nodePortOutputRates: Record<string, Record<string, Rational>>,
): Rational {
  const targetNode = nodeById.get(targetId);
  if (!targetNode || groupEdges.length === 0) return R.zero;

  let targetDemand = R.zero;
  if (isSchemeBufferNode(targetNode)) {
    if (isSchemeEndBuffer(targetNode)) {
      targetDemand = R.from(Number.MAX_SAFE_INTEGER);
    } else if (isSchemeIntermediateBuffer(targetNode)) {
      const outEdges = allEdges.filter(
        (e) => e.source === targetId && resolveBufferSourcePort(e) === 'out_0',
      );
      targetDemand = computeDownstreamDemand(
        targetId,
        outEdges,
        allEdges,
        edgeFlows,
        nodeById,
        recipes,
        tags,
        nodePortOutputRates,
      );
    }
  } else {
    const targetRecipe = recipes.get(targetNode.recipeId);
    if (!targetRecipe) return R.zero;
    const portIndex = Number.parseInt(targetPort.slice(3), 10);
    const targetPrimaryIdx = primaryOutputIndex(targetNode, targetRecipe);
    const targetTheoretical =
      nodePortOutputRates[targetId]?.[`out_${targetPrimaryIdx}`] ?? R.zero;
    targetDemand = portInputDemandRate(
      targetRecipe,
      portIndex,
      targetTheoretical,
      targetPrimaryIdx,
    );
  }

  let otherFlow = R.zero;
  for (const edge of allEdges) {
    if (edge.target !== targetId) continue;
    const edgeTargetPort = resolveTargetPortForNode(
      edge,
      targetNode,
      isSchemeBufferNode(targetNode) ? undefined : recipes.get(targetNode.recipeId),
      tags,
    );
    if (edgeTargetPort !== targetPort || edge.source === sourceNodeId) continue;
    otherFlow = otherFlow.add(edgeFlows[edge.id] ?? R.zero);
  }

  let remainingDemand = targetDemand.sub(otherFlow);
  if (remainingDemand.compare(R.zero) < 0) remainingDemand = R.zero;
  return remainingDemand;
}

/** Sum of remaining demand on all downstream target ports fed by edges from sourceNodeId. */
export function computeDownstreamDemand(
  sourceNodeId: string,
  nodeEdges: SchemeEdge[],
  allEdges: SchemeEdge[],
  edgeFlows: Record<string, Rational>,
  nodeById: Map<string, SchemeNode>,
  recipes: Map<string, Recipe>,
  tags: TagIndex,
  nodePortOutputRates: Record<string, Record<string, Rational>>,
): Rational {
  const byTargetPort = groupBufferOutEdgesByTargetPort(
    nodeEdges,
    nodeById,
    recipes,
    tags,
  );

  let totalDemand = R.zero;
  for (const [key, groupEdges] of byTargetPort) {
    const sep = key.indexOf('\0');
    const targetId = key.slice(0, sep);
    const targetPort = key.slice(sep + 1);
    const remainingDemand = computeRemainingTargetPortDemand(
      sourceNodeId,
      targetId,
      targetPort,
      groupEdges,
      allEdges,
      edgeFlows,
      nodeById,
      recipes,
      tags,
      nodePortOutputRates,
    );
    totalDemand = totalDemand.add(remainingDemand);
  }

  return totalDemand;
}

export function computeStartBufferEffectiveOut(
  node: SchemeNode,
  downstreamDemand: Rational,
): Rational {
  if (node.autoSupplyRate && node.supplyMode === 'rate') {
    const cap = configuredStartBufferCap(node);
    if (downstreamDemand.compare(cap) < 0) return downstreamDemand;
    return cap;
  }
  const configured = configuredStartBufferCap(node);
  if (downstreamDemand.compare(configured) < 0) return downstreamDemand;
  return configured;
}

export function computeIntermediateBufferEffectiveOut(
  _node: SchemeNode,
  inflow: Rational,
  downstreamDemand: Rational,
): Rational {
  if (inflow.compare(R.zero) <= 0) return R.zero;
  let out = inflow;
  if (downstreamDemand.compare(out) < 0) out = downstreamDemand;
  return out;
}

export function assignBufferOutgoing(
  sourceNodeId: string,
  nodeEdges: SchemeEdge[],
  effectiveOut: Rational,
  edgeFlows: Record<string, Rational>,
  allEdges: SchemeEdge[],
  nodeById: Map<string, SchemeNode>,
  recipes: Map<string, Recipe>,
  tags: TagIndex,
  nodePortOutputRates: Record<string, Record<string, Rational>>,
): number {
  let maxDelta = 0;
  const outEdges = nodeEdges.filter((e) => resolveBufferSourcePort(e) === 'out_0');
  if (outEdges.length === 0) return 0;

  const byTargetPort = groupBufferOutEdgesByTargetPort(
    nodeEdges,
    nodeById,
    recipes,
    tags,
  );

  const edgeWeights = new Map<string, Rational>();
  let totalWeight = R.zero;

  for (const [key, groupEdges] of byTargetPort) {
    const sep = key.indexOf('\0');
    const targetId = key.slice(0, sep);
    const targetPort = key.slice(sep + 1);
    const remainingDemand = computeRemainingTargetPortDemand(
      sourceNodeId,
      targetId,
      targetPort,
      groupEdges,
      allEdges,
      edgeFlows,
      nodeById,
      recipes,
      tags,
      nodePortOutputRates,
    );
    const perEdgeWeight = remainingDemand.div(R.from(groupEdges.length));
    for (const edge of groupEdges) {
      edgeWeights.set(edge.id, perEdgeWeight);
      totalWeight = totalWeight.add(perEdgeWeight);
    }
  }

  const assignFlow = (edgeId: string, next: Rational) => {
    const prev = edgeFlows[edgeId] ?? R.zero;
    const delta = Math.abs(next.sub(prev).toNumber());
    if (delta > maxDelta) maxDelta = delta;
    edgeFlows[edgeId] = next;
  };

  if (totalWeight.compare(R.zero) <= 0) {
    const shareBase = effectiveOut.div(R.from(outEdges.length));
    for (const edge of outEdges) {
      assignFlow(edge.id, shareBase);
    }
    return maxDelta;
  }

  for (const edge of outEdges) {
    const weight = edgeWeights.get(edge.id) ?? R.zero;
    assignFlow(edge.id, effectiveOut.mul(weight).div(totalWeight));
  }

  return maxDelta;
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
  const effectiveOut = computeIntermediateBufferEffectiveOut(node, inflow, demand);
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

export function buildBufferPortOutputRates(
  node: SchemeNode,
  effectiveOut: Rational,
): Record<string, Rational> {
  if (isSchemeStartBuffer(node) || isSchemeIntermediateBuffer(node)) {
    return { out_0: effectiveOut };
  }
  return {};
}

export function buildBufferSurplus(
  node: SchemeNode,
  inflow: Rational,
  outflow: Rational,
): Record<string, Rational> {
  const key = node.itemId ?? node.fluidId ?? '';
  if (!key) return {};
  if (isSchemeEndBuffer(node)) {
    if (inflow.compare(R.zero) > 0) return { [key]: inflow };
    return {};
  }
  const surplus = inflow.sub(outflow);
  if (surplus.compare(R.zero) > 0) return { [key]: surplus };
  return {};
}

export function buildBufferNodeLoad(
  node: SchemeNode,
  inflow: Rational,
  outflow: Rational,
): Rational {
  if (isSchemeStartBuffer(node)) {
    const cap = configuredStartBufferCap(node);
    if (cap.compare(R.zero) <= 0 || cap.toNumber() >= Number.MAX_SAFE_INTEGER / 2) {
      return outflow.compare(R.zero) > 0 ? R.from(1) : R.zero;
    }
    return outflow.div(cap);
  }
  if (isSchemeIntermediateBuffer(node)) {
    if (outflow.compare(R.zero) <= 0) return R.zero;
    return inflow.compare(R.zero) > 0 ? outflow.div(inflow) : R.zero;
  }
  if (isSchemeEndBuffer(node)) {
    return inflow.compare(R.zero) > 0 ? R.from(1) : R.zero;
  }
  return R.zero;
}

export function resolveTargetPortForNode(
  edge: SchemeEdge,
  targetNode: SchemeNode,
  recipe: Recipe | undefined,
  tags: TagIndex,
): string | null {
  if (isSchemeBufferNode(targetNode)) {
    return resolveBufferTargetPort(edge);
  }
  if (!recipe) return null;
  return resolveMachineTargetInputPort(edge, recipe, tags);
}

export function resolveSourcePortForNode(
  edge: SchemeEdge,
  sourceNode: SchemeNode,
  recipe: Recipe | undefined,
): string | null {
  if (isSchemeBufferNode(sourceNode)) {
    return resolveBufferSourcePort(edge);
  }
  if (!recipe) return null;
  return resolveMachineSourceOutputPort(edge, recipe);
}
