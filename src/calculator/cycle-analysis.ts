import type { FlowResult, SchemeEdge, SchemeNode, SchemeNodeKind } from '@/calculator/flow-solver-types';
import { perMachineOutputRateAtIndex } from '@/calculator/flow-rates';
import { portInputDemandRate } from '@/calculator/port-resolution';
import { R, type Rational } from '@/calculator/rational';
import type { PackData, Recipe } from '@/data/types';
import { primaryOutputIndex } from '@/lib/primary-output';
import type { TagIndex } from '@/lib/tag-index';
import { productKey } from '@/lib/ports';

const BALANCE_EPS_R = R.of(1, 1_000_000n);
const FLOW_EPS_R = R.of(1, 1_000_000_000n);
const CATALYST_RATIO_EPS = 0.05;

function rationalAbs(value: Rational): Rational {
  return value.compare(R.zero) < 0 ? value.mul(R.from(-1)) : value;
}

export interface CycleComponent {
  index: number;
  nodeIds: string[];
}

export interface CycleProductBalance {
  sccIndex: number;
  productId: string;
  produce: Rational;
  consume: Rational;
  net: Rational;
}

export interface CycleAnalysisResult {
  components: CycleComponent[];
  balances: CycleProductBalance[];
  notRunning: { sccIndex: number; nodeIds: string[] }[];
  catalystImbalances: {
    sccIndex: number;
    productId: string;
    ratio: number;
    nodeIds: string[];
  }[];
}

import type { VoltageTier } from '@/calculator/gt-voltage';

export interface CycleAnalysisNode {
  id: string;
  kind?: SchemeNodeKind;
  machineId?: string;
  recipeId?: string;
  machineCount?: number;
  overclock?: number;
  parallel?: number;
  voltageTier?: VoltageTier;
  itemId?: string;
  fluidId?: string;
  primaryOutputIndex?: number;
}

function asSolverNode(node: CycleAnalysisNode): SchemeNode {
  return {
    id: node.id,
    kind: node.kind,
    machineId: node.machineId ?? '',
    recipeId: node.recipeId ?? '',
    machineCount: node.machineCount ?? 1,
    overclock: node.overclock ?? 1,
    parallel: node.parallel ?? 1,
    voltageTier: node.voltageTier ?? 'LV',
    itemId: node.itemId,
    fluidId: node.fluidId,
    primaryOutputIndex: node.primaryOutputIndex,
  };
}

function isCycleGraphNode(node: CycleAnalysisNode): boolean {
  const kind = node.kind ?? 'machine';
  return kind === 'machine' || kind === 'intermediate_buffer';
}

/** Strongly connected components among machines and intermediate buffers. */
export function findCycleComponents(
  nodes: readonly CycleAnalysisNode[],
  edges: readonly SchemeEdge[],
): CycleComponent[] {
  const cycleNodeIds = new Set(
    nodes.filter(isCycleGraphNode).map((n) => n.id),
  );
  if (cycleNodeIds.size === 0) return [];

  const adj = new Map<string, string[]>();
  for (const id of cycleNodeIds) adj.set(id, []);
  for (const edge of edges) {
    if (!cycleNodeIds.has(edge.source) || !cycleNodeIds.has(edge.target)) continue;
    adj.get(edge.source)!.push(edge.target);
  }

  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const components: string[][] = [];

  function strongConnect(v: string): void {
    indices.set(v, index);
    lowlink.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      const hasCycle =
        scc.length > 1 ||
        (adj.get(v)?.includes(v) ?? false);
      if (hasCycle) components.push(scc);
    }
  }

  for (const id of cycleNodeIds) {
    if (!indices.has(id)) strongConnect(id);
  }

  return components.map((nodeIds, i) => ({ index: i, nodeIds }));
}

function productsInScc(
  nodeIds: ReadonlySet<string>,
  nodeById: Map<string, CycleAnalysisNode>,
  recipes: Map<string, Recipe>,
): Set<string> {
  const products = new Set<string>();
  for (const nodeId of nodeIds) {
    const node = nodeById.get(nodeId);
    if (!node) continue;
    if (node.kind === 'intermediate_buffer') {
      const key = node.itemId ?? node.fluidId;
      if (key) products.add(key);
      continue;
    }
    if (!node.recipeId) continue;
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;
    for (const flow of [...recipe.inputs, ...recipe.outputs]) {
      const key = productKey(flow);
      if (key) products.add(key);
    }
  }
  return products;
}

