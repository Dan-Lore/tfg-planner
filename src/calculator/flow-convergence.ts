import type { Recipe } from '@/data/types';
import type { TagIndex } from '@/shared/tag-index';
import { R, type Rational } from '@/calculator/rational';
import {
  MAX_FLOW_ITERATIONS,
  type SchemeEdge,
  type SchemeNode,
} from '@/calculator/flow-solver-types';
import { primaryOutputIndex as resolvePrimaryOutputIndex } from '@/shared/primary-output';
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
import {
  assignOutgoingFromEffectiveRates,
  buildOutputScaleParams,
  computeEffectivePortRates,
  type OutputScaleParams,
} from '@/calculator/convergence-port-rates';

/** Rational form of CONVERGENCE_EPS (1e-9) — R.from(1e-9) fails on scientific notation. */
const CONVERGENCE_EPS_R = R.of(1, 1_000_000_000n);

export {
  remainingTargetPortDemand,
  computeOutputLimitedScale,
  computePortDownstreamDemandByOutputPort,
  buildOutputScaleParams,
  computeEffectivePortRates,
  assignOutgoingFromEffectiveRates,
  type OutputScaleParams,
} from '@/calculator/convergence-port-rates';

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
  pinnedEdgeFlows?: ReadonlyMap<string, Rational>,
  bootstrapInflowByNodeId?: ReadonlyMap<string, Rational>,
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
    const primaryOutIdx = resolvePrimaryOutputIndex(node, recipe);
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
      primaryOutIdx,
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
      pinnedEdgeFlows,
    );
  }

  if (pinnedEdgeFlows) {
    for (const [edgeId, flow] of pinnedEdgeFlows) {
      edgeFlows[edgeId] = flow;
    }
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
          bootstrapInflowByNodeId,
        );
        if (R.from(delta).compare(maxDelta) > 0) maxDelta = R.from(delta);
        continue;
      }

      if (isSchemeEndBuffer(node)) continue;

      const recipe = recipes.get(node.recipeId);
      if (!recipe) continue;

      const primaryOutIdx = resolvePrimaryOutputIndex(node, recipe);
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
        primaryOutIdx,
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
        pinnedEdgeFlows,
      );
      if (delta.compare(maxDelta) > 0) maxDelta = delta;
    }
    if (pinnedEdgeFlows) {
      for (const [edgeId, flow] of pinnedEdgeFlows) {
        edgeFlows[edgeId] = flow;
      }
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
  primaryOutIdx = 0,
): {
  inputLimited: Record<string, Rational>;
  effective: Record<string, Rational>;
} {
  const inputLimited = computeEffectivePortRates(
    recipe,
    theoreticalPortRates,
    inflowsByPort,
    connectedInPorts,
    undefined,
    primaryOutIdx,
  );
  const effective = computeEffectivePortRates(
    recipe,
    theoreticalPortRates,
    inflowsByPort,
    connectedInPorts,
    outputScaleParams,
    primaryOutIdx,
  );
  return { inputLimited, effective };
}
