import type { Recipe } from '@/data/types';
import type { TagIndex } from '@/lib/tag-index';
import { primaryOutputIndex } from '@/lib/primary-output';
import { R, type Rational } from '@/calculator/rational';
import {
  analyzeCycles,
  findCycleComponents,
  isBalancedNet,
  type CycleComponent,
} from '@/calculator/cycle-analysis';
import {
  BUFFER_HORIZON_SEC,
  configuredStartBufferCap,
  isSchemeIntermediateBuffer,
  isSchemeStartBuffer,
} from '@/calculator/buffer-solver';
import { portInputDemandRate, resolveTargetInputPort } from '@/calculator/port-resolution';
import type { PackData } from '@/data/types';
import type {
  CycleSeedInfo,
  FlowResult,
  SchemeEdge,
  SchemeNode,
} from '@/calculator/flow-solver-types';
import {
  catalystAttemptRate,
  computeCatalystReproductionPercent,
  computeCatalystSeedCapacity,
  findCatalystPortChancesInScc,
  resolveBufferMaintainAmount,
  resolveCycleSeedDisplayMode,
} from '@/lib/cycle-seed-metrics';

export interface CycleBootstrapPlan {
  pinnedFlows: Map<string, Rational>;
  bootstrapInflowByNodeId: Map<string, Rational>;
  seeds: {
    edge: SchemeEdge;
    sccIndex: number;
    seedFlow: Rational;
    theoreticalDemand: Rational;
    productId: string;
  }[];
}

function edgeProductKey(edge: SchemeEdge): string {
  return edge.itemId ?? edge.fluidId ?? '';
}

function bufferProductKey(node: SchemeNode): string {
  return node.itemId ?? node.fluidId ?? '';
}

/** Stock-based max bleed rate for intermediate buffer bootstrap. */
export function intermediateBufferBootstrapCap(node: SchemeNode): Rational {
  const stock = Math.max(node.initialStock ?? 0, node.capacity ?? 0);
  if (stock <= 0) return R.zero;
  return R.from(stock).div(R.from(BUFFER_HORIZON_SEC));
}

/** Primary seed edge: intermediate_buffer product feed into SCC, else start_buffer. */
export function findPrimaryCycleSeedEdge(
  scc: CycleComponent,
  nodes: readonly SchemeNode[],
  edges: readonly SchemeEdge[],
): SchemeEdge | null {
  const nodeIdSet = new Set(scc.nodeIds);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  for (const edge of edges) {
    if (!nodeIdSet.has(edge.target)) continue;
    const source = nodeById.get(edge.source);
    if (!source || !isSchemeIntermediateBuffer(source)) continue;
    const bufferKey = bufferProductKey(source);
    const edgeKey = edgeProductKey(edge);
    if (bufferKey && edgeKey === bufferKey) return edge;
  }

  for (const edge of edges) {
    if (!nodeIdSet.has(edge.target)) continue;
    const source = nodeById.get(edge.source);
    if (source && isSchemeStartBuffer(source)) return edge;
  }

  return null;
}

export function computeCycleSeedDemand(
  seedEdge: SchemeEdge,
  nodes: readonly SchemeNode[],
  recipes: Map<string, Recipe>,
  nodePortOutputRates: Record<string, Record<string, Rational>>,
  tags: TagIndex,
): Rational {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const target = nodeById.get(seedEdge.target);
  if (!target) return R.zero;

  const recipe = recipes.get(target.recipeId);
  if (!recipe) return R.zero;

  const targetPort = resolveTargetInputPort(seedEdge, recipe, tags);
  if (!targetPort) return R.zero;

  const portIndex = Number.parseInt(targetPort.slice(3), 10);
  const primaryIdx = primaryOutputIndex(target, recipe);
  const theoreticalPrimary =
    nodePortOutputRates[target.id]?.[`out_${primaryIdx}`] ?? R.zero;
  return portInputDemandRate(recipe, portIndex, theoreticalPrimary, primaryIdx);
}

export function computeCycleSeedFlow(
  seedEdge: SchemeEdge,
  nodes: readonly SchemeNode[],
  recipes: Map<string, Recipe>,
  nodePortOutputRates: Record<string, Record<string, Rational>>,
  tags: TagIndex,
): Rational {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const source = nodeById.get(seedEdge.source);
  if (!source) return R.zero;

  const demand = computeCycleSeedDemand(
    seedEdge,
    nodes,
    recipes,
    nodePortOutputRates,
    tags,
  );
  if (demand.compare(R.zero) <= 0) return R.zero;

  let cap = R.from(Number.MAX_SAFE_INTEGER);
  if (isSchemeIntermediateBuffer(source)) {
    cap = intermediateBufferBootstrapCap(source);
    if (cap.compare(R.zero) <= 0) {
      return demand;
    }
  } else if (isSchemeStartBuffer(source)) {
    cap = configuredStartBufferCap(source);
  }

  return demand.compare(cap) < 0 ? demand : cap;
}