function theoreticalPrimaryRate(
  node: CycleAnalysisNode,
  recipe: Recipe,
  flowResult: FlowResult,
): Rational {
  return flowResult.nodePortOutputRates[node.id]?.[`out_${primaryOutputIndex(asSolverNode(node), recipe)}`] ?? R.zero;
}

function computeProductBalances(
  scc: CycleComponent,
  nodeById: Map<string, CycleAnalysisNode>,
  recipes: Map<string, Recipe>,
  flowResult: FlowResult,
): CycleProductBalance[] {
  const nodeIdSet = new Set(scc.nodeIds);
  const productIds = productsInScc(nodeIdSet, nodeById, recipes);
  const balances: CycleProductBalance[] = [];

  for (const productId of productIds) {
    let produce = R.zero;
    let consume = R.zero;

    for (const nodeId of scc.nodeIds) {
      const node = nodeById.get(nodeId);
      if (!node) continue;

      if (node.kind === 'intermediate_buffer') {
        const bufferKey = node.itemId ?? node.fluidId ?? '';
        if (bufferKey !== productId) continue;
        const inflow = flowResult.nodePortInLoad[nodeId]?.in_0 ?? R.zero;
        const outflow = flowResult.nodeEffectivePortOutputRates[nodeId]?.out_0 ?? R.zero;
        consume = consume.add(inflow);
        produce = produce.add(outflow);
        continue;
      }

      if (!node?.recipeId) continue;
      const recipe = recipes.get(node.recipeId);
      if (!recipe) continue;

      for (let i = 0; i < recipe.outputs.length; i++) {
        if (productKey(recipe.outputs[i]!) !== productId) continue;
        const effective =
          flowResult.nodeEffectivePortOutputRates[nodeId]?.[`out_${i}`] ?? R.zero;
        produce = produce.add(effective);
      }

      for (let i = 0; i < recipe.inputs.length; i++) {
        if (productKey(recipe.inputs[i]!) !== productId) continue;
        const portLoad = flowResult.nodePortInLoad[nodeId]?.[`in_${i}`] ?? R.zero;
        if (portLoad.compare(R.zero) > 0) {
          consume = consume.add(portLoad);
        }
      }
    }

    const net = produce.sub(consume);
    const hasActivity =
      rationalAbs(produce).compare(BALANCE_EPS_R) > 0 ||
      rationalAbs(consume).compare(BALANCE_EPS_R) > 0;
    if (hasActivity) {
      balances.push({ sccIndex: scc.index, productId, produce, consume, net });
    }
  }

  return balances;
}

function sccInternalFlowSum(
  scc: CycleComponent,
  edges: readonly SchemeEdge[],
  edgeFlows: Record<string, Rational>,
): Rational {
  const nodeIdSet = new Set(scc.nodeIds);
  let sum = R.zero;
  for (const edge of edges) {
    if (!nodeIdSet.has(edge.source) || !nodeIdSet.has(edge.target)) continue;
    sum = sum.add(edgeFlows[edge.id] ?? R.zero);
  }
  return sum;
}

function sccHasTheoreticalActivity(
  scc: CycleComponent,
  nodeById: Map<string, CycleAnalysisNode>,
  recipes: Map<string, Recipe>,
  flowResult: FlowResult,
): boolean {
  for (const nodeId of scc.nodeIds) {
    const node = nodeById.get(nodeId);
    if (!node || node.kind === 'intermediate_buffer') continue;
    if (!node?.recipeId) continue;
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;
    const primaryIdx = primaryOutputIndex(asSolverNode(node), recipe);
    const theoretical =
      flowResult.nodePortOutputRates[nodeId]?.[`out_${primaryIdx}`] ?? R.zero;
    if (theoretical.compare(FLOW_EPS_R) > 0) return true;
  }
  return false;
}

