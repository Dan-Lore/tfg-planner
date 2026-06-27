import type { Recipe } from '@/data/types';
import type { SchemeEdge, SchemeNode } from '@/calculator/flow-solver';
import { R, type Rational } from '@/calculator/rational';
import type { TagIndex } from '@/lib/tag-index';
import { recipeInputMatchesProduct } from '@/lib/flow-match';
import { normalizePortId, parsePortId } from '@/canvas/ports';

function portInputDemandRate(
  recipe: Recipe,
  inputIndex: number,
  primaryOutputRate: Rational,
): Rational {
  const inp = recipe.inputs[inputIndex];
  const primaryOut = recipe.outputs[0];
  if (!inp || !primaryOut) return R.zero;
  return primaryOutputRate.mul(R.from(inp.amount)).div(R.from(primaryOut.amount));
}

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
  if (edge.targetPort) {
    const portId = normalizePortId(edge.targetPort);
    const parsed = parsePortId(portId);
    if (parsed?.kind === 'in') return portId;
  }
  const key = edge.itemId ?? edge.fluidId ?? '';
  if (!key) return null;
  for (let i = 0; i < recipe.inputs.length; i++) {
    const inKey = recipe.inputs[i]!.itemId ?? recipe.inputs[i]!.fluidId ?? '';
    if (inKey === key || recipeInputMatchesProduct(inKey, key, tags)) {
      return `in_${i}`;
    }
  }
  return null;
}

function resolveMachineSourceOutputPort(edge: SchemeEdge, recipe: Recipe): string | null {
  if (edge.sourcePort) {
    const portId = normalizePortId(edge.sourcePort);
    const parsed = parsePortId(portId);
    if (parsed?.kind === 'out') return portId;
  }
  const key = edge.itemId ?? edge.fluidId ?? '';
  if (!key) return null;
  const index = recipe.outputs.findIndex(
    (o) => (o.itemId ?? o.fluidId ?? '') === key,
  );
  return index >= 0 ? `out_${index}` : null;
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

export function intermediateThrottleCap(node: SchemeNode): Rational {
  const capacity = node.capacity ?? 0;
  if (capacity <= 0) return R.from(Number.MAX_SAFE_INTEGER);
  return R.from(capacity).div(R.from(BUFFER_HORIZON_SEC));
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
  const byTargetPort = new Map<string, SchemeEdge[]>();
  for (const edge of nodeEdges) {
    const targetNode = nodeById.get(edge.target);
    if (!targetNode) continue;
    let targetPort: string | null = null;
    if (isSchemeBufferNode(targetNode)) {
      targetPort = resolveBufferTargetPort(edge);
    } else {
      const recipe = recipes.get(targetNode.recipeId);
      if (!recipe) continue;
      targetPort = resolveMachineTargetInputPort(edge, recipe, tags);
    }
    if (!targetPort) continue;
    const key = `${edge.target}\0${targetPort}`;
    if (!byTargetPort.has(key)) byTargetPort.set(key, []);
    byTargetPort.get(key)!.push(edge);
  }

  let totalDemand = R.zero;
  for (const [key, groupEdges] of byTargetPort) {
    const sep = key.indexOf('\0');
    const targetId = key.slice(0, sep);
    const targetPort = key.slice(sep + 1);
    const targetNode = nodeById.get(targetId);
    if (!targetNode) continue;

    let targetDemand = R.zero;
    if (isSchemeBufferNode(targetNode)) {
      if (isSchemeEndBuffer(targetNode)) {
        targetDemand = R.from(Number.MAX_SAFE_INTEGER);
      } else if (isSchemeIntermediateBuffer(targetNode)) {
        targetDemand = intermediateThrottleCap(targetNode);
      }
    } else {
      const targetRecipe = recipes.get(targetNode.recipeId);
      if (!targetRecipe) continue;
      const portIndex = Number.parseInt(targetPort.slice(3), 10);
      const targetTheoretical = nodePortOutputRates[targetId]?.['out_0'] ?? R.zero;
      targetDemand = portInputDemandRate(targetRecipe, portIndex, targetTheoretical);
    }

    let otherFlow = R.zero;
    for (const edge of allEdges) {
      if (edge.target !== targetId) continue;
      let edgeTargetPort: string | null = null;
      if (isSchemeBufferNode(targetNode)) {
        edgeTargetPort = resolveBufferTargetPort(edge);
      } else {
        const targetRecipe = recipes.get(targetNode.recipeId);
        if (!targetRecipe) continue;
        edgeTargetPort = resolveMachineTargetInputPort(edge, targetRecipe, tags);
      }
      if (edgeTargetPort !== targetPort || edge.source === sourceNodeId) continue;
      otherFlow = otherFlow.add(edgeFlows[edge.id] ?? R.zero);
    }

    let remainingDemand = targetDemand.sub(otherFlow);
    if (remainingDemand.compare(R.zero) < 0) remainingDemand = R.zero;

    const edgeCount = groupEdges.length;
    if (edgeCount > 0) {
      totalDemand = totalDemand.add(remainingDemand);
    }
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
  node: SchemeNode,
  inflow: Rational,
  downstreamDemand: Rational,
): Rational {
  if (inflow.compare(R.zero) <= 0) return R.zero;
  const throttle = intermediateThrottleCap(node);
  let out = inflow;
  if (downstreamDemand.compare(out) < 0) out = downstreamDemand;
  if (throttle.compare(out) < 0) out = throttle;
  return out;
}

export function assignBufferOutgoing(
  nodeEdges: SchemeEdge[],
  effectiveOut: Rational,
  edgeFlows: Record<string, Rational>,
): number {
  let maxDelta = 0;
  const outEdges = nodeEdges.filter((e) => resolveBufferSourcePort(e) === 'out_0');
  if (outEdges.length === 0) return 0;

  const shareBase = effectiveOut.div(R.from(outEdges.length));
  for (const edge of outEdges) {
    const prev = edgeFlows[edge.id] ?? R.zero;
    const next = shareBase;
    const delta = Math.abs(next.sub(prev).toNumber());
    if (delta > maxDelta) maxDelta = delta;
    edgeFlows[edge.id] = next;
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
  return assignBufferOutgoing(nodeEdges, effectiveOut, edgeFlows);
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
  return assignBufferOutgoing(nodeEdges, effectiveOut, edgeFlows);
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
    const throttle = intermediateThrottleCap(node);
    if (outflow.compare(R.zero) <= 0) return R.zero;
    if (throttle.toNumber() >= Number.MAX_SAFE_INTEGER / 2) {
      return inflow.compare(R.zero) > 0 ? outflow.div(inflow) : R.zero;
    }
    return outflow.div(throttle);
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
