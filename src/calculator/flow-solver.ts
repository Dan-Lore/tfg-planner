import type { PackData, Recipe } from '@/data/types';
import type { VoltageTier } from '@/calculator/gt-voltage';
import { effectiveDurationTicks } from '@/calculator/energy';
import { Rational, R } from './rational';
import { ceilMachineCount, idealMachineCount } from './rounding';
import { buildTagIndex } from '@/lib/tag-index';
import { recipeInputMatchesProduct } from '@/lib/flow-match';
import { normalizePortId, parsePortId } from '@/canvas/ports';
import { chanceRateMultiplier } from '@/lib/flow-chance';

export const TICKS_PER_SECOND = 20;

export interface SchemeNode {
  id: string;
  machineId: string;
  recipeId: string;
  machineCount: number;
  overclock: number;
  parallel: number;
  voltageTier: VoltageTier;
}

export interface SchemeEdge {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  itemId?: string;
  fluidId?: string;
}

export interface SchemeTarget {
  nodeId: string;
  itemId?: string;
  fluidId?: string;
  ratePerSecond: number;
}

export interface FlowResult {
  edgeFlows: Record<string, Rational>;
  edgeTargetFlows: Record<string, Rational>;
  /** Total output rate per product key (sum across output ports). */
  nodeOutputRates: Record<string, Record<string, Rational>>;
  /** Output rate per physical port (`out_0`, `out_1`, …). */
  nodePortOutputRates: Record<string, Record<string, Rational>>;
  /** Theoretical input demand per product key (port labels). */
  nodeInputRates: Record<string, Record<string, Rational>>;
  /** Shortfall per input port (`in_0`, …) after converged flow. */
  nodePortDeficit: Record<string, Record<string, Rational>>;
  /** Input port load 0…1: inflow / demand (capped at 1). */
  nodePortInLoad: Record<string, Record<string, Rational>>;
  /** Overall node load 0…1 (min input loads, or output use for sources). */
  nodeLoad: Record<string, Rational>;
  nodeSurplus: Record<string, Record<string, Rational>>;
  nodeMachineCounts: Record<string, number>;
}

const CONVERGENCE_EPS = 1e-9;
const MAX_FLOW_ITERATIONS = 50;

export interface SolverInput {
  nodes: SchemeNode[];
  edges: SchemeEdge[];
  targets: SchemeTarget[];
  pack: PackData;
  /** When true (default), user-set machine counts are kept for rate display. */
  preserveManualMachineCounts?: boolean;
}

function recipeMap(pack: PackData): Map<string, Recipe> {
  return new Map(pack.recipes.map((r) => [r.id, r]));
}

function productKey(flow: { itemId?: string; fluidId?: string }): string {
  return flow.itemId ?? flow.fluidId ?? '';
}

function freezeManualMachineCounts(
  nodes: SchemeNode[],
  nodeMachineCounts: Record<string, number>,
): void {
  for (const node of nodes) {
    nodeMachineCounts[node.id] = Math.max(1, node.machineCount);
  }
}

function recipeDurationSec(recipe: Recipe, node: SchemeNode): Rational {
  return R.from(effectiveDurationTicks(recipe, node.voltageTier, node.overclock)).div(
    R.from(TICKS_PER_SECOND),
  );
}

function perMachineOutputRateAtIndex(
  recipe: Recipe,
  index: number,
  node: SchemeNode,
): Rational {
  const output = recipe.outputs[index];
  if (!output) return R.zero;
  const base = R.from(output.amount).div(recipeDurationSec(recipe, node));
  return base.mul(chanceRateMultiplier(output.chance));
}

function perMachineOutputRate(
  recipe: Recipe,
  outputKey: string,
  node: SchemeNode,
): Rational {
  const index = recipe.outputs.findIndex((o) => productKey(o) === outputKey);
  if (index < 0) return R.zero;
  return perMachineOutputRateAtIndex(recipe, index, node);
}

function buildNodePortOutputRates(
  recipe: Recipe,
  node: SchemeNode,
  machineCount: Rational,
): Record<string, Rational> {
  const rates: Record<string, Rational> = {};
  for (let i = 0; i < recipe.outputs.length; i++) {
    rates[`out_${i}`] = perMachineOutputRateAtIndex(recipe, i, node).mul(machineCount);
  }
  return rates;
}