function computeCatalystImbalances(
  scc: CycleComponent,
  nodeById: Map<string, CycleAnalysisNode>,
  recipes: Map<string, Recipe>,
  flowResult: FlowResult,
): CycleAnalysisResult['catalystImbalances'] {
  const nodeIdSet = new Set(scc.nodeIds);
  const catalystProducts = new Set<string>();

  for (const nodeId of scc.nodeIds) {
    const node = nodeById.get(nodeId);
    if (!node || node.kind !== 'machine') continue;
    if (!node?.recipeId) continue;
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;
    for (const flow of [...recipe.inputs, ...recipe.outputs]) {
      if (flow.chance !== undefined && flow.chance > 0 && flow.chance < 10_000) {
        catalystProducts.add(productKey(flow));
      }
    }
  }

  const out: CycleAnalysisResult['catalystImbalances'] = [];
  for (const productId of catalystProducts) {
    let produce = R.zero;
    let consume = R.zero;

    for (const nodeId of scc.nodeIds) {
      const node = nodeById.get(nodeId);
      if (!node || node.kind !== 'machine') continue;
      if (!node?.recipeId) continue;
    const recipe = recipes.get(node.recipeId);
      if (!recipe) continue;
      const primaryIdx = primaryOutputIndex(asSolverNode(node), recipe);
      const primaryRate = theoreticalPrimaryRate(node, recipe, flowResult);
      if (primaryRate.compare(R.zero) <= 0) continue;

      for (let i = 0; i < recipe.inputs.length; i++) {
        if (productKey(recipe.inputs[i]!) !== productId) continue;
        consume = consume.add(
          portInputDemandRate(recipe, i, primaryRate, primaryIdx),
        );
      }

      const machineCount = R.from(flowResult.nodeMachineCounts[nodeId] ?? node.machineCount ?? 1);
      for (let i = 0; i < recipe.outputs.length; i++) {
        if (productKey(recipe.outputs[i]!) !== productId) continue;
        produce = produce.add(
          perMachineOutputRateAtIndex(recipe, i, asSolverNode(node)).mul(machineCount),
        );
      }
    }

    if (produce.compare(R.zero) <= 0 && consume.compare(R.zero) <= 0) continue;
    const ratio =
      produce.compare(R.zero) > 0
        ? consume.div(produce).toNumber()
        : Number.POSITIVE_INFINITY;
    if (Math.abs(ratio - 1) > CATALYST_RATIO_EPS) {
      out.push({
        sccIndex: scc.index,
        productId,
        ratio,
        nodeIds: [...nodeIdSet],
      });
    }
  }

  return out;
}

export function analyzeCycles(
  nodes: readonly CycleAnalysisNode[],
  edges: readonly SchemeEdge[],
  pack: PackData,
  flowResult: FlowResult,
  _tags: TagIndex,
): CycleAnalysisResult {
  const recipes = new Map(pack.recipes.map((r) => [r.id, r]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const components = findCycleComponents(nodes, edges);

  const balances: CycleProductBalance[] = [];
  const notRunning: CycleAnalysisResult['notRunning'] = [];
  const catalystImbalances: CycleAnalysisResult['catalystImbalances'] = [];

  for (const scc of components) {
    balances.push(...computeProductBalances(scc, nodeById, recipes, flowResult));

    const internalFlow = sccInternalFlowSum(scc, edges, flowResult.edgeFlows);
    if (
      internalFlow.compare(FLOW_EPS_R) <= 0 &&
      sccHasTheoreticalActivity(scc, nodeById, recipes, flowResult)
    ) {
      notRunning.push({ sccIndex: scc.index, nodeIds: scc.nodeIds });
    }

    catalystImbalances.push(
      ...computeCatalystImbalances(scc, nodeById, recipes, flowResult),
    );
  }

  return { components, balances, notRunning, catalystImbalances };
}

export function isBalancedNet(net: Rational): boolean {
  return rationalAbs(net).compare(BALANCE_EPS_R) <= 0;
}

export { BALANCE_EPS_R as BALANCE_EPS, CATALYST_RATIO_EPS };
