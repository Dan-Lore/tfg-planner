import type { PackData, Recipe } from '@/data/types';
import { R, type Rational } from './rational';
import { buildTagIndex } from '@/lib/tag-index';
import { productKey } from '@/lib/ports';
import { primaryOutputIndex } from '@/lib/primary-output';
import { buildAdjacency, topologicalOrder } from '@/calculator/flow-graph';
import {
  type FlowResult,
  type SolverInput,
} from '@/calculator/flow-solver-types';

export {
  CONVERGENCE_EPS,
  MAX_FLOW_ITERATIONS,
  TICKS_PER_SECOND,
  type FlowResult,
  type SchemeEdge,
  type SchemeNode,
  type SchemeNodeKind,
  type SchemeTarget,
  type SolverInput,
} from '@/calculator/flow-solver-types';

export { formatLoadPercent, formatRate } from '@/calculator/format';
export { portInputDemandRate } from '@/calculator/port-resolution';

import { collectInflowsByPort } from '@/calculator/flow-edge-assignment';
import {
  buildOutputScaleParams,
  computeConvergedFlows,
  computeEffectivePortRatesBoth,
  computePortDownstreamDemandByOutputPort,
} from '@/calculator/flow-convergence';
import { runMachineCountPhase } from '@/calculator/flow-machine-counts';
import {
  buildConnectedInPorts,
  buildConnectedOutPorts,
  computeNodeCurrentLoad,
  computeNodeMaxLoad,
  computeNodePortDeficit,
  computeNodePortInLoad,
  computeNodePortOutCapacityLoad,
  computeNodePortOutConsumerLoad,
  computeNodePortOutRecipeLoad,
  computeSurplusFromEffective,
} from '@/calculator/flow-result-metrics';
import {
  buildBufferNodeLoad,
  buildBufferPortOutputRates,
  buildBufferSurplus,
  collectBufferInflows,
  computeDownstreamDemand,
  computeIntermediateBufferEffectiveOut,
  computeStartBufferEffectiveOut,
  isSchemeBufferNode,
  isSchemeEndBuffer,
  isSchemeIntermediateBuffer,
  isSchemeStartBuffer,
} from '@/calculator/buffer-solver';

function recipeMap(pack: PackData): Map<string, Recipe> {
  return new Map(pack.recipes.map((r) => [r.id, r]));
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

  const order =
    topologicalOrder(
      input.nodes.map((n) => n.id),
      input.edges,
    ) ?? input.nodes.map((n) => n.id);

  const { nodeMachineCounts, nodePortOutputRates, nodeOutputRates } = runMachineCountPhase({
    nodes: input.nodes,
    edges: input.edges,
    targets: input.targets,
    preserveCounts,
    recipes,
    tags,
    nodeById,
    incoming,
    outgoing,
    order,
  });

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

  const { edgeFlows: convergedEdgeFlows, converged: flowConverged } = computeConvergedFlows(
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
        inputLimitedPortRatesByNode[node.id] = effectivePortRatesByNode[node.id]!;
        nodePortOutputRates[node.id] = effectivePortRatesByNode[node.id]!;
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
        inputLimitedPortRatesByNode[node.id] = effectivePortRatesByNode[node.id]!;
        nodePortOutputRates[node.id] = effectivePortRatesByNode[node.id]!;
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
    const primaryOutIdx = primaryOutputIndex(node, recipe);
    const { inputLimited, effective } = computeEffectivePortRatesBoth(
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
      primaryOutIdx,
    );
    inputLimitedPortRatesByNode[node.id] = inputLimited;
    effectivePortRatesByNode[node.id] = effective;
  }

  const machineNodes = input.nodes.filter((n) => !isSchemeBufferNode(n));
  const nodePortDeficit = computeNodePortDeficit(
    machineNodes,
    nodePortOutputRates,
    effectivePortRatesByNode,
    inflowsByNode,
    connectedInPortsByNode,
    recipes,
  );
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
    machineNodes,
    outgoing,
    inputLimitedPortRatesByNode,
    nodePortDownstreamDemand,
    convergedEdgeFlows,
    recipes,
  );

  const nodeInputRates: Record<string, Record<string, Rational>> = {};

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
          out_0:
            outflow.compare(R.zero) > 0 && inflow.compare(R.zero) > 0
              ? outflow.div(inflow)
              : R.zero,
        };
        nodePortOutRecipeLoad[node.id] = { ...nodePortOutLoad[node.id]! };
        nodePortOutConsumerLoad[node.id] = { ...nodePortOutLoad[node.id]! };
        nodePortOutCapacityLoad[node.id] = { ...nodePortOutLoad[node.id]! };
      } else if (isSchemeStartBuffer(node)) {
        nodePortOutLoad[node.id] = { out_0: bufferLoad };
        nodePortOutRecipeLoad[node.id] = { ...nodePortOutLoad[node.id]! };
        nodePortOutConsumerLoad[node.id] = { ...nodePortOutLoad[node.id]! };
        nodePortOutCapacityLoad[node.id] = { ...nodePortOutLoad[node.id]! };
      }
    }
  }

  for (const node of input.nodes) {
    if (isSchemeBufferNode(node)) continue;
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;
    nodeInputRates[node.id] = {};

    const primaryIdx = primaryOutputIndex(node, recipe);
    const primaryOut = recipe.outputs[primaryIdx];
    const primaryKey = primaryOut ? productKey(primaryOut) : '';
    const primaryOutRate = primaryOut
      ? (nodePortOutputRates[node.id]?.[`out_${primaryIdx}`] ?? R.zero)
      : R.zero;

    for (const inp of recipe.inputs) {
      const inKey = productKey(inp);
      const demand = primaryKey
        ? primaryOutRate.mul(R.from(inp.amount)).div(R.from(primaryOut!.amount))
        : R.zero;
      nodeInputRates[node.id]![inKey] = demand;
    }
  }

  const edgeTargetFlows: Record<string, Rational> = {};
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
    nonConverged: !flowConverged,
  };
}