function sumPortRatesByProduct(
  recipe: Recipe,
  portRates: Record<string, Rational>,
): Record<string, Rational> {
  const totals: Record<string, Rational> = {};
  for (let i = 0; i < recipe.outputs.length; i++) {
    const key = productKey(recipe.outputs[i]!);
    const rate = portRates[`out_${i}`] ?? R.zero;
    totals[key] = (totals[key] ?? R.zero).add(rate);
  }
  return totals;
}

function resolveTargetInputPort(
  edge: SchemeEdge,
  recipe: Recipe,
  tags: ReturnType<typeof buildTagIndex>,
): string | null {
  if (edge.targetPort) {
    const portId = normalizePortId(edge.targetPort);
    const parsed = parsePortId(portId);
    if (parsed?.kind === 'in') return portId;
  }
  const key = edge.itemId ?? edge.fluidId ?? '';
  if (!key) return null;
  for (let i = 0; i < recipe.inputs.length; i++) {
    const inKey = productKey(recipe.inputs[i]!);
    if (inKey === key || recipeInputMatchesProduct(inKey, key, tags)) {
      return `in_${i}`;
    }
  }
  return null;
}

function resolveSourceOutputPort(
  edge: SchemeEdge,
  recipe: Recipe,
): string | null {
  if (edge.sourcePort) {
    const portId = normalizePortId(edge.sourcePort);
    const parsed = parsePortId(portId);
    if (parsed?.kind === 'out') return portId;
  }
  const key = edge.itemId ?? edge.fluidId ?? '';
  if (!key) return null;
  const index = recipe.outputs.findIndex((o) => productKey(o) === key);
  return index >= 0 ? `out_${index}` : null;
}

