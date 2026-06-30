import type { Recipe } from '@/data/types';
import type { TagIndex } from '@/lib/tag-index';
import { Rational, R } from '@/calculator/rational';
import { productKey } from '@/lib/ports';
import { primaryOutputIndex, primaryOutputProductKey } from '@/lib/primary-output';
import { recipeInputMatchesProduct } from '@/lib/flow-match';
import { ceilMachineCount, idealMachineCount } from '@/calculator/rounding';
import {
  buildStartBufferTheoreticalRates,
  isSchemeBufferNode,
  isSchemeStartBuffer,
} from '@/calculator/buffer-solver';
import { assignEdgeFlowsFromPorts } from '@/calculator/flow-edge-assignment';
import {
  buildNodePortOutputRates,
  perMachineOutputRate,
  sumPortRatesByProduct,
} from '@/calculator/flow-rates';
import type { SchemeEdge, SchemeNode, SchemeTarget } from '@/calculator/flow-solver-types';

function freezeManualMachineCounts(
  nodes: SchemeNode[],
  nodeMachineCounts: Record<string, number>,
): void {
  for (const node of nodes) {
    nodeMachineCounts[node.id] = Math.max(1, node.machineCount);
  }
}

function buildPortOutputRatesForNodes(
  nodes: SchemeNode[],
  nodeMachineCounts: Record<string, number>,
  recipes: Map<string, Recipe>,
): {
  nodePortOutputRates: Record<string, Record<string, Rational>>;
  nodeOutputRates: Record<string, Record<string, Rational>>;
} {
  const nodePortOutputRates: Record<string, Record<string, Rational>> = {};
  const nodeOutputRates: Record<string, Record<string, Rational>> = {};

  for (const node of nodes) {
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
    const factor = R.from(nodeMachineCounts[node.id]!);
    const portRates = buildNodePortOutputRates(recipe, node, factor);
    nodePortOutputRates[node.id] = portRates;
    nodeOutputRates[node.id] = sumPortRatesByProduct(recipe, portRates);
  }

  return { nodePortOutputRates, nodeOutputRates };
}

export interface MachineCountPhaseInput {
  nodes: SchemeNode[];
  edges: SchemeEdge[];
  targets: SchemeTarget[];
  preserveCounts: boolean;
  recipes: Map<string, Recipe>;
  tags: TagIndex;
  nodeById: Map<string, SchemeNode>;
  incoming: Map<string, SchemeEdge[]>;
  outgoing: Map<string, SchemeEdge[]>;
  order: string[];
}

export interface MachineCountPhaseResult {
  nodeMachineCounts: Record<string, number>;
  nodePortOutputRates: Record<string, Record<string, Rational>>;
  nodeOutputRates: Record<string, Record<string, Rational>>;
  edgeFlows: Record<string, Rational>;
}

export function runMachineCountPhase(input: MachineCountPhaseInput): MachineCountPhaseResult {
  const {
    nodes,
    edges,
    targets,
    preserveCounts,
    recipes,
    tags,
    nodeById,
    incoming,
    outgoing,
    order,
  } = input;

  const nodeMachineCounts: Record<string, number> = {};
  const requiredOutput: Record<string, Record<string, Rational>> = {};

  for (const node of nodes) {
    nodeMachineCounts[node.id] = Math.max(1, node.machineCount);
    requiredOutput[node.id] = {};
  }

  for (const target of targets) {
    const node = nodeById.get(target.nodeId);
    if (!node || isSchemeBufferNode(node)) continue;
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;
    const key = target.itemId ?? target.fluidId ?? '';
    if (!key) continue;

    const rate = R.from(target.ratePerSecond);
    requiredOutput[node.id]![key] = rate;

    if (!preserveCounts) {
      const perMachine = perMachineOutputRate(recipe, key, node);
      const ideal = idealMachineCount(rate, perMachine);
      nodeMachineCounts[node.id] = ceilMachineCount(ideal);
      node.machineCount = nodeMachineCounts[node.id]!;
    }
  }

  const reverseOrder = [...order].reverse();

  for (const nodeId of reverseOrder) {
    const node = nodeById.get(nodeId);
    if (!node || isSchemeBufferNode(node)) continue;
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;

    const outReq = requiredOutput[nodeId]!;
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

    const primaryKey = primaryOutputProductKey(node, recipe);
    const primaryOut = recipe.outputs[primaryOutputIndex(node, recipe)];
    if (!primaryOut) continue;
    const nodeOutRate =
      outReq[primaryKey] ??
      perMachineOutputRate(recipe, primaryKey, node).mul(R.from(nodeMachineCounts[nodeId]!));

    if (!outReq[primaryKey]) {
      requiredOutput[nodeId]![primaryKey] = nodeOutRate;
    }

    for (const inp of recipe.inputs) {
      const inKey = productKey(inp);
      const outAmount =
        recipe.outputs.find((o) => productKey(o) === primaryKey)?.amount ?? 1;
      const inRate = nodeOutRate.mul(R.from(inp.amount)).div(R.from(outAmount));
      for (const edge of incoming.get(nodeId) ?? []) {
        const edgeKey = edge.itemId ?? edge.fluidId ?? '';
        if (!recipeInputMatchesProduct(inKey, edgeKey, tags)) continue;
        const up = nodeById.get(edge.source);
        if (!up) continue;
        const upRecipe = recipes.get(up.recipeId);
        if (!upRecipe) continue;
        const upOutKey = primaryOutputProductKey(up, upRecipe);
        if (!requiredOutput[edge.source]![upOutKey]) {
          requiredOutput[edge.source]![upOutKey] = inRate;
        } else if (inRate.compare(requiredOutput[edge.source]![upOutKey]!) > 0) {
          requiredOutput[edge.source]![upOutKey] = inRate;
        }
      }
    }
  }

  let { nodePortOutputRates, nodeOutputRates } = buildPortOutputRatesForNodes(
    nodes,
    nodeMachineCounts,
    recipes,
  );

  const edgeFlows: Record<string, Rational> = {};
  assignEdgeFlowsFromPorts(
    edges,
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
        if (!requiredOutput[edge.target]![key]) {
          requiredOutput[edge.target]![key] = rate;
        }
        const perMachine = perMachineOutputRate(recipe, key, down);
        if (perMachine.compare(R.zero) > 0) {
          const ideal = idealMachineCount(rate, perMachine);
          const count = ceilMachineCount(ideal);
          if (count > nodeMachineCounts[edge.target]!) {
            nodeMachineCounts[edge.target] = count;
            down.machineCount = count;
          }
        }
      }
    }
  }

  if (preserveCounts) {
    freezeManualMachineCounts(nodes, nodeMachineCounts);
  }

  ({ nodePortOutputRates, nodeOutputRates } = buildPortOutputRatesForNodes(
    nodes,
    nodeMachineCounts,
    recipes,
  ));

  assignEdgeFlowsFromPorts(
    edges,
    outgoing,
    nodePortOutputRates,
    nodeById,
    recipes,
    edgeFlows,
  );

  return { nodeMachineCounts, nodePortOutputRates, nodeOutputRates, edgeFlows };
}
