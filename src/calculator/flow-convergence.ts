import type { Recipe } from '@/data/types';
import type { TagIndex } from '@/lib/tag-index';
import { Rational, R } from '@/calculator/rational';
import {
  MAX_FLOW_ITERATIONS,
  type SchemeEdge,
  type SchemeNode,
} from '@/calculator/flow-solver-types';
import {
  portInputDemandRate,
  resolveSourceOutputPort,
  resolveTargetInputPort,
} from '@/calculator/port-resolution';

import {
  assignStartBufferInitialFlows,
  isSchemeBufferNode,
  isSchemeEndBuffer,
  isSchemeIntermediateBuffer,
  isSchemeStartBuffer,
  processIntermediateBufferIteration,
  processStartBufferIteration,
} from '@/calculator/buffer-solver';
import { collectInflowsByPort } from '@/calculator/flow-edge-assignment';

function rationalAbs(value: Rational): Rational {
  return value.compare(R.zero) < 0 ? value.mul(R.from(-1)) : value;
}

/** Rational form of CONVERGENCE_EPS (1e-9) — R.from(1e-9) fails on scientific notation. */
const CONVERGENCE_EPS_R = R.of(1, 1_000_000_000n);

interface OutputScaleParams {
  nodeId: string;
  allEdges: SchemeEdge[];
  edgeFlows: Record<string, Rational>;
  nodeEdges: SchemeEdge[];
  nodePortOutputRates: Record<string, Record<string, Rational>>;
  nodeById: Map<string, SchemeNode>;
  recipes: Map<string, Recipe>;
  tags: TagIndex;
  connectedOutPorts: Set<string>;
}

export function remainingTargetPortDemand(
  targetId: string,
  targetPort: string,
  targetRecipe: Recipe,
  targetTheoreticalPrimary: Rational,
  allEdges: SchemeEdge[],
  edgeFlows: Record<string, Rational>,
  tags: TagIndex,
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

export function computeOutputLimitedScale(
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

export function computePortDownstreamDemandByOutputPort(
  recipe: Recipe,
  nodeEdges: SchemeEdge[],
  nodePortOutputRates: Record<string, Record<string, Rational>>,
  nodeById: Map<string, SchemeNode>,
  recipes: Map<string, Recipe>,
  tags: TagIndex,
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

export function buildOutputScaleParams(
  nodeId: string,
  allEdges: SchemeEdge[],
  edgeFlows: Record<string, Rational>,
  outgoing: Map<string, SchemeEdge[]>,
  nodePortOutputRates: Record<string, Record<string, Rational>>,
  nodeById: Map<string, SchemeNode>,
  recipes: Map<string, Recipe>,
  tags: TagIndex,
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

export function computeEffectivePortRates(
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

export function assignOutgoingFromEffectiveRates(
  nodeId: string,
  nodeEdges: SchemeEdge[],
  allEdges: SchemeEdge[],
  recipe: Recipe,
  effectivePortRates: Record<string, Rational>,
  edgeFlows: Record<string, Rational>,
  nodePortOutputRates: Record<string, Record<string, Rational>>,
  nodeById: Map<string, SchemeNode>,
  recipes: Map<string, Recipe>,
  tags: TagIndex,
): Rational {
  let maxDelta = R.zero;
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
    const delta = rationalAbs(share.sub(prev));
    if (delta.compare(maxDelta) > 0) maxDelta = delta;
    edgeFlows[edgeId] = share;
  }

  return maxDelta;
}

export function computeConvergedFlows(
  edges: SchemeEdge[],
  nodePortOutputRates: Record<string, Record<string, Rational>>,
  incoming: Map<string, SchemeEdge[]>,
  outgoing: Map<string, SchemeEdge[]>,
  nodeById: Map<string, SchemeNode>,
  recipes: Map<string, Recipe>,
  tags: TagIndex,
  nodeOrder: string[],
  connectedInPortsByNode: Record<string, Set<string>>,
  connectedOutPortsByNode: Record<string, Set<string>>,
): { edgeFlows: Record<string, Rational>; converged: boolean } {
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

  let converged = true;

  for (let iter = 0; iter < MAX_FLOW_ITERATIONS; iter++) {
    let maxDelta = R.zero;
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
        if (R.from(delta).compare(maxDelta) > 0) maxDelta = R.from(delta);
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
        if (R.from(delta).compare(maxDelta) > 0) maxDelta = R.from(delta);
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
      if (delta.compare(maxDelta) > 0) maxDelta = delta;
    }
    if (maxDelta.compare(CONVERGENCE_EPS_R) < 0) break;
    if (iter === MAX_FLOW_ITERATIONS - 1) converged = false;
  }

  return { edgeFlows, converged };
}

/** Input-limited and output-scaled effective port rates in one pass (shared inflow work). */
export function computeEffectivePortRatesBoth(
  recipe: Recipe,
  theoreticalPortRates: Record<string, Rational>,
  inflowsByPort: Record<string, Rational>,
  connectedInPorts: Set<string>,
  outputScaleParams: OutputScaleParams,
): { inputLimited: Record<string, Rational>; effective: Record<string, Rational> } {
  const inputLimited = computeEffectivePortRates(
    recipe,
    theoreticalPortRates,
    inflowsByPort,
    connectedInPorts,
  );
  const effective = computeEffectivePortRates(
    recipe,
    theoreticalPortRates,
    inflowsByPort,
    connectedInPorts,
    outputScaleParams,
  );
  return { inputLimited, effective };
}
