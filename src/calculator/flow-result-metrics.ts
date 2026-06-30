import type { Recipe } from '@/data/types';
import type { TagIndex } from '@/lib/tag-index';
import { Rational, R } from '@/calculator/rational';
import { productKey } from '@/lib/ports';
import {
  type SchemeEdge,
  type SchemeNode,
} from '@/calculator/flow-solver-types';
import {
  portInputDemandRate,
  resolveSourceOutputPort,
  resolveTargetInputPort,
} from '@/calculator/port-resolution';

import { isSchemeBufferNode, isSchemeStartBuffer, isSchemeIntermediateBuffer, resolveBufferTargetPort } from '@/calculator/buffer-solver';
export function computeNodePortDeficit(
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

export function capLoadFraction(inflow: Rational, demand: Rational): Rational {
  if (demand.compare(R.zero) <= 0) return R.from(1);
  const ratio = inflow.div(demand);
  return ratio.compare(R.from(1)) > 0 ? R.from(1) : ratio;
}

export function computeNodePortInLoad(
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

export function computeNodePortOutRecipeLoad(
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

export function computeNodePortOutConsumerLoad(
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

export function computeNodeMaxLoad(
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

export function computeNodePortOutCapacityLoad(
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

export function computeNodeCurrentLoad(
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

export function computeSurplusFromEffective(
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

export function buildConnectedInPorts(
  nodes: SchemeNode[],
  incoming: Map<string, SchemeEdge[]>,
  recipes: Map<string, Recipe>,
  tags: TagIndex,
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

export function buildConnectedOutPorts(
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