function assignEdgeFlowsFromPorts(
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
    const recipe = node ? recipes.get(node.recipeId) : undefined;
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

function collectInflowsByPort(
  nodeId: string,
  recipe: Recipe,
  nodeIncoming: SchemeEdge[],
  edgeFlows: Record<string, Rational>,
  tags: ReturnType<typeof buildTagIndex>,
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

function computeEffectivePortRates(
  recipe: Recipe,
  theoreticalPortRates: Record<string, Rational>,
  inflowsByPort: Record<string, Rational>,
  connectedInPorts: Set<string>,
): Record<string, Rational> {
  const effective: Record<string, Rational> = {};
  const theoreticalPrimary = theoreticalPortRates['out_0'] ?? R.zero;

  if (recipe.inputs.length === 0) {
    for (const [portId, rate] of Object.entries(theoreticalPortRates)) {
      effective[portId] = rate;
    }
    return effective;
  }

  if (theoreticalPrimary.compare(R.zero) <= 0) {
    for (let i = 0; i < recipe.outputs.length; i++) {
      effective[`out_${i}`] = R.zero;
    }
    return effective;
  }

  const primaryOut = recipe.outputs[0]!;
  let effectivePrimary = theoreticalPrimary;

  for (let i = 0; i < recipe.inputs.length; i++) {
    const portId = `in_${i}`;
    const inp = recipe.inputs[i]!;
    const demandAtTheoretical = portInputDemandRate(recipe, i, theoreticalPrimary);
    const connected = connectedInPorts.has(portId);
    const inflow = connected
      ? (inflowsByPort[portId] ?? R.zero)
      : demandAtTheoretical;
    const maxPrimary = inflow
      .mul(R.from(primaryOut.amount))
      .div(R.from(inp.amount));
    if (maxPrimary.compare(effectivePrimary) < 0) {
      effectivePrimary = maxPrimary;
    }
  }

  if (effectivePrimary.compare(R.zero) < 0) {
    effectivePrimary = R.zero;
  }

  const scale =
    theoreticalPrimary.compare(R.zero) > 0
      ? effectivePrimary.div(theoreticalPrimary)
      : R.zero;

  for (let i = 0; i < recipe.outputs.length; i++) {
    const portId = `out_${i}`;
    const theoretical = theoreticalPortRates[portId] ?? R.zero;
    effective[portId] = theoretical.mul(scale);
  }

  return effective;
}

function assignOutgoingFromEffectiveRates(
  nodeId: string,
  nodeEdges: SchemeEdge[],
  allEdges: SchemeEdge[],
  recipe: Recipe,
  effectivePortRates: Record<string, Rational>,
  edgeFlows: Record<string, Rational>,
  nodePortOutputRates: Record<string, Record<string, Rational>>,
  nodeById: Map<string, SchemeNode>,
  recipes: Map<string, Recipe>,
  tags: ReturnType<typeof buildTagIndex>,
): number {
  let maxDelta = 0;
  const edgeShares = new Map<string, Rational>();
  const byPort = new Map<string, SchemeEdge[]>();
  for (const edge of nodeEdges) {
    const portId = resolveSourceOutputPort(edge, recipe);
    if (!portId) continue;
    if (!byPort.has(portId)) byPort.set(portId, []);
    byPort.get(portId)!.push(edge);
  }
  for (const [portId, portEdges] of byPort) {
    const portRate = effectivePortRates[portId] ?? R.zero;
    const shareBase =
      portEdges.length > 0 ? portRate.div(R.from(portEdges.length)) : R.zero;
    for (const edge of portEdges) {
      edgeShares.set(edge.id, shareBase);
    }
  }

  const byTargetPort = new Map<string, SchemeEdge[]>();
  for (const edge of nodeEdges) {
    const targetNode = nodeById.get(edge.target);
    const targetRecipe = targetNode ? recipes.get(targetNode.recipeId) : undefined;
    if (!targetNode || !targetRecipe) continue;
    const targetPort = resolveTargetInputPort(edge, targetRecipe, tags);
    if (!targetPort) continue;
    const key = `${edge.target}\0${targetPort}`;
    if (!byTargetPort.has(key)) byTargetPort.set(key, []);
    byTargetPort.get(key)!.push(edge);
  }

  for (const [key, groupEdges] of byTargetPort) {
    const sep = key.indexOf('\0');
    const targetId = key.slice(0, sep);
    const targetPort = key.slice(sep + 1);
    const targetNode = nodeById.get(targetId);
    const targetRecipe = targetNode ? recipes.get(targetNode.recipeId) : undefined;
    if (!targetNode || !targetRecipe) continue;

    const externalEdges = groupEdges.filter((edge) => edge.source !== edge.target);
    if (externalEdges.length === 0) continue;

    const portIndex = Number.parseInt(targetPort.slice(3), 10);
    const targetTheoretical = nodePortOutputRates[targetId]?.['out_0'] ?? R.zero;
    const targetDemand = portInputDemandRate(
      targetRecipe,
      portIndex,
      targetTheoretical,
    );

    let totalShare = R.zero;
    for (const edge of externalEdges) {
      totalShare = totalShare.add(edgeShares.get(edge.id) ?? R.zero);
    }

    let otherFlow = R.zero;
    for (const edge of allEdges) {
      if (edge.target !== targetId) continue;
      const edgeTargetPort = resolveTargetInputPort(
        edge,
        targetRecipe,
        tags,
      );
      if (edgeTargetPort !== targetPort || edge.source === nodeId) continue;
      otherFlow = otherFlow.add(edgeFlows[edge.id] ?? R.zero);
    }

    let remainingDemand = targetDemand.sub(otherFlow);
    if (remainingDemand.compare(R.zero) < 0) {
      remainingDemand = R.zero;
    }

    if (
      totalShare.compare(remainingDemand) > 0 &&
      totalShare.compare(R.zero) > 0
    ) {
      const scale = remainingDemand.div(totalShare);
      for (const edge of externalEdges) {
        const prev = edgeShares.get(edge.id) ?? R.zero;
        edgeShares.set(edge.id, prev.mul(scale));
      }
    }
  }

  for (const [edgeId, share] of edgeShares) {
    const prev = edgeFlows[edgeId] ?? R.zero;
    const delta = Math.abs(share.sub(prev).toNumber());
    if (delta > maxDelta) maxDelta = delta;
    edgeFlows[edgeId] = share;
  }

  return maxDelta;
}

function computeConvergedFlows(
  nodes: SchemeNode[],
  edges: SchemeEdge[],
  nodePortOutputRates: Record<string, Record<string, Rational>>,
  incoming: Map<string, SchemeEdge[]>,
  outgoing: Map<string, SchemeEdge[]>,
  nodeById: Map<string, SchemeNode>,
  recipes: Map<string, Recipe>,
  tags: ReturnType<typeof buildTagIndex>,
  nodeOrder: string[],
  connectedInPortsByNode: Record<string, Set<string>>,
): Record<string, Rational> {
  const edgeFlows: Record<string, Rational> = {};
  for (const edge of edges) {
    edgeFlows[edge.id] = R.zero;
  }

  for (const nodeId of nodeOrder) {
    const node = nodeById.get(nodeId);
    const recipe = node ? recipes.get(node.recipeId) : undefined;
    if (!node || !recipe) continue;
    const theoretical = nodePortOutputRates[nodeId] ?? {};
    assignOutgoingFromEffectiveRates(
      nodeId,
      outgoing.get(nodeId) ?? [],
      edges,
      recipe,
      theoretical,
      edgeFlows,
      nodePortOutputRates,
      nodeById,
      recipes,
      tags,
    );
  }

  for (let iter = 0; iter < MAX_FLOW_ITERATIONS; iter++) {
    let maxDelta = 0;
    for (const nodeId of nodeOrder) {
      const node = nodeById.get(nodeId);
      const recipe = node ? recipes.get(node.recipeId) : undefined;
      if (!node || !recipe) continue;

      const theoretical = nodePortOutputRates[nodeId] ?? {};
      const inflows = collectInflowsByPort(
        nodeId,
        recipe,
        incoming.get(nodeId) ?? [],
        edgeFlows,
        tags,
      );
      const effective = computeEffectivePortRates(
        recipe,
        theoretical,
        inflows,
        connectedInPortsByNode[nodeId] ?? new Set(),
      );
      const delta = assignOutgoingFromEffectiveRates(
        nodeId,
        outgoing.get(nodeId) ?? [],
        edges,
        recipe,
        effective,
        edgeFlows,
        nodePortOutputRates,
        nodeById,
        recipes,
        tags,
      );
      if (delta > maxDelta) maxDelta = delta;
    }
    if (maxDelta < CONVERGENCE_EPS) break;
  }

  return edgeFlows;
}

function computeNodePortDeficit(
  nodes: SchemeNode[],
  incoming: Map<string, SchemeEdge[]>,
  nodePortOutputRates: Record<string, Record<string, Rational>>,
  effectivePortRatesByNode: Record<string, Record<string, Rational>>,
  inflowsByNode: Record<string, Record<string, Rational>>,
  connectedInPortsByNode: Record<string, Set<string>>,
  recipes: Map<string, Recipe>,
): Record<string, Record<string, Rational>> {
  const nodePortDeficit: Record<string, Record<string, Rational>> = {};

  for (const node of nodes) {
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;
    nodePortDeficit[node.id] = {};

    const theoreticalPrimary = nodePortOutputRates[node.id]?.['out_0'] ?? R.zero;
    const effectivePrimary = effectivePortRatesByNode[node.id]?.['out_0'] ?? R.zero;

    for (let i = 0; i < recipe.inputs.length; i++) {
      const portId = `in_${i}`;
      const connected = connectedInPortsByNode[node.id]?.has(portId) ?? false;
      const demand = connected
        ? portInputDemandRate(recipe, i, theoreticalPrimary)
        : portInputDemandRate(
            recipe,
            i,
            effectivePrimary.compare(R.zero) > 0
              ? effectivePrimary
              : theoreticalPrimary,
          );
      if (demand.compare(R.zero) <= 0) continue;

      const inflow = connected
        ? (inflowsByNode[node.id]?.[portId] ?? R.zero)
        : R.zero;
      const deficit = connected ? demand.sub(inflow) : demand;

      if (deficit.compare(R.zero) > 0) {
        nodePortDeficit[node.id][portId] = deficit;
      }
    }
  }

  return nodePortDeficit;
}

function capLoadFraction(inflow: Rational, demand: Rational): Rational {
  if (demand.compare(R.zero) <= 0) return R.from(1);
  const ratio = inflow.div(demand);
  return ratio.compare(R.from(1)) > 0 ? R.from(1) : ratio;
}

function computeNodePortInLoad(
  nodes: SchemeNode[],
  nodePortOutputRates: Record<string, Record<string, Rational>>,
  inflowsByNode: Record<string, Record<string, Rational>>,
  connectedInPortsByNode: Record<string, Set<string>>,
  recipes: Map<string, Recipe>,
): Record<string, Record<string, Rational>> {
  const nodePortInLoad: Record<string, Record<string, Rational>> = {};

  for (const node of nodes) {
    const recipe = recipes.get(node.recipeId);
    if (!recipe || recipe.inputs.length === 0) continue;
    nodePortInLoad[node.id] = {};

    const theoreticalPrimary = nodePortOutputRates[node.id]?.['out_0'] ?? R.zero;

    for (let i = 0; i < recipe.inputs.length; i++) {
      const portId = `in_${i}`;
      const demand = portInputDemandRate(recipe, i, theoreticalPrimary);
      if (demand.compare(R.zero) <= 0) continue;

      const connected = connectedInPortsByNode[node.id]?.has(portId) ?? false;
      const inflow = connected
        ? (inflowsByNode[node.id]?.[portId] ?? R.zero)
        : R.zero;
      nodePortInLoad[node.id][portId] = capLoadFraction(inflow, demand);
    }
  }

  return nodePortInLoad;
}

function computeNodeLoad(
  nodes: SchemeNode[],
  nodePortOutputRates: Record<string, Record<string, Rational>>,
  effectivePortRatesByNode: Record<string, Record<string, Rational>>,
  inflowsByNode: Record<string, Record<string, Rational>>,
  connectedInPortsByNode: Record<string, Set<string>>,
  outgoing: Map<string, SchemeEdge[]>,
  edgeFlows: Record<string, Rational>,
  recipes: Map<string, Recipe>,
): Record<string, Rational> {
  const nodeLoad: Record<string, Rational> = {};

  for (const node of nodes) {
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;

    const theoreticalPrimary = nodePortOutputRates[node.id]?.['out_0'] ?? R.zero;
    const effectivePrimary = effectivePortRatesByNode[node.id]?.['out_0'] ?? R.zero;

    let outputUse = R.from(1);
    for (let i = 0; i < recipe.outputs.length; i++) {
      const portId = `out_${i}`;
      const produced = nodePortOutputRates[node.id]?.[portId] ?? R.zero;
      if (produced.compare(R.zero) <= 0) continue;
      let sent = R.zero;
      for (const edge of outgoing.get(node.id) ?? []) {
        const edgePort = resolveSourceOutputPort(edge, recipe);
        if (edgePort !== portId) continue;
        sent = sent.add(edgeFlows[edge.id] ?? R.zero);
      }
      const portUse = capLoadFraction(sent, produced);
      if (portUse.compare(outputUse) < 0) outputUse = portUse;
    }

    if (recipe.inputs.length === 0) {
      nodeLoad[node.id] = outputUse;
      continue;
    }

    let minConnectedInLoad = R.from(1);
    let hasConnectedInput = false;
    for (let i = 0; i < recipe.inputs.length; i++) {
      const portId = `in_${i}`;
      const connected = connectedInPortsByNode[node.id]?.has(portId) ?? false;
      if (!connected) continue;
      hasConnectedInput = true;
      const demand = portInputDemandRate(recipe, i, theoreticalPrimary);
      if (demand.compare(R.zero) <= 0) continue;
      const inflow = inflowsByNode[node.id]?.[portId] ?? R.zero;
      const portLoad = capLoadFraction(inflow, demand);
      if (portLoad.compare(minConnectedInLoad) < 0) {
        minConnectedInLoad = portLoad;
      }
    }

    const inputLimited =
      theoreticalPrimary.compare(R.zero) <= 0
        ? R.zero
        : capLoadFraction(effectivePrimary, theoreticalPrimary);

    const inputLoad = hasConnectedInput ? minConnectedInLoad : inputLimited;
    nodeLoad[node.id] =
      outputUse.compare(inputLoad) < 0 ? outputUse : inputLoad;
  }

  return nodeLoad;
}

function computeSurplusFromEffective(
  nodes: SchemeNode[],
  outgoing: Map<string, SchemeEdge[]>,
  effectivePortRatesByNode: Record<string, Record<string, Rational>>,
  edgeFlows: Record<string, Rational>,
  recipes: Map<string, Recipe>,
): Record<string, Record<string, Rational>> {
  const nodeSurplus: Record<string, Record<string, Rational>> = {};

  for (const node of nodes) {
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;
    nodeSurplus[node.id] = {};

    for (let i = 0; i < recipe.outputs.length; i++) {
      const k = productKey(recipe.outputs[i]!);
      const portId = `out_${i}`;
      const produced = effectivePortRatesByNode[node.id]?.[portId] ?? R.zero;
      let sent = R.zero;
      for (const edge of outgoing.get(node.id) ?? []) {
        const edgePort = resolveSourceOutputPort(edge, recipe);
        if (edgePort !== portId) continue;
        sent = sent.add(edgeFlows[edge.id] ?? R.zero);
      }
      const surplus = produced.sub(sent);
      if (surplus.compare(R.zero) > 0) {
        nodeSurplus[node.id][k] = (nodeSurplus[node.id][k] ?? R.zero).add(surplus);
      }
    }
  }

  return nodeSurplus;
}

function buildConnectedInPorts(
  nodes: SchemeNode[],
  incoming: Map<string, SchemeEdge[]>,
  recipes: Map<string, Recipe>,
  tags: ReturnType<typeof buildTagIndex>,
): Record<string, Set<string>> {
  const connected: Record<string, Set<string>> = {};
  for (const node of nodes) {
    connected[node.id] = new Set();
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;
    for (const edge of incoming.get(node.id) ?? []) {
      const portId = resolveTargetInputPort(edge, recipe, tags);
      if (portId) connected[node.id]!.add(portId);
    }
  }
  return connected;
}


/** Demand at a specific input port from primary output rate (per-port, not aggregated by item). */
export function portInputDemandRate(
  recipe: Recipe,
  inputIndex: number,
  primaryOutputRate: Rational,
): Rational {
  const inp = recipe.inputs[inputIndex];
  const primaryOut = recipe.outputs[0];
  if (!inp || !primaryOut) return R.zero;
  return primaryOutputRate.mul(R.from(inp.amount)).div(R.from(primaryOut.amount));
}

function buildAdjacency(edges: SchemeEdge[]) {
  const incoming = new Map<string, SchemeEdge[]>();
  const outgoing = new Map<string, SchemeEdge[]>();
  for (const e of edges) {
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    incoming.get(e.target)!.push(e);
    outgoing.get(e.source)!.push(e);
  }
  return { incoming, outgoing };
}
function topologicalOrder(
  nodeIds: string[],
  edges: SchemeEdge[],
): string[] | null {
  const ids = new Set(nodeIds);
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }
  const queue = nodeIds.filter((id) => inDegree.get(id) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const n = queue.shift()!;
    order.push(n);
    for (const next of adj.get(n) ?? []) {
      const d = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  return order.length === nodeIds.length ? order : null;
}

/**
 * Пересчёт потоков: целевые скорости → ceil(machineCount) → потоки по DAG.
 */
export function solveFlows(input: SolverInput): FlowResult {
  const preserveCounts = input.preserveManualMachineCounts !== false;
  const recipes = recipeMap(input.pack);
  const tags = buildTagIndex(input.pack);
  const nodeById = new Map(input.nodes.map((n) => [n.id, n]));
  const { incoming, outgoing } = buildAdjacency(input.edges);

  const nodeMachineCounts: Record<string, number> = {};
  const requiredOutput: Record<string, Record<string, Rational>> = {};

  for (const node of input.nodes) {
    nodeMachineCounts[node.id] = Math.max(1, node.machineCount);
    requiredOutput[node.id] = {};
  }

  for (const target of input.targets) {
    const node = nodeById.get(target.nodeId);
    if (!node) continue;
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;
    const key = target.itemId ?? target.fluidId ?? '';
    if (!key) continue;

    const rate = R.from(target.ratePerSecond);
    requiredOutput[node.id][key] = rate;

    if (!preserveCounts) {
      const perMachine = perMachineOutputRate(recipe, key, node);
      const ideal = idealMachineCount(rate, perMachine);
      nodeMachineCounts[node.id] = ceilMachineCount(ideal);
      node.machineCount = nodeMachineCounts[node.id];
    }
  }

  const order =
    topologicalOrder(
      input.nodes.map((n) => n.id),
      input.edges,
    ) ?? input.nodes.map((n) => n.id);

  const reverseOrder = [...order].reverse();

  for (const nodeId of reverseOrder) {
    const node = nodeById.get(nodeId);
    if (!node) continue;
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;

    const outReq = requiredOutput[nodeId];
    let maxRate = R.zero;
    let maxKey = '';
    for (const [k, v] of Object.entries(outReq)) {
      if (v.compare(maxRate) > 0) {
        maxRate = v;
        maxKey = k;
      }
    }

    if (!preserveCounts && maxKey && maxRate.compare(R.zero) > 0) {
      const perMachine = perMachineOutputRate(recipe, maxKey, node);
      const ideal = idealMachineCount(maxRate, perMachine);
      const count = ceilMachineCount(ideal);
      nodeMachineCounts[nodeId] = count;
      node.machineCount = count;
    }

    const primaryOut = recipe.outputs[0];
    if (!primaryOut) continue;
    const primaryKey = productKey(primaryOut);
    const nodeOutRate =
      outReq[primaryKey] ??
      perMachineOutputRate(recipe, primaryKey, node).mul(
        R.from(nodeMachineCounts[nodeId]),
      );

    if (!outReq[primaryKey]) {
      requiredOutput[nodeId][primaryKey] = nodeOutRate;
    }

    for (const inp of recipe.inputs) {
      const inKey = productKey(inp);
      const outAmount = recipe.outputs.find((o) => productKey(o) === primaryKey)?.amount ?? 1;
      const inRate = nodeOutRate.mul(R.from(inp.amount)).div(R.from(outAmount));
      for (const edge of incoming.get(nodeId) ?? []) {
        const edgeKey = edge.itemId ?? edge.fluidId ?? '';
        if (!recipeInputMatchesProduct(inKey, edgeKey, tags)) continue;
        const up = nodeById.get(edge.source);
        if (!up) continue;
        const upRecipe = recipes.get(up.recipeId);
        if (!upRecipe) continue;
        const upOutKey = productKey(upRecipe.outputs[0] ?? {});
        if (!requiredOutput[edge.source][upOutKey]) {
          requiredOutput[edge.source][upOutKey] = inRate;
        } else if (inRate.compare(requiredOutput[edge.source][upOutKey]) > 0) {
          requiredOutput[edge.source][upOutKey] = inRate;
        }
      }
    }
  }

  const edgeFlows: Record<string, Rational> = {};
  const nodeOutputRates: Record<string, Record<string, Rational>> = {};
  const nodePortOutputRates: Record<string, Record<string, Rational>> = {};

  for (const node of input.nodes) {
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;
    const factor = R.from(nodeMachineCounts[node.id]);
    const portRates = buildNodePortOutputRates(recipe, node, factor);
    nodePortOutputRates[node.id] = portRates;
    nodeOutputRates[node.id] = sumPortRatesByProduct(recipe, portRates);
  }

  assignEdgeFlowsFromPorts(
    input.edges,
    outgoing,
    nodePortOutputRates,
    nodeById,
    recipes,
    edgeFlows,
  );

  if (!preserveCounts) {
    for (const nodeId of order) {
      for (const edge of outgoing.get(nodeId) ?? []) {
        const key = edge.itemId ?? edge.fluidId ?? '';
        const rate = edgeFlows[edge.id];
        if (!rate || rate.compare(R.zero) <= 0) continue;
        const down = nodeById.get(edge.target);
        if (!down) continue;
        const recipe = recipes.get(down.recipeId);
        if (!recipe) continue;
        if (!requiredOutput[edge.target][key]) {
          requiredOutput[edge.target][key] = rate;
        }
        const perMachine = perMachineOutputRate(recipe, key, down);
        if (perMachine.compare(R.zero) > 0) {
          const ideal = idealMachineCount(rate, perMachine);
          const count = ceilMachineCount(ideal);
          if (count > nodeMachineCounts[edge.target]) {
            nodeMachineCounts[edge.target] = count;
            down.machineCount = count;
          }
        }
      }
    }
  }

  if (preserveCounts) {
    freezeManualMachineCounts(input.nodes, nodeMachineCounts);
  }

  for (const node of input.nodes) {
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;
    const factor = R.from(nodeMachineCounts[node.id]);
    const portRates = buildNodePortOutputRates(recipe, node, factor);
    nodePortOutputRates[node.id] = portRates;
    nodeOutputRates[node.id] = sumPortRatesByProduct(recipe, portRates);
  }

  assignEdgeFlowsFromPorts(
    input.edges,
    outgoing,
    nodePortOutputRates,
    nodeById,
    recipes,
    edgeFlows,
  );

  const connectedInPortsByNode = buildConnectedInPorts(
    input.nodes,
    incoming,
    recipes,
    tags,
  );

  const convergedEdgeFlows = computeConvergedFlows(
    input.nodes,
    input.edges,
    nodePortOutputRates,
    incoming,
    outgoing,
    nodeById,
    recipes,
    tags,
    order,
    connectedInPortsByNode,
  );

  const effectivePortRatesByNode: Record<string, Record<string, Rational>> = {};
  const inflowsByNode: Record<string, Record<string, Rational>> = {};
  for (const node of input.nodes) {
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;
    const theoretical = nodePortOutputRates[node.id] ?? {};
    const inflows = collectInflowsByPort(
      node.id,
      recipe,
      incoming.get(node.id) ?? [],
      convergedEdgeFlows,
      tags,
    );
    inflowsByNode[node.id] = inflows;
    effectivePortRatesByNode[node.id] = computeEffectivePortRates(
      recipe,
      theoretical,
      inflows,
      connectedInPortsByNode[node.id] ?? new Set(),
    );
  }

  const edgeTargetFlows: Record<string, Rational> = {};
  const nodeInputRates: Record<string, Record<string, Rational>> = {};
  const nodePortDeficit = computeNodePortDeficit(
    input.nodes,
    incoming,
    nodePortOutputRates,
    effectivePortRatesByNode,
    inflowsByNode,
    connectedInPortsByNode,
    recipes,
  );
  const nodePortInLoad = computeNodePortInLoad(
    input.nodes,
    nodePortOutputRates,
    inflowsByNode,
    connectedInPortsByNode,
    recipes,
  );
  const nodeLoad = computeNodeLoad(
    input.nodes,
    nodePortOutputRates,
    effectivePortRatesByNode,
    inflowsByNode,
    connectedInPortsByNode,
    outgoing,
    convergedEdgeFlows,
    recipes,
  );
  const nodeSurplus = computeSurplusFromEffective(
    input.nodes,
    outgoing,
    effectivePortRatesByNode,
    convergedEdgeFlows,
    recipes,
  );

  for (const node of input.nodes) {
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;
    nodeInputRates[node.id] = {};

    const primaryOut = recipe.outputs[0];
    const primaryKey = primaryOut ? productKey(primaryOut) : '';
    const primaryOutRate = primaryOut
      ? (nodePortOutputRates[node.id]?.['out_0'] ?? R.zero)
      : R.zero;

    for (const inp of recipe.inputs) {
      const inKey = productKey(inp);
      const demand = primaryKey
        ? primaryOutRate.mul(R.from(inp.amount)).div(R.from(primaryOut!.amount))
        : R.zero;
      nodeInputRates[node.id][inKey] = demand;
    }
  }

  for (const edge of input.edges) {
    edgeTargetFlows[edge.id] = convergedEdgeFlows[edge.id] ?? R.zero;
  }

  return {
    edgeFlows: convergedEdgeFlows,
    edgeTargetFlows,
    nodeOutputRates,
    nodePortOutputRates,
    nodeInputRates,
    nodePortDeficit,
    nodePortInLoad,
    nodeLoad,
    nodeSurplus,
    nodeMachineCounts,
  };
}
export function formatRate(rate: Rational): string {
  const n = rate.toNumber();
  if (n === 0) return '0';
  if (n >= 100) return n.toFixed(1);
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

/** Load fraction 0…1 → display percent (capped 0–100). */
export function formatLoadPercent(fraction: Rational): string {
  const pct = Math.min(
    100,
    Math.max(0, fraction.mul(R.from(100)).toNumber()),
  );
  if (pct >= 99.95) return '100%';
  if (pct <= 0.05) return '0%';
  return `${Math.round(pct)}%`;
}
