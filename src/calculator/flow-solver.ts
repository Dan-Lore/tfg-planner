import type { PackData, Recipe } from '@/data/types';
import type { VoltageTier } from '@/calculator/gt-voltage';
import { effectiveDurationTicks } from '@/calculator/energy';
import { Rational, R } from './rational';
import { ceilMachineCount, idealMachineCount } from './rounding';
import { buildTagIndex } from '@/lib/tag-index';
import { recipeInputMatchesProduct } from '@/lib/flow-match';
import { normalizePortId, parsePortId } from '@/canvas/ports';
import { chanceRateMultiplier } from '@/lib/flow-chance';
import {
  assignStartBufferInitialFlows,
  buildBufferNodeLoad,
  buildBufferPortOutputRates,
  buildBufferSurplus,
  buildStartBufferTheoreticalRates,
  collectBufferInflows,
  computeIntermediateBufferEffectiveOut,
  computeStartBufferEffectiveOut,
  computeDownstreamDemand,
  isSchemeBufferNode,
  isSchemeEndBuffer,
  isSchemeIntermediateBuffer,
  isSchemeStartBuffer,
  processIntermediateBufferIteration,
  processStartBufferIteration,
  resolveBufferTargetPort,
} from '@/calculator/buffer-solver';

export const TICKS_PER_SECOND = 20;

export type SchemeNodeKind =
  | 'machine'
  | 'start_buffer'
  | 'intermediate_buffer'
  | 'end_buffer';

