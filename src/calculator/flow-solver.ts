import type { PackData, Recipe } from '@/data/types';
import { Rational, R } from './rational';
import { ceilMachineCount, idealMachineCount } from './rounding';
import { buildTagIndex } from '@/lib/tag-index';
import { recipeInputMatchesProduct } from '@/lib/flow-match';
import { normalizePortId, parsePortId } from '@/canvas/ports';

export const TICKS_PER_SECOND = 20;

export interface SchemeNode {
  id: string;
  machineId: string;
  recipeId: string;
  machineCount: number;
  overclock: number;
  parallel: number;
  outputMultiplier: number;
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
  nodeInputRates: Record<string, Record<string, Rational>>;
  nodeSurplus: Record<string, Record<string, Rational>>;
  nodeMachineCounts: Record<string, number>;
}

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

function nodeSpeedFactor(node: SchemeNode): Rational {
  return R.from(node.overclock * node.outputMultiplier);
}

function recipeDurationSec(recipe: Recipe): Rational {
  return R.from(recipe.durationTicks).div(R.from(TICKS_PER_SECOND));
}

function perMachineOutputRateAtIndex(recipe: Recipe, index: number): Rational {
  const output = recipe.outputs[index];
  if (!output) return R.zero;
  return R.from(output.amount).div(recipeDurationSec(recipe));
}

function perMachineOutputRate(
  recipe: Recipe,
  outputKey: string,
): Rational {
  const index = recipe.outputs.findIndex((o) => productKey(o) === outputKey);
  if (index < 0) return R.zero;
  return perMachineOutputRateAtIndex(recipe, index);
}

function buildNodePortOutputRates(
  recipe: Recipe,
  factor: Rational,
): Record<string, Rational> {
  const rates: Record<string, Rational> = {};
  for (let i = 0; i < recipe.outputs.length; i++) {
    rates[`out_${i}`] = perMachineOutputRateAtIndex(recipe, i).mul(factor);
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

function inputDemandRate(
  recipe: Recipe,
  inputKey: string,
  outputRate: Rational,
  primaryOutKey: string,
): Rational {
  const inp = recipe.inputs.find((i) => productKey(i) === inputKey);
  const primaryOut = recipe.outputs.find((o) => productKey(o) === primaryOutKey);
  if (!inp || !primaryOut) return R.zero;
  return outputRate.mul(R.from(inp.amount)).div(R.from(primaryOut.amount));
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
      const perMachine = perMachineOutputRate(recipe, key).mul(nodeSpeedFactor(node));
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
      const perMachine = perMachineOutputRate(recipe, maxKey).mul(nodeSpeedFactor(node));
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
      perMachineOutputRate(recipe, primaryKey)
        .mul(nodeSpeedFactor(node))
        .mul(R.from(nodeMachineCounts[nodeId]));

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
    const factor = nodeSpeedFactor(node).mul(R.from(nodeMachineCounts[node.id]));
    const portRates = buildNodePortOutputRates(recipe, factor);
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
        const perMachine = perMachineOutputRate(recipe, key).mul(nodeSpeedFactor(down));
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
    const factor = nodeSpeedFactor(node).mul(R.from(nodeMachineCounts[node.id]));
    const portRates = buildNodePortOutputRates(recipe, factor);
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

  const edgeTargetFlows: Record<string, Rational> = {};
  const nodeInputRates: Record<string, Record<string, Rational>> = {};
  const nodeSurplus: Record<string, Record<string, Rational>> = {};

  for (const node of input.nodes) {
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;
    nodeInputRates[node.id] = {};
    nodeSurplus[node.id] = {};

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
    const key = edge.itemId ?? edge.fluidId ?? '';
    const targetNode = nodeById.get(edge.target);
    const targetRecipe = targetNode ? recipes.get(targetNode.recipeId) : undefined;
    const sourceRate = edgeFlows[edge.id] ?? R.zero;

    if (targetRecipe && key) {
      const primaryOut = targetRecipe.outputs[0];
      const primaryKey = primaryOut ? productKey(primaryOut) : '';
      const targetOutRate = primaryOut
        ? (nodePortOutputRates[edge.target]?.['out_0'] ?? R.zero)
        : R.zero;
      edgeTargetFlows[edge.id] = primaryKey
        ? inputDemandRate(targetRecipe, key, targetOutRate, primaryKey)
        : sourceRate;
    } else {
      edgeTargetFlows[edge.id] = sourceRate;
    }
  }

  for (const node of input.nodes) {
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;

    for (let i = 0; i < recipe.outputs.length; i++) {
      const k = productKey(recipe.outputs[i]!);
      const portId = `out_${i}`;
      const produced = nodePortOutputRates[node.id]?.[portId] ?? R.zero;
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

  return {
    edgeFlows,
    edgeTargetFlows,
    nodeOutputRates,
    nodePortOutputRates,
    nodeInputRates,
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