export function buildCycleBootstrapPlan(
  nodes: readonly SchemeNode[],
  edges: readonly SchemeEdge[],
  recipes: Map<string, Recipe>,
  nodePortOutputRates: Record<string, Record<string, Rational>>,
  tags: TagIndex,
): CycleBootstrapPlan {
  const pinnedFlows = new Map<string, Rational>();
  const bootstrapInflowByNodeId = new Map<string, Rational>();
  const seeds: CycleBootstrapPlan['seeds'] = [];

  const components = findCycleComponents(nodes, edges);
  for (const scc of components) {
    const seedEdge = findPrimaryCycleSeedEdge(scc, nodes, edges);
    if (!seedEdge) continue;

    const theoreticalDemand = computeCycleSeedDemand(
      seedEdge,
      nodes,
      recipes,
      nodePortOutputRates,
      tags,
    );
    const seedFlow = computeCycleSeedFlow(
      seedEdge,
      nodes,
      recipes,
      nodePortOutputRates,
      tags,
    );
    if (seedFlow.compare(R.zero) <= 0) continue;

    const productId = edgeProductKey(seedEdge);
    pinnedFlows.set(seedEdge.id, seedFlow);
    seeds.push({
      edge: seedEdge,
      sccIndex: scc.index,
      seedFlow,
      theoreticalDemand,
      productId,
    });

    const source = nodes.find((n) => n.id === seedEdge.source);
    if (source && isSchemeIntermediateBuffer(source) && seedFlow.compare(R.zero) > 0) {
      bootstrapInflowByNodeId.set(source.id, seedFlow);
    }
  }

  return { pinnedFlows, bootstrapInflowByNodeId, seeds };
}

export function resolveCycleSeedMode(net: Rational): CycleSeedInfo['mode'] {
  if (isBalancedNet(net)) return 'stable';
  return net.compare(R.zero) < 0 ? 'deficit' : 'surplus';
}

function resolveCycleSeedModeFromExpected(
  reproductionPercent: number | undefined,
  expectedNetPerSecond: number,
): CycleSeedInfo['mode'] {
  const displayMode = resolveCycleSeedDisplayMode(reproductionPercent, expectedNetPerSecond);
  if (displayMode === 'self-sufficient') return 'stable';
  return displayMode;
}

export function buildCycleSeedResults(
  nodes: readonly SchemeNode[],
  edges: readonly SchemeEdge[],
  pack: PackData,
  flowResult: FlowResult,
  bootstrapSeeds: CycleBootstrapPlan['seeds'],
  tags: TagIndex,
): CycleSeedInfo[] {
  if (bootstrapSeeds.length === 0) return [];

  const analysis = analyzeCycles(nodes, edges, pack, flowResult, tags);
  const components = findCycleComponents(nodes, edges);
  const sccByIndex = new Map(components.map((scc) => [scc.index, scc]));
  const balanceBySccProduct = new Map<string, { net: Rational; produce: Rational; consume: Rational }>();
  for (const balance of analysis.balances) {
    balanceBySccProduct.set(`${balance.sccIndex}\0${balance.productId}`, {
      net: balance.net,
      produce: balance.produce,
      consume: balance.consume,
    });
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const recipes = new Map(pack.recipes.map((r) => [r.id, r]));

  return bootstrapSeeds.map(({ edge, sccIndex, productId, theoreticalDemand }) => {
    const seedFlow = flowResult.edgeFlows[edge.id] ?? R.zero;
    const theoreticalDemandPerSecond = theoreticalDemand.toNumber();
    const metrics =
      balanceBySccProduct.get(`${sccIndex}\0${productId}`) ?? {
        net: R.zero,
        produce: R.zero,
        consume: R.zero,
      };
    const producePerSecond = metrics.produce.toNumber();
    const consumePerSecond = metrics.consume.toNumber();
    const expectedNetPerSecond = producePerSecond - consumePerSecond;

    const scc = sccByIndex.get(sccIndex);
    const portChances = scc
      ? findCatalystPortChancesInScc(
          new Set(scc.nodeIds),
          productId,
          nodes,
          recipes,
        )
      : {};
    const consumerChance = portChances.consumerChance;
    const produceAttemptPerSecond = catalystAttemptRate(
      producePerSecond,
      portChances.producerChance ?? consumerChance,
    );
    const consumeAttemptPerSecond = catalystAttemptRate(
      consumePerSecond,
      consumerChance,
    );
    const reproductionPercent = computeCatalystReproductionPercent(
      produceAttemptPerSecond,
      consumeAttemptPerSecond,
    );
    const mode = resolveCycleSeedModeFromExpected(
      reproductionPercent,
      expectedNetPerSecond,
    );
    const netPerSecond = expectedNetPerSecond;
    const capacityResult = computeCatalystSeedCapacity({
      mode,
      expectedNetPerSecond,
      expectedConsumePerSecond: consumePerSecond,
      consumeAttemptPerSecond,
      consumerChance,
      theoreticalDemandPerSecond,
    });
    const source = nodeById.get(edge.source);
    return {
      edgeId: edge.id,
      sccIndex,
      seedFlowPerSecond: seedFlow.toNumber(),
      theoreticalDemandPerSecond,
      productId,
      netPerSecond,
      producePerSecond,
      consumePerSecond,
      produceAttemptPerSecond,
      consumeAttemptPerSecond,
      catalystChance: consumerChance,
      reproductionPercent,
      bufferMaintainAmount: mode === 'stable' ? resolveBufferMaintainAmount(source) : undefined,
      recommendedCapacity: capacityResult.capacity,
      recommendedCapacityDetail: capacityResult.detail,
      mode,
    };
  });
}

/** Seed edge id for UI focus — matches SCC index, optionally product id. */
export function findCycleSeedEdgeId(
  flowResult: Pick<FlowResult, 'cycleSeeds'>,
  sccIndex: number,
  productId?: string,
): string | undefined {
  const seeds = flowResult.cycleSeeds;
  if (!seeds?.length) return undefined;
  const inScc = seeds.filter((s) => s.sccIndex === sccIndex);
  if (inScc.length === 0) return undefined;
  if (productId) {
    const match = inScc.find((s) => s.productId === productId);
    if (match) return match.edgeId;
  }
  return inScc[0]!.edgeId;
}