export interface SchemeNode {
  id: string;
  kind?: SchemeNodeKind;
  machineId: string;
  recipeId: string;
  machineCount: number;
  overclock: number;
  parallel: number;
  voltageTier: VoltageTier;
  itemId?: string;
  fluidId?: string;
  capacity?: number;
  supplyMode?: 'rate' | 'stock';
  supplyRate?: number;
  initialStock?: number;
  autoSupplyRate?: boolean;
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
  /** Output port recipe load 0…1: sent / theoretical produced. */
  nodePortOutRecipeLoad: Record<string, Record<string, Rational>>;
  /** Output port consumer load 0…1: min(1, sent / downstream demand). */
  nodePortOutConsumerLoad: Record<string, Record<string, Rational>>;
  /** Downstream demand per output port (sum over target input ports). */
  nodePortDownstreamDemand: Record<string, Record<string, Rational>>;
  /** Output rate per port at current load (input-limited, before output coupling). */
  nodeInputLimitedPortOutputRates: Record<string, Record<string, Rational>>;
  /** Effective output rate per port after input/output scaling. */
  nodeEffectivePortOutputRates: Record<string, Record<string, Rational>>;
  /** Output port capacity load 0…1: sent / (theoretical * maxLoad). */
  nodePortOutCapacityLoad: Record<string, Record<string, Rational>>;
  /** @deprecated Use nodePortOutRecipeLoad */
  nodePortOutLoad: Record<string, Record<string, Rational>>;
  /** Max load 0…1: min connected input loads (input ceiling). */
  nodeMaxLoad: Record<string, Rational>;
  /** Current load 0…1: min connected output capacity loads. */
  nodeCurrentLoad: Record<string, Rational>;
  /** @deprecated Use nodeCurrentLoad */
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

function collectInflowsByPort(
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

interface OutputScaleParams {
  nodeId: string;
  allEdges: SchemeEdge[];
  edgeFlows: Record<string, Rational>;
  nodeEdges: SchemeEdge[];
  nodePortOutputRates: Record<string, Record<string, Rational>>;
  nodeById: Map<string, SchemeNode>;
  recipes: Map<string, Recipe>;
  tags: ReturnType<typeof buildTagIndex>;
  connectedOutPorts: Set<string>;
}

function remainingTargetPortDemand(
  targetId: string,
  targetPort: string,
  targetRecipe: Recipe,
  targetTheoreticalPrimary: Rational,
  allEdges: SchemeEdge[],
  edgeFlows: Record<string, Rational>,
  tags: ReturnType<typeof buildTagIndex>,
  excludeSourceNodeId: string,
): Rational {
  const portIndex = Number.parseInt(targetPort.slice(3), 10);
  const targetDemand = portInputDemandRate(
    targetRecipe,
    portIndex,
    targetTheoreticalPrimary,
  );

  let otherFlow = R.zero;
  for (const edge of allEdges) {
    if (edge.target !== targetId) continue;
    const edgeTargetPort = resolveTargetInputPort(edge, targetRecipe, tags);
    if (edgeTargetPort !== targetPort) continue;
    if (edge.source === excludeSourceNodeId) continue;
    otherFlow = otherFlow.add(edgeFlows[edge.id] ?? R.zero);
  }

  let remaining = targetDemand.sub(otherFlow);
  if (remaining.compare(R.zero) < 0) remaining = R.zero;
  return remaining;
}

function computeOutputLimitedScale(
  recipe: Recipe,
  theoreticalPortRates: Record<string, Rational>,
  params: OutputScaleParams,
): Rational {
  let minScale = R.from(1);
  const {
    nodeId,
    allEdges,
    edgeFlows,
    nodeEdges,
    nodePortOutputRates,
    nodeById,
    recipes,
    tags,
    connectedOutPorts,
  } = params;

  const byPort = new Map<string, SchemeEdge[]>();
  for (const edge of nodeEdges) {
    const portId = resolveSourceOutputPort(edge, recipe);
    if (!portId || !connectedOutPorts.has(portId)) continue;
    if (!byPort.has(portId)) byPort.set(portId, []);
    byPort.get(portId)!.push(edge);
  }

  for (const [portId, portEdges] of byPort) {
    const theoretical = theoreticalPortRates[portId] ?? R.zero;
    if (theoretical.compare(R.zero) <= 0) continue;

    const externalPortEdges = portEdges.filter((e) => e.source !== e.target);
    if (externalPortEdges.length === 0) continue;

    const byTargetPort = new Map<string, SchemeEdge[]>();
    for (const edge of externalPortEdges) {
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

      const targetTheoretical = nodePortOutputRates[targetId]?.['out_0'] ?? R.zero;
      const remainingDemand = remainingTargetPortDemand(
        targetId,
        targetPort,
        targetRecipe,
        targetTheoretical,
        allEdges,
        edgeFlows,
        tags,
        nodeId,
      );

      const groupShareAtScale1 = theoretical
        .mul(R.from(groupEdges.length))
        .div(R.from(externalPortEdges.length));

      if (groupShareAtScale1.compare(R.zero) <= 0) continue;

      let portScale = remainingDemand.div(groupShareAtScale1);
      if (portScale.compare(R.from(1)) > 0) portScale = R.from(1);
      if (portScale.compare(minScale) < 0) minScale = portScale;
    }
  }

  return minScale;
}

function computePortDownstreamDemandByOutputPort(
  recipe: Recipe,
  nodeEdges: SchemeEdge[],
  nodePortOutputRates: Record<string, Record<string, Rational>>,
  nodeById: Map<string, SchemeNode>,
  recipes: Map<string, Recipe>,
  tags: ReturnType<typeof buildTagIndex>,
  connectedOutPorts: Set<string>,
): Record<string, Rational> {
  const demands: Record<string, Rational> = {};

  const byPort = new Map<string, SchemeEdge[]>();
  for (const edge of nodeEdges) {
    const portId = resolveSourceOutputPort(edge, recipe);
    if (!portId || !connectedOutPorts.has(portId)) continue;
    if (!byPort.has(portId)) byPort.set(portId, []);
    byPort.get(portId)!.push(edge);
  }

  for (const [portId, portEdges] of byPort) {
    const externalPortEdges = portEdges.filter((e) => e.source !== e.target);
    if (externalPortEdges.length === 0) continue;

    const seenTargets = new Set<string>();
    let totalDemand = R.zero;

    for (const edge of externalPortEdges) {
      const targetNode = nodeById.get(edge.target);
      const targetRecipe = targetNode ? recipes.get(targetNode.recipeId) : undefined;
      if (!targetNode || !targetRecipe) continue;
      const targetPort = resolveTargetInputPort(edge, targetRecipe, tags);
      if (!targetPort) continue;

      const key = `${edge.target}\0${targetPort}`;
      if (seenTargets.has(key)) continue;
      seenTargets.add(key);

      const portIndex = Number.parseInt(targetPort.slice(3), 10);
      const targetTheoretical = nodePortOutputRates[targetNode.id]?.['out_0'] ?? R.zero;
      totalDemand = totalDemand.add(
        portInputDemandRate(targetRecipe, portIndex, targetTheoretical),
      );
    }

    if (totalDemand.compare(R.zero) > 0) {
      demands[portId] = totalDemand;
    }
  }

  return demands;
}

function buildOutputScaleParams(
  nodeId: string,
  allEdges: SchemeEdge[],
  edgeFlows: Record<string, Rational>,
  outgoing: Map<string, SchemeEdge[]>,
  nodePortOutputRates: Record<string, Record<string, Rational>>,
  nodeById: Map<string, SchemeNode>,
  recipes: Map<string, Recipe>,
  tags: ReturnType<typeof buildTagIndex>,
  connectedOutPortsByNode: Record<string, Set<string>>,
): OutputScaleParams {
  return {
    nodeId,
    allEdges,
    edgeFlows,
    nodeEdges: outgoing.get(nodeId) ?? [],
    nodePortOutputRates,
    nodeById,
    recipes,
    tags,
    connectedOutPorts: connectedOutPortsByNode[nodeId] ?? new Set(),
  };
}

function computeEffectivePortRates(
  recipe: Recipe,
  theoreticalPortRates: Record<string, Rational>,
  inflowsByPort: Record<string, Rational>,
  connectedInPorts: Set<string>,
  outputScaleParams?: OutputScaleParams,
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

  let machineScale =
    theoreticalPrimary.compare(R.zero) > 0
      ? effectivePrimary.div(theoreticalPrimary)
      : R.zero;

  if (outputScaleParams) {
    const outputScale = computeOutputLimitedScale(
      recipe,
      theoreticalPortRates,
      outputScaleParams,
    );
    if (outputScale.compare(machineScale) < 0) {
      machineScale = outputScale;
    }
  }

  for (let i = 0; i < recipe.outputs.length; i++) {
    const portId = `out_${i}`;
    const theoretical = theoreticalPortRates[portId] ?? R.zero;
    effective[portId] = theoretical.mul(machineScale);
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

    let totalShare = R.zero;
    for (const edge of externalEdges) {
      totalShare = totalShare.add(edgeShares.get(edge.id) ?? R.zero);
    }

    const targetTheoretical = nodePortOutputRates[targetId]?.['out_0'] ?? R.zero;
    const remainingDemand = remainingTargetPortDemand(
      targetId,
      targetPort,
      targetRecipe,
      targetTheoretical,
      allEdges,
      edgeFlows,
      tags,
      nodeId,
    );

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
  edges: SchemeEdge[],
  nodePortOutputRates: Record<string, Record<string, Rational>>,
  incoming: Map<string, SchemeEdge[]>,
  outgoing: Map<string, SchemeEdge[]>,
  nodeById: Map<string, SchemeNode>,
  recipes: Map<string, Recipe>,
  tags: ReturnType<typeof buildTagIndex>,
  nodeOrder: string[],
  connectedInPortsByNode: Record<string, Set<string>>,
  connectedOutPortsByNode: Record<string, Set<string>>,
): Record<string, Rational> {
  const edgeFlows: Record<string, Rational> = {};
  for (const edge of edges) {
    edgeFlows[edge.id] = R.zero;
  }

  for (const nodeId of nodeOrder) {
    const node = nodeById.get(nodeId);
    if (!node) continue;

    if (isSchemeStartBuffer(node)) {
      assignStartBufferInitialFlows(
        outgoing.get(nodeId) ?? [],
        node,
        edgeFlows,
      );
      continue;
    }
    if (isSchemeBufferNode(node)) continue;

    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;
    const theoretical = nodePortOutputRates[nodeId] ?? {};
    const inflows = collectInflowsByPort(
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
      buildOutputScaleParams(
        nodeId,
        edges,
        edgeFlows,
        outgoing,
        nodePortOutputRates,
        nodeById,
        recipes,
        tags,
        connectedOutPortsByNode,
      ),
    );
    assignOutgoingFromEffectiveRates(
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
  }

  for (let iter = 0; iter < MAX_FLOW_ITERATIONS; iter++) {
    let maxDelta = 0;
    for (const nodeId of nodeOrder) {
      const node = nodeById.get(nodeId);
      if (!node) continue;

      if (isSchemeStartBuffer(node)) {
        const delta = processStartBufferIteration(
          nodeId,
          node,
          outgoing.get(nodeId) ?? [],
          edges,
          edgeFlows,
          nodeById,
          recipes,
          tags,
          nodePortOutputRates,
        );
        if (delta > maxDelta) maxDelta = delta;
        continue;
      }

      if (isSchemeIntermediateBuffer(node)) {
        const delta = processIntermediateBufferIteration(
          nodeId,
          node,
          incoming.get(nodeId) ?? [],
          outgoing.get(nodeId) ?? [],
          edges,
          edgeFlows,
          nodeById,
          recipes,
          tags,
          nodePortOutputRates,
        );
        if (delta > maxDelta) maxDelta = delta;
        continue;
      }

      if (isSchemeEndBuffer(node)) continue;

      const recipe = recipes.get(node.recipeId);
      if (!recipe) continue;

      const theoretical = nodePortOutputRates[nodeId] ?? {};
      const inflows = collectInflowsByPort(
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
        buildOutputScaleParams(
          nodeId,
          edges,
          edgeFlows,
          outgoing,
          nodePortOutputRates,
          nodeById,
          recipes,
          tags,
          connectedOutPortsByNode,
        ),
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

function computeNodePortOutRecipeLoad(
  nodes: SchemeNode[],
  nodePortOutputRates: Record<string, Record<string, Rational>>,
  outgoing: Map<string, SchemeEdge[]>,
  edgeFlows: Record<string, Rational>,
  connectedOutPortsByNode: Record<string, Set<string>>,
  recipes: Map<string, Recipe>,
): Record<string, Record<string, Rational>> {
  const nodePortOutRecipeLoad: Record<string, Record<string, Rational>> = {};

  for (const node of nodes) {
    const recipe = recipes.get(node.recipeId);
    if (!recipe || recipe.outputs.length === 0) continue;
    nodePortOutRecipeLoad[node.id] = {};

    for (let i = 0; i < recipe.outputs.length; i++) {
      const portId = `out_${i}`;
      const produced = nodePortOutputRates[node.id]?.[portId] ?? R.zero;
      if (produced.compare(R.zero) <= 0) continue;

      const connected = connectedOutPortsByNode[node.id]?.has(portId) ?? false;
      if (!connected) continue;

      let sent = R.zero;
      for (const edge of outgoing.get(node.id) ?? []) {
        const edgePort = resolveSourceOutputPort(edge, recipe);
        if (edgePort !== portId) continue;
        sent = sent.add(edgeFlows[edge.id] ?? R.zero);
      }
      nodePortOutRecipeLoad[node.id][portId] = capLoadFraction(sent, produced);
    }
  }

  return nodePortOutRecipeLoad;
}

function computeNodePortOutConsumerLoad(
  nodes: SchemeNode[],
  outgoing: Map<string, SchemeEdge[]>,
  edgeFlows: Record<string, Rational>,
  portDownstreamDemand: Record<string, Record<string, Rational>>,
  connectedOutPortsByNode: Record<string, Set<string>>,
  recipes: Map<string, Recipe>,
): Record<string, Record<string, Rational>> {
  const nodePortOutConsumerLoad: Record<string, Record<string, Rational>> = {};

  for (const node of nodes) {
    const recipe = recipes.get(node.recipeId);
    if (!recipe || recipe.outputs.length === 0) continue;
    nodePortOutConsumerLoad[node.id] = {};

    for (let i = 0; i < recipe.outputs.length; i++) {
      const portId = `out_${i}`;
      const demand = portDownstreamDemand[node.id]?.[portId] ?? R.zero;
      if (demand.compare(R.zero) <= 0) continue;

      const connected = connectedOutPortsByNode[node.id]?.has(portId) ?? false;
      if (!connected) continue;

      let sent = R.zero;
      for (const edge of outgoing.get(node.id) ?? []) {
        const edgePort = resolveSourceOutputPort(edge, recipe);
        if (edgePort !== portId) continue;
        sent = sent.add(edgeFlows[edge.id] ?? R.zero);
      }
      nodePortOutConsumerLoad[node.id][portId] = capLoadFraction(sent, demand);
    }
  }

  return nodePortOutConsumerLoad;
}

function computeNodeMaxLoad(
  nodes: SchemeNode[],
  nodePortOutputRates: Record<string, Record<string, Rational>>,
  effectivePortRatesByNode: Record<string, Record<string, Rational>>,
  inflowsByNode: Record<string, Record<string, Rational>>,
  connectedInPortsByNode: Record<string, Set<string>>,
  recipes: Map<string, Recipe>,
): Record<string, Rational> {
  const nodeMaxLoad: Record<string, Rational> = {};

  for (const node of nodes) {
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;

    if (recipe.inputs.length === 0) {
      nodeMaxLoad[node.id] = R.from(1);
      continue;
    }

    const theoreticalPrimary = nodePortOutputRates[node.id]?.['out_0'] ?? R.zero;
    const effectivePrimary = effectivePortRatesByNode[node.id]?.['out_0'] ?? R.zero;

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

    nodeMaxLoad[node.id] = hasConnectedInput ? minConnectedInLoad : inputLimited;
  }

  return nodeMaxLoad;
}

function computeNodePortOutCapacityLoad(
  nodes: SchemeNode[],
  nodePortOutputRates: Record<string, Record<string, Rational>>,
  nodeMaxLoad: Record<string, Rational>,
  outgoing: Map<string, SchemeEdge[]>,
  edgeFlows: Record<string, Rational>,
  connectedOutPortsByNode: Record<string, Set<string>>,
  recipes: Map<string, Recipe>,
): Record<string, Record<string, Rational>> {
  const nodePortOutCapacityLoad: Record<string, Record<string, Rational>> = {};

  for (const node of nodes) {
    const recipe = recipes.get(node.recipeId);
    if (!recipe || recipe.outputs.length === 0) continue;
    nodePortOutCapacityLoad[node.id] = {};

    const maxLoad = nodeMaxLoad[node.id] ?? R.from(1);

    for (let i = 0; i < recipe.outputs.length; i++) {
      const portId = `out_${i}`;
      const produced = nodePortOutputRates[node.id]?.[portId] ?? R.zero;
      if (produced.compare(R.zero) <= 0) continue;

      const connected = connectedOutPortsByNode[node.id]?.has(portId) ?? false;
      if (!connected) continue;

      const maxPortOutput = produced.mul(maxLoad);
      if (maxPortOutput.compare(R.zero) <= 0) {
        nodePortOutCapacityLoad[node.id][portId] = R.zero;
        continue;
      }

      let sent = R.zero;
      for (const edge of outgoing.get(node.id) ?? []) {
        const edgePort = resolveSourceOutputPort(edge, recipe);
        if (edgePort !== portId) continue;
        sent = sent.add(edgeFlows[edge.id] ?? R.zero);
      }
      nodePortOutCapacityLoad[node.id][portId] = capLoadFraction(sent, maxPortOutput);
    }
  }

  return nodePortOutCapacityLoad;
}

function computeNodeCurrentLoad(
  nodes: SchemeNode[],
  nodePortOutputRates: Record<string, Record<string, Rational>>,
  nodeMaxLoad: Record<string, Rational>,
  nodePortOutCapacityLoad: Record<string, Record<string, Rational>>,
  connectedOutPortsByNode: Record<string, Set<string>>,
  recipes: Map<string, Recipe>,
): Record<string, Rational> {
  const nodeCurrentLoad: Record<string, Rational> = {};

  for (const node of nodes) {
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;

    let minCapacity = R.from(1);
    let hasConnectedOutput = false;

    for (let i = 0; i < recipe.outputs.length; i++) {
      const portId = `out_${i}`;
      const produced = nodePortOutputRates[node.id]?.[portId] ?? R.zero;
      if (produced.compare(R.zero) <= 0) continue;

      const connected = connectedOutPortsByNode[node.id]?.has(portId) ?? false;
      if (!connected) continue;

      hasConnectedOutput = true;
      const capLoad = nodePortOutCapacityLoad[node.id]?.[portId] ?? R.from(1);
      if (capLoad.compare(minCapacity) < 0) minCapacity = capLoad;
    }

    nodeCurrentLoad[node.id] = hasConnectedOutput
      ? minCapacity
      : (nodeMaxLoad[node.id] ?? R.from(1));
  }

  return nodeCurrentLoad;
}

function computeSurplusFromEffective(
  nodes: SchemeNode[],
  outgoing: Map<string, SchemeEdge[]>,
  inputLimitedPortRatesByNode: Record<string, Record<string, Rational>>,
  portDownstreamDemand: Record<string, Record<string, Rational>>,
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
      const produced = inputLimitedPortRatesByNode[node.id]?.[portId] ?? R.zero;
      const demand = portDownstreamDemand[node.id]?.[portId] ?? R.zero;

      let sent = R.zero;
      for (const edge of outgoing.get(node.id) ?? []) {
        const edgePort = resolveSourceOutputPort(edge, recipe);
        if (edgePort !== portId) continue;
        sent = sent.add(edgeFlows[edge.id] ?? R.zero);
      }

      if (demand.compare(R.zero) <= 0) continue;
      const consumersSatisfied = capLoadFraction(sent, demand).compare(R.from(1)) >= 0;
      if (!consumersSatisfied) continue;

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
    if (isSchemeBufferNode(node)) {
      for (const edge of incoming.get(node.id) ?? []) {
        if (resolveBufferTargetPort(edge)) connected[node.id]!.add('in_0');
      }
      continue;
    }
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;
    for (const edge of incoming.get(node.id) ?? []) {
      const portId = resolveTargetInputPort(edge, recipe, tags);
      if (portId) connected[node.id]!.add(portId);
    }
  }
  return connected;
}

function buildConnectedOutPorts(
  nodes: SchemeNode[],
  outgoing: Map<string, SchemeEdge[]>,
  recipes: Map<string, Recipe>,
): Record<string, Set<string>> {
  const connected: Record<string, Set<string>> = {};
  for (const node of nodes) {
    connected[node.id] = new Set();
    if (isSchemeBufferNode(node)) {
      if (isSchemeStartBuffer(node) || isSchemeIntermediateBuffer(node)) {
        for (const edge of outgoing.get(node.id) ?? []) {
          if (edge.source === node.id) connected[node.id]!.add('out_0');
        }
      }
      continue;
    }
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;
    for (const edge of outgoing.get(node.id) ?? []) {
      const portId = resolveSourceOutputPort(edge, recipe);
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
    if (!node || isSchemeBufferNode(node)) continue;
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
    if (!node || isSchemeBufferNode(node)) continue;
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
    if (isSchemeStartBuffer(node)) {
      nodePortOutputRates[node.id] = buildStartBufferTheoreticalRates(node);
      const key = node.itemId ?? node.fluidId ?? '';
      if (key) nodeOutputRates[node.id] = { [key]: nodePortOutputRates[node.id]!.out_0! };
      continue;
    }
    if (isSchemeBufferNode(node)) {
      nodePortOutputRates[node.id] = {};
      nodeOutputRates[node.id] = {};
      continue;
    }
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
        if (!down || isSchemeBufferNode(down)) continue;
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
    if (isSchemeStartBuffer(node)) {
      nodePortOutputRates[node.id] = buildStartBufferTheoreticalRates(node);
      const key = node.itemId ?? node.fluidId ?? '';
      if (key) nodeOutputRates[node.id] = { [key]: nodePortOutputRates[node.id]!.out_0! };
      continue;
    }
    if (isSchemeBufferNode(node)) {
      nodePortOutputRates[node.id] = {};
      nodeOutputRates[node.id] = {};
      continue;
    }
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
  const connectedOutPortsByNode = buildConnectedOutPorts(
    input.nodes,
    outgoing,
    recipes,
  );

  const convergedEdgeFlows = computeConvergedFlows(
    input.edges,
    nodePortOutputRates,
    incoming,
    outgoing,
    nodeById,
    recipes,
    tags,
    order,
    connectedInPortsByNode,
    connectedOutPortsByNode,
  );

  const effectivePortRatesByNode: Record<string, Record<string, Rational>> = {};
  const inputLimitedPortRatesByNode: Record<string, Record<string, Rational>> = {};
  const inflowsByNode: Record<string, Record<string, Rational>> = {};
  for (const node of input.nodes) {
    if (isSchemeBufferNode(node)) {
      const inflow = collectBufferInflows(
        incoming.get(node.id) ?? [],
        convergedEdgeFlows,
      );
      let outflow = R.zero;
      for (const edge of outgoing.get(node.id) ?? []) {
        outflow = outflow.add(convergedEdgeFlows[edge.id] ?? R.zero);
      }
      inflowsByNode[node.id] = { in_0: inflow };

      if (isSchemeStartBuffer(node)) {
        const demand = computeDownstreamDemand(
          node.id,
          outgoing.get(node.id) ?? [],
          input.edges,
          convergedEdgeFlows,
          nodeById,
          recipes,
          tags,
          nodePortOutputRates,
        );
        const effectiveOut = computeStartBufferEffectiveOut(node, demand);
        effectivePortRatesByNode[node.id] = buildBufferPortOutputRates(node, effectiveOut);
        inputLimitedPortRatesByNode[node.id] = effectivePortRatesByNode[node.id];
        nodePortOutputRates[node.id] = effectivePortRatesByNode[node.id];
        const key = node.itemId ?? node.fluidId ?? '';
        if (key) nodeOutputRates[node.id] = { [key]: effectiveOut };
      } else if (isSchemeIntermediateBuffer(node)) {
        const demand = computeDownstreamDemand(
          node.id,
          outgoing.get(node.id) ?? [],
          input.edges,
          convergedEdgeFlows,
          nodeById,
          recipes,
          tags,
          nodePortOutputRates,
        );
        const effectiveOut = computeIntermediateBufferEffectiveOut(node, inflow, demand);
        effectivePortRatesByNode[node.id] = buildBufferPortOutputRates(node, effectiveOut);
        inputLimitedPortRatesByNode[node.id] = effectivePortRatesByNode[node.id];
        nodePortOutputRates[node.id] = effectivePortRatesByNode[node.id];
        const key = node.itemId ?? node.fluidId ?? '';
        if (key) nodeOutputRates[node.id] = { [key]: effectiveOut };
      } else {
        effectivePortRatesByNode[node.id] = {};
        inputLimitedPortRatesByNode[node.id] = {};
      }
      continue;
    }

    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;
    const theoretical = nodePortOutputRates[node.id] ?? {};
    const inflows = collectInflowsByPort(
      recipe,
      incoming.get(node.id) ?? [],
      convergedEdgeFlows,
      tags,
    );
    inflowsByNode[node.id] = inflows;
    inputLimitedPortRatesByNode[node.id] = computeEffectivePortRates(
      recipe,
      theoretical,
      inflows,
      connectedInPortsByNode[node.id] ?? new Set(),
    );
    effectivePortRatesByNode[node.id] = computeEffectivePortRates(
      recipe,
      theoretical,
      inflows,
      connectedInPortsByNode[node.id] ?? new Set(),
      buildOutputScaleParams(
        node.id,
        input.edges,
        convergedEdgeFlows,
        outgoing,
        nodePortOutputRates,
        nodeById,
        recipes,
        tags,
        connectedOutPortsByNode,
      ),
    );
  }

  const edgeTargetFlows: Record<string, Rational> = {};
  const nodeInputRates: Record<string, Record<string, Rational>> = {};
  const nodePortDeficit = computeNodePortDeficit(
    input.nodes.filter((n) => !isSchemeBufferNode(n)),
    nodePortOutputRates,
    effectivePortRatesByNode,
    inflowsByNode,
    connectedInPortsByNode,
    recipes,
  );
  const machineNodes = input.nodes.filter((n) => !isSchemeBufferNode(n));
  const nodePortInLoad = computeNodePortInLoad(
    machineNodes,
    nodePortOutputRates,
    inflowsByNode,
    connectedInPortsByNode,
    recipes,
  );
  const nodeMaxLoad = computeNodeMaxLoad(
    machineNodes,
    nodePortOutputRates,
    effectivePortRatesByNode,
    inflowsByNode,
    connectedInPortsByNode,
    recipes,
  );
  const nodePortOutRecipeLoad = computeNodePortOutRecipeLoad(
    machineNodes,
    nodePortOutputRates,
    outgoing,
    convergedEdgeFlows,
    connectedOutPortsByNode,
    recipes,
  );
  const nodePortDownstreamDemand: Record<string, Record<string, Rational>> = {};
  for (const node of machineNodes) {
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;
    nodePortDownstreamDemand[node.id] = computePortDownstreamDemandByOutputPort(
      recipe,
      outgoing.get(node.id) ?? [],
      nodePortOutputRates,
      nodeById,
      recipes,
      tags,
      connectedOutPortsByNode[node.id] ?? new Set(),
    );
  }
  const nodePortOutConsumerLoad = computeNodePortOutConsumerLoad(
    machineNodes,
    outgoing,
    convergedEdgeFlows,
    nodePortDownstreamDemand,
    connectedOutPortsByNode,
    recipes,
  );
  const nodePortOutCapacityLoad = computeNodePortOutCapacityLoad(
    machineNodes,
    nodePortOutputRates,
    nodeMaxLoad,
    outgoing,
    convergedEdgeFlows,
    connectedOutPortsByNode,
    recipes,
  );
  const nodeCurrentLoad = computeNodeCurrentLoad(
    machineNodes,
    nodePortOutputRates,
    nodeMaxLoad,
    nodePortOutCapacityLoad,
    connectedOutPortsByNode,
    recipes,
  );
  const nodePortOutLoad = nodePortOutRecipeLoad;
  const nodeLoad = nodeCurrentLoad;
  const nodeSurplus = computeSurplusFromEffective(
    input.nodes.filter((n) => !isSchemeBufferNode(n)),
    outgoing,
    inputLimitedPortRatesByNode,
    nodePortDownstreamDemand,
    convergedEdgeFlows,
    recipes,
  );

  for (const node of input.nodes) {
    if (!isSchemeBufferNode(node)) continue;
    const inflow = inflowsByNode[node.id]?.in_0 ?? R.zero;
    let outflow = R.zero;
    for (const edge of outgoing.get(node.id) ?? []) {
      outflow = outflow.add(convergedEdgeFlows[edge.id] ?? R.zero);
    }
    const bufferLoad = buildBufferNodeLoad(node, inflow, outflow);
    nodeCurrentLoad[node.id] = bufferLoad;
    nodeLoad[node.id] = bufferLoad;
    nodeMaxLoad[node.id] = R.from(1);
    const key = node.itemId ?? node.fluidId ?? '';
    if (key) {
      nodeSurplus[node.id] = buildBufferSurplus(node, inflow, outflow);
      if (isSchemeEndBuffer(node)) {
        nodeInputRates[node.id] = { [key]: inflow };
      } else if (isSchemeIntermediateBuffer(node)) {
        nodeInputRates[node.id] = { [key]: inflow };
        nodePortInLoad[node.id] = {
          in_0: inflow.compare(R.zero) > 0 ? R.from(1) : R.zero,
        };
        nodePortOutLoad[node.id] = {
          out_0: outflow.compare(R.zero) > 0 && inflow.compare(R.zero) > 0
            ? outflow.div(inflow)
            : R.zero,
        };
        nodePortOutRecipeLoad[node.id] = { ...nodePortOutLoad[node.id] };
        nodePortOutConsumerLoad[node.id] = { ...nodePortOutLoad[node.id] };
        nodePortOutCapacityLoad[node.id] = { ...nodePortOutLoad[node.id] };
      } else if (isSchemeStartBuffer(node)) {
        nodePortOutLoad[node.id] = {
          out_0: bufferLoad,
        };
        nodePortOutRecipeLoad[node.id] = { ...nodePortOutLoad[node.id] };
        nodePortOutConsumerLoad[node.id] = { ...nodePortOutLoad[node.id] };
        nodePortOutCapacityLoad[node.id] = { ...nodePortOutLoad[node.id] };
      }
    }
  }

  for (const node of input.nodes) {
    if (isSchemeBufferNode(node)) continue;
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
    nodePortOutRecipeLoad,
    nodePortOutConsumerLoad,
    nodePortDownstreamDemand,
    nodeInputLimitedPortOutputRates: inputLimitedPortRatesByNode,
    nodeEffectivePortOutputRates: effectivePortRatesByNode,
    nodePortOutCapacityLoad,
    nodePortOutLoad,
    nodeMaxLoad,
    nodeCurrentLoad,
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
